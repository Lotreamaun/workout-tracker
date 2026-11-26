import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { ERROR_CODES, MEDIA_LIMITS, exerciseNameKey, type Exercise, type ExerciseMedia } from '@wt/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { exercises } from '../../db/schema';
import { AppError } from '../../plugins/errors';
import {
  SNIFF_BYTES,
  detectMediaType,
  mediaFileName,
  processMedia,
  removeFiles,
  thumbFileName,
  type MediaConfig,
} from './media';
import * as repo from './repository';

/** Упражнения библиотеки по ключу названия; общий вид для ответов шаблонов и сессий. */
export type ExerciseLibrary = Map<string, Exercise>;

const collator = new Intl.Collator('ru');

function toMedia(row: repo.MediaRow): ExerciseMedia {
  return {
    id: row.id,
    kind: row.kind,
    url: `/media/${mediaFileName(row.id, row.kind)}`,
    thumbUrl: `/media/${thumbFileName(row.id)}`,
  };
}

function groupMedia(rows: repo.MediaRow[]): Map<string, ExerciseMedia[]> {
  const byExercise = new Map<string, ExerciseMedia[]>();
  for (const row of rows) {
    const list = byExercise.get(row.exerciseId);
    if (list) list.push(toMedia(row));
    else byExercise.set(row.exerciseId, [toMedia(row)]);
  }
  return byExercise;
}

function toExercises(rows: repo.ExerciseRow[], media: repo.MediaRow[]): Exercise[] {
  const byExercise = groupMedia(media);
  return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, media: byExercise.get(row.id) ?? [] }));
}

function notFound(): never {
  throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Упражнение не найдено');
}

/** Добавляет в библиотеку названия, которых там ещё нет (вызывать внутри транзакции записи шаблона). */
export function ensureExercises(tx: repo.DbOrTx, items: { name: string; description: string | null }[]): void {
  const now = new Date().toISOString();
  const rows = new Map<string, { id: string; name: string; nameKey: string; description: string | null; createdAt: string }>();
  for (const item of items) {
    const nameKey = exerciseNameKey(item.name);
    // Первое появление определяет отображаемое название; описание заполняется, если ещё не задано.
    if (nameKey && !rows.has(nameKey))
      rows.set(nameKey, { id: randomUUID(), name: item.name.trim(), nameKey, description: item.description, createdAt: now });
  }
  repo.insertExercisesIgnore(tx, [...rows.values()]);
  // Дозаполняем описание у уже существующих записей библиотеки, если оно было пустым.
  for (const item of items) {
    const nameKey = exerciseNameKey(item.name);
    if (!nameKey || !item.description) continue;
    tx.update(exercises).set({ description: item.description })
      .where(and(eq(exercises.nameKey, nameKey), sql`${exercises.description} IS NULL`))
      .run();
  }
}

/** Идемпотентное наполнение библиотеки названиями и описаниями всех существующих шаблонов (при старте api). */
export function backfillExercises(db: Db): void {
  db.transaction((tx) => {
    const byName = new Map<string, { name: string; description: string | null }>();
    for (const { name, description } of repo.listWorkoutExercisesForBackfill(tx)) {
      const nameKey = exerciseNameKey(name);
      if (!nameKey) continue;
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, { name: name.trim(), description });
      } else if (!existing.description && description) {
        existing.description = description;
      }
    }
    ensureExercises(tx, [...byName.values()]);
  });
}

/** Упражнения библиотеки с медиа по названиям: два запроса независимо от числа названий. */
export function resolveExercises(db: repo.DbOrTx, names: string[]): ExerciseLibrary {
  const keys = [...new Set(names.map(exerciseNameKey))];
  const library: ExerciseLibrary = new Map();
  if (keys.length === 0) return library;

  const rows = repo.findExerciseRowsByKeys(db, keys);
  if (rows.length === 0) return library;
  const exercises = toExercises(
    rows,
    repo.listMediaRows(
      db,
      rows.map((row) => row.id),
    ),
  );
  rows.forEach((row, index) => library.set(row.nameKey, exercises[index]!));
  return library;
}

export function listExercises(db: Db): Exercise[] {
  return toExercises(repo.listExerciseRows(db), repo.listMediaRows(db)).sort((a, b) =>
    collator.compare(a.name, b.name),
  );
}

export function getExercise(db: repo.DbOrTx, id: string): Exercise {
  const row = repo.findExerciseRow(db, id);
  if (!row) notFound();
  return toExercises([row], repo.listMediaRows(db, [id]))[0]!;
}

