import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApiErrorBody, Exercise, Workout } from '@wt/shared';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';

type App = ReturnType<typeof buildApp>;

const BOUNDARY = '----wt-test-boundary-7d1f2a';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function multipart(fileName: string, content: Buffer, mimeType = 'application/octet-stream') {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

const emptyMultipart = () => ({
  payload: Buffer.from(`--${BOUNDARY}--\r\n`),
  contentType: `multipart/form-data; boundary=${BOUNDARY}`,
});

const dimensions = (file: string): string[] =>
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  })
    .trim()
    .split(',');

describe.skipIf(!hasFfmpeg)('медиа упражнений (API)', () => {
  let rootDir: string;
  let fixtureDir: string;
  let gifPath: string;
  let bigJpgPath: string;
  let smallJpgPath: string;

  let dir: string;
  let dbPath: string;
  let mediaDir: string;
  let filesDir: string;
  let tmpDir: string;
  let app: App;
  let exerciseId: string;

  beforeAll(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-media-'));
    fixtureDir = path.join(rootDir, 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    gifPath = path.join(fixtureDir, 'test.gif');
    bigJpgPath = path.join(fixtureDir, 'big.jpg');
    smallJpgPath = path.join(fixtureDir, 'small.jpg');

    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '1', '-y', gifPath],
      { stdio: 'pipe' },
    );
    // Однотонный источник: 4000×3000, но меньше лимита загрузки в тесте (200 КБ).
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=4000x3000', '-frames:v', '1', '-y', bigJpgPath], {
      stdio: 'pipe',
    });
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64', '-frames:v', '1', '-y', smallJpgPath], {
      stdio: 'pipe',
    });
  }, 60_000);

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(rootDir, 'case-'));
    dbPath = path.join(dir, 'test.db');
    mediaDir = path.join(dir, 'media');
    filesDir = path.join(mediaDir, 'files');
    tmpDir = path.join(mediaDir, 'tmp');
    app = buildApp({ dbPath, mediaDir, mediaMaxUploadBytes: 200_000 });
    exerciseId = await makeExercise('Присед');
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function makeExercise(name: string): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      payload: { name: `Шаблон ${name}`, exercises: [{ name, plannedSets: 2 }] },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as Workout).exercises[0]?.exerciseId;
    expect(id).toBeTruthy();
    return id!;
  }

  function upload(fileName: string, content: Buffer, mimeType = 'application/octet-stream', id = exerciseId) {
    const body = multipart(fileName, content, mimeType);
    return app.inject({
      method: 'POST',
      url: `/api/exercises/${id}/media`,
      headers: { 'content-type': body.contentType },
      payload: body.payload,
    });
  }

  function uploadFixture(file: string, id = exerciseId) {
    return upload(path.basename(file), fs.readFileSync(file), 'application/octet-stream', id);
  }

  it('GIF → 201 kind=video, файлы отдаются с video/mp4 и immutable', async () => {
    const res = await uploadFixture(gifPath);
    expect(res.statusCode).toBe(201);
    const exercise = res.json() as Exercise;
    expect(exercise.media).toHaveLength(1);
    expect(exercise.media[0]).toMatchObject({ kind: 'video' });

    const media = exercise.media[0]!;
    expect(media.url).toMatch(/^\/media\/[0-9a-f-]{36}\.mp4$/);
    expect(media.thumbUrl).toMatch(/^\/media\/[0-9a-f-]{36}\.thumb\.webp$/);

    const file = await app.inject({ method: 'GET', url: media.url });
    expect(file.statusCode).toBe(200);
    expect(String(file.headers['content-type'])).toContain('video/mp4');
    expect(String(file.headers['cache-control'])).toContain('immutable');

    const thumb = await app.inject({ method: 'GET', url: media.thumbUrl });
    expect(thumb.statusCode).toBe(200);
    expect(String(thumb.headers['content-type'])).toContain('image/webp');
  }, 30_000);

  it('Range-запрос bytes=0-1 к видео возвращает 206 и два байта', async () => {
    const uploaded = await uploadFixture(gifPath);
    expect(uploaded.statusCode).toBe(201);
    const url = (uploaded.json() as Exercise).media[0]!.url;

    const res = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-1' } });

    expect(res.statusCode).toBe(206);
    expect(res.rawPayload).toHaveLength(2);
  }, 30_000);

  it('JPEG 4000x3000 → WebP 1280x960 и квадратная миниатюра 320x320', async () => {
    const res = await uploadFixture(bigJpgPath);
    expect(res.statusCode).toBe(201);
    const media = (res.json() as Exercise).media[0]!;
    expect(media.kind).toBe('image');

    expect(dimensions(path.join(filesDir, path.basename(media.url)))).toEqual(['1280', '960']);
    expect(dimensions(path.join(filesDir, path.basename(media.thumbUrl)))).toEqual(['320', '320']);
  }, 30_000);

  it('текст под именем x.gif → 415 MEDIA_UNSUPPORTED', async () => {
    const res = await upload('x.gif', Buffer.from('это не медиа, а текст'), 'image/gif');

    expect(res.statusCode).toBe(415);
    expect((res.json() as ApiErrorBody).error.code).toBe('MEDIA_UNSUPPORTED');
    const exercise = await app.inject({ method: 'GET', url: `/api/exercises/${exerciseId}` });
    expect((exercise.json() as Exercise).media).toEqual([]);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  }, 30_000);

  it('запрос без файла → 415 MEDIA_UNSUPPORTED', async () => {
    const body = emptyMultipart();
    const res = await app.inject({
      method: 'POST',
      url: `/api/exercises/${exerciseId}/media`,
      headers: { 'content-type': body.contentType },
      payload: body.payload,
    });

    expect(res.statusCode).toBe(415);
    expect((res.json() as ApiErrorBody).error.code).toBe('MEDIA_UNSUPPORTED');
  }, 30_000);

  it('файл больше mediaMaxUploadBytes → 413 MEDIA_TOO_LARGE', async () => {
    const res = await upload('too-big.jpg', Buffer.alloc(200_001, 0x41), 'image/jpeg');

    expect(res.statusCode).toBe(413);
    expect((res.json() as ApiErrorBody).error.code).toBe('MEDIA_TOO_LARGE');
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  }, 30_000);

  it('шестой файл → 409 MEDIA_LIMIT_REACHED, медиа остаётся пять', async () => {
    for (let index = 0; index < 5; index += 1) {
      const uploaded = await uploadFixture(smallJpgPath);
      expect(uploaded.statusCode).toBe(201);
    }

    const res = await uploadFixture(smallJpgPath);
    expect(res.statusCode).toBe(409);
    expect((res.json() as ApiErrorBody).error.code).toBe('MEDIA_LIMIT_REACHED');

    const exercise = await app.inject({ method: 'GET', url: `/api/exercises/${exerciseId}` });
    expect((exercise.json() as Exercise).media).toHaveLength(5);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  }, 60_000);

  it('удаление медиа уменьшает список и делает старые файлы недоступными', async () => {
    const first = await uploadFixture(smallJpgPath);
    const second = await uploadFixture(smallJpgPath);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const [firstMedia, secondMedia] = [
      (first.json() as Exercise).media[0]!,
      (second.json() as Exercise).media.at(-1)!,
    ];

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exercises/${exerciseId}/media/${firstMedia.id}`,
    });
    expect(res.statusCode).toBe(200);
    const remaining = (res.json() as Exercise).media;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(secondMedia.id);

    for (const url of [firstMedia.url, firstMedia.thumbUrl]) {
      const gone = await app.inject({ method: 'GET', url });
      expect(gone.statusCode).toBe(404);
    }
  }, 60_000);

  it('удаление медиа чужого упражнения → 404 NOT_FOUND', async () => {
    const otherId = await makeExercise('Тяга');
    const uploaded = await uploadFixture(smallJpgPath, otherId);
    expect(uploaded.statusCode).toBe(201);
    const mediaId = (uploaded.json() as Exercise).media[0]!.id;

    const res = await app.inject({ method: 'DELETE', url: `/api/exercises/${exerciseId}/media/${mediaId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');

    const other = await app.inject({ method: 'GET', url: `/api/exercises/${otherId}` });
    expect((other.json() as Exercise).media).toHaveLength(1);
  }, 30_000);

  it('/media/unknown.mp4 → 404 и не index.html даже с webDist', async () => {
    const missing = await app.inject({ method: 'GET', url: '/media/unknown.mp4' });
    expect(missing.statusCode).toBe(404);

    await app.close();
    const webDist = path.join(dir, 'web');
    fs.mkdirSync(webDist, { recursive: true });
    fs.writeFileSync(path.join(webDist, 'index.html'), '<html>SPA fallback</html>');
    app = buildApp({ dbPath, mediaDir, webDist, mediaMaxUploadBytes: 200_000 });

    const withSpa = await app.inject({ method: 'GET', url: '/media/unknown.mp4' });
    expect(withSpa.statusCode).toBe(404);
    expect(withSpa.body).not.toContain('SPA fallback');
  }, 30_000);

  it('после ошибок каталог tmp пуст', async () => {
    const badType = await upload('x.gif', Buffer.from('не медиа'), 'image/gif');
    const noFile = emptyMultipart();
    const noFileRes = await app.inject({
      method: 'POST',
      url: `/api/exercises/${exerciseId}/media`,
      headers: { 'content-type': noFile.contentType },
      payload: noFile.payload,
    });
    const tooLarge = await upload('too-big.jpg', Buffer.alloc(200_001, 0x41), 'image/jpeg');

    expect([badType.statusCode, noFileRes.statusCode, tooLarge.statusCode]).toEqual([415, 415, 413]);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  }, 30_000);

  it('загрузка к неизвестному упражнению → 404 NOT_FOUND', async () => {
    const res = await uploadFixture(smallJpgPath, crypto.randomUUID());

    expect(res.statusCode).toBe(404);
    expect((res.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  }, 30_000);

  it('удаление упражнения удаляет файлы его медиа', async () => {
    const uploaded = await uploadFixture(smallJpgPath);
    expect(uploaded.statusCode).toBe(201);
    const media = (uploaded.json() as Exercise).media[0]!;

    const res = await app.inject({ method: 'DELETE', url: `/api/exercises/${exerciseId}` });
    expect(res.statusCode).toBe(204);

    for (const url of [media.url, media.thumbUrl]) {
      const gone = await app.inject({ method: 'GET', url });
      expect(gone.statusCode).toBe(404);
      expect(fs.existsSync(path.join(filesDir, path.basename(url)))).toBe(false);
    }
  }, 30_000);
});
