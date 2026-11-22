import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { MEDIA_LIMITS } from '@wt/shared';

export type MediaKind = 'image' | 'video';

export interface MediaConfig {
  /** Готовые файлы, раздаются по `/media/`. */
  filesDir: string;
  /** Загрузки и промежуточные результаты; очищается при старте и недоступен по HTTP. */
  tmpDir: string;
  ffmpegPath: string;
  log: FastifyBaseLogger;
}

const FFMPEG_TIMEOUT_MS = 180_000;
const STDERR_LIMIT = 8 * 1024;
export const SNIFF_BYTES = 16;

/** Создаёт каталоги медиа и чистит tmp от остатков прерванных загрузок. */
export function prepareMedia(mediaDir: string, ffmpegPath: string, log: FastifyBaseLogger): MediaConfig {
  const config = { filesDir: path.join(mediaDir, 'files'), tmpDir: path.join(mediaDir, 'tmp'), ffmpegPath, log };
  fs.rmSync(config.tmpDir, { recursive: true, force: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });
  fs.mkdirSync(config.filesDir, { recursive: true });
  return config;
}

export const mediaFileName = (id: string, kind: MediaKind) => `${id}.${kind === 'image' ? 'webp' : 'mp4'}`;
export const thumbFileName = (id: string) => `${id}.thumb.webp`;

// MP4/MOV с этими brand — HEIC/AVIF-контейнеры, а не видео.
const IMAGE_BRANDS = new Set(['heic', 'heix', 'mif1', 'msf1', 'avif']);

/**
 * Определяет тип по сигнатуре (первые байты файла), а не по имени и заявленному MIME.
 * GIF считается видео: он превращается в MP4. Неподдерживаемое (в том числе HEIC) — null.
 */
export function detectMediaType(head: Buffer): MediaKind | null {
  const starts = (offset: number, text: string) =>
    head.subarray(offset, offset + text.length).toString('latin1') === text;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image'; // JPEG
  if (head[0] === 0x89 && starts(1, 'PNG')) return 'image';
  if (starts(0, 'RIFF') && starts(8, 'WEBP')) return 'image';
  if (starts(0, 'GIF8')) return 'video';
  if (starts(4, 'ftyp')) return IMAGE_BRANDS.has(head.subarray(8, 12).toString('latin1')) ? null : 'video'; // MP4/MOV
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video'; // WebM/MKV
  return null;
}

// Все задания ffmpeg идут по одному, чтобы не перегружать CPU контейнера.
let queue: Promise<unknown> = Promise.resolve();

function runFfmpeg(config: MediaConfig, args: string[]): Promise<void> {
  const job = () =>
    new Promise<void>((resolve, reject) => {
      // protocol_whitelist: ffmpeg определяет формат по содержимому, и без запрета файл-плейлист мог бы
      // заставить его читать чужие файлы или ходить в сеть.
      const base = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file'];
      const child = spawn(config.ffmpegPath, [...base, ...args], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < STDERR_LIMIT) stderr += chunk.toString();
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
      child.on('error', (error) => {
        clearTimeout(timer);
        config.log.error({ err: error }, 'не удалось запустить ffmpeg');
        reject(error);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (code === 0) return resolve();
        // stderr остаётся в логе: клиенту уходит только общее сообщение.
        config.log.warn({ code, signal, stderr }, 'ffmpeg завершился с ошибкой');
        reject(new Error(`ffmpeg: код ${code ?? signal}`));
      });
    });
  const result = queue.then(job);
  queue = result.catch(() => undefined);
  return result;
}

const IMAGE_FILTER = "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease";
const VIDEO_FILTER =
  "scale='min(720,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p";
const THUMB_FILTER = 'scale=320:320:force_original_aspect_ratio=increase,crop=320:320';

/**
 * Сжимает `input` в `main` (WebP для картинок, MP4 без звука для видео и GIF) и делает квадратную миниатюру `thumb`.
 * Бросает ошибку, если ffmpeg не смог обработать файл.
 */
export async function processMedia(config: MediaConfig, input: string, kind: MediaKind, main: string, thumb: string) {
  if (kind === 'image') {
    await runFfmpeg(config, [
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      IMAGE_FILTER,
      '-c:v',
      'libwebp',
      '-quality',
      '80',
      main,
    ]);
  } else {
    await runFfmpeg(config, [
      '-i',
      input,
      '-t',
      String(MEDIA_LIMITS.maxVideoSeconds),
      '-an',
      '-vf',
      VIDEO_FILTER,
      '-fpsmax',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      main,
    ]);
  }
  await runFfmpeg(config, [
    '-i',
    main,
    '-frames:v',
    '1',
    '-vf',
    THUMB_FILTER,
    '-c:v',
    'libwebp',
    '-quality',
    '70',
    thumb,
  ]);
}

/** Удаляет файлы, которых может не быть (ошибки игнорируются: это мусор, а не битая ссылка). */
export async function removeFiles(paths: string[]) {
  await Promise.all(paths.map((file) => fs.promises.rm(file, { force: true }).catch(() => undefined)));
}