/** Удаляет упражнение библиотеки и файлы его медиа; шаблоны и сессии не меняются. */
export async function deleteExercise(db: Db, media: MediaConfig, id: string): Promise<void> {
  const files = db.transaction((tx) => {
    if (!repo.findExerciseRow(tx, id)) notFound();
    const rows = repo.listMediaRows(tx, [id]);
    repo.deleteExerciseRow(tx, id); // медиа удаляется каскадом
    return rows;
  });
  await removeFiles(files.flatMap((row) => mediaPaths(media, row.id, row.kind)));
}

function mediaPaths(media: MediaConfig, id: string, kind: repo.MediaRow['kind']) {
  return [path.join(media.filesDir, mediaFileName(id, kind)), path.join(media.filesDir, thumbFileName(id))];
}

export async function deleteMedia(db: Db, media: MediaConfig, exerciseId: string, mediaId: string): Promise<Exercise> {
  const row = repo.findMediaRow(db, exerciseId, mediaId);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Медиа не найдено');
  // Сначала строка, потом файлы: неудалённый файл — мусор, а не битая ссылка.
  repo.deleteMediaRow(db, mediaId);
  await removeFiles(mediaPaths(media, row.id, row.kind));
  return getExercise(db, exerciseId);
}

function unsupported(message: string): never {
  throw new AppError(ERROR_CODES.MEDIA_UNSUPPORTED, 415, message);
}

function tooLarge(): never {
  throw new AppError(ERROR_CODES.MEDIA_TOO_LARGE, 413, 'Файл больше 100 МБ');
}

/** Поток загрузки multipart: при превышении лимита обрывается и получает `truncated`. */
export type UploadStream = Readable & { truncated?: boolean };

/** Проверки, не требующие файла: упражнение есть и лимит медиа не исчерпан. Повторяется внутри транзакции вставки. */
function assertCanAdd(db: repo.DbOrTx, exerciseId: string) {
  if (!repo.findExerciseRow(db, exerciseId)) notFound();
  if (repo.countMedia(db, exerciseId) >= MEDIA_LIMITS.maxPerExercise) {
    throw new AppError(
      ERROR_CODES.MEDIA_LIMIT_REACHED,
      409,
      `У упражнения уже ${MEDIA_LIMITS.maxPerExercise} медиа — удалите лишнее`,
    );
  }
}

async function saveUpload(stream: UploadStream, target: string) {
  try {
    await pipeline(stream, fs.createWriteStream(target));
  } catch (error) {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') tooLarge();
    throw error;
  }
  if (stream.truncated) tooLarge();
}

async function sniff(file: string) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const head = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
    return detectMediaType(head.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * Принимает файл, сжимает его через ffmpeg и прикрепляет к упражнению.
 * `getFile` вызывается после проверок 404/409, чтобы лишний файл даже не читался.
 * При любой ошибке в БД и на диске ничего не остаётся.
 */
export async function addMedia(
  db: Db,
  media: MediaConfig,
  exerciseId: string,
  getFile: () => Promise<UploadStream | undefined>,
): Promise<Exercise> {
  assertCanAdd(db, exerciseId);
  const stream = await getFile();
  if (!stream) unsupported('Файл не передан');

  const id = randomUUID();
  const tmp = (suffix: string) => path.join(media.tmpDir, `${id}${suffix}`);
  const upload = tmp('.upload');
  let committed = false;
  let finals: string[] = [];
  try {
    await saveUpload(stream, upload);
    const kind = await sniff(upload);
    if (!kind) unsupported('Поддерживаются JPEG, PNG, WebP, GIF, MP4, MOV и WebM');

    const mainName = mediaFileName(id, kind);
    const thumbName = thumbFileName(id);
    finals = [path.join(media.filesDir, mainName), path.join(media.filesDir, thumbName)];
    try {
      await processMedia(media, upload, kind, tmp(path.extname(mainName)), tmp('.thumb.webp'));
    } catch {
      throw new AppError(ERROR_CODES.MEDIA_PROCESSING_FAILED, 422, 'Не удалось обработать файл');
    }

    // Строка и перенос файлов — одна синхронная транзакция: лимит проверяется заново (за время сжатия
    // могли завершиться параллельные загрузки), а упавший rename откатывает вставку.
    db.transaction((tx) => {
      assertCanAdd(tx, exerciseId);
      repo.insertMediaRow(tx, { id, exerciseId, kind, createdAt: new Date().toISOString() });
      fs.renameSync(tmp(path.extname(mainName)), finals[0]!);
      fs.renameSync(tmp('.thumb.webp'), finals[1]!);
    });
    committed = true;
  } finally {
    await removeFiles([upload, tmp('.webp'), tmp('.mp4'), tmp('.thumb.webp'), ...(committed ? [] : finals)]);
  }
  return getExercise(db, exerciseId);
}
