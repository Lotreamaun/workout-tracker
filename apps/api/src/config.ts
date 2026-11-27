import { createECDH } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { REST_PUSH_LIMITS } from '@wt/shared';
import type { VapidConfig } from './modules/rest-push/transport';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** base64url-ключ заданного размера в байтах (VAPID P-256). */
function isBase64UrlKey(value: string, expectedBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  return Buffer.from(value, 'base64url').length === expectedBytes;
}

function isMatchingVapidPair(publicKey: string, privateKey: string): boolean {
  try {
    const curve = createECDH('prime256v1');
    curve.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    return curve.getPublicKey('base64url') === publicKey;
  } catch {
    return false;
  }
}

function isVapidContact(value: string): boolean {
  const contact = URL.parse(value);
  if (!contact) return false;
  if (contact.protocol === 'https:') {
    const host = contact.hostname.replace(/\.$/, '');
    return Boolean(host) && host !== 'localhost' && !host.endsWith('.localhost') && !contact.username && !contact.password;
  }
  return contact.protocol === 'mailto:' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.pathname) &&
    !contact.pathname.toLowerCase().endsWith('.localhost');
}

const optionalVapidValue = z.string().trim().max(REST_PUSH_LIMITS.vapidMaxChars).optional().transform((value) => value || undefined);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DB_PATH: z.string().min(1).default('data/workout-tracker.db'),
  // Каталог со сборкой фронтенда (apps/web/dist): если задан, api раздаёт и веб-приложение.
  WEB_DIST: z.string().min(1).optional(),
  // Общий ключ доступа к /api (пустое значение = защита выключена).
  API_TOKEN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  // Каталог медиа упражнений (files/ и tmp/); по умолчанию рядом с БД.
  MEDIA_DIR: z.string().min(1).default('data/media'),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CORS_ALLOW_PRIVATE_NETWORK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Web Push (уведомления об окончании отдыха): все три значения задаются вместе или не задаются вовсе.
  VAPID_PUBLIC_KEY: optionalVapidValue,
  VAPID_PRIVATE_KEY: optionalVapidValue,
  VAPID_SUBJECT: optionalVapidValue,
}).superRefine((env, ctx) => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (VAPID_PUBLIC_KEY === undefined && VAPID_PRIVATE_KEY === undefined && VAPID_SUBJECT === undefined) return;
  if (VAPID_PUBLIC_KEY === undefined || VAPID_PRIVATE_KEY === undefined || VAPID_SUBJECT === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'VAPID_*: задайте все три значения (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) или ни одно',
    });
    return;
  }
  // Публичный ключ VAPID — base64url несжатой точки P-256 (65 байт), приватный — 32 байта.
  const validPublicKey = isBase64UrlKey(VAPID_PUBLIC_KEY, 65);
  const validPrivateKey = isBase64UrlKey(VAPID_PRIVATE_KEY, 32);
  if (!validPublicKey) {
    ctx.addIssue({ code: 'custom', message: 'VAPID_PUBLIC_KEY: base64url-ключ P-256 (65 байт), например из npx web-push generate-vapid-keys' });
  }
  if (!validPrivateKey) {
    ctx.addIssue({ code: 'custom', message: 'VAPID_PRIVATE_KEY: base64url приватного ключа P-256 (32 байта)' });
  }
  if (validPublicKey && validPrivateKey && !isMatchingVapidPair(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)) {
    ctx.addIssue({ code: 'custom', message: 'VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY должны составлять одну пару' });
  }
  // По RFC 8292 subject — mailto: или https-адрес.
  if (!isVapidContact(VAPID_SUBJECT)) {
    ctx.addIssue({ code: 'custom', message: 'VAPID_SUBJECT: действующий адрес mailto: или https:// без localhost' });
  }
});

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  webDist?: string;
  apiToken?: string;
  mediaDir: string;
  ffmpegPath: string;
  corsOrigins: string[];
  corsAllowPrivateNetwork: boolean;
  vapid?: VapidConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения: ${z.prettifyError(parsed.error)}`);
  }
  const { PORT, HOST, DB_PATH, WEB_DIST, API_TOKEN, MEDIA_DIR, FFMPEG_PATH, CORS_ORIGINS, CORS_ALLOW_PRIVATE_NETWORK } =
    parsed.data;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = parsed.data;
  return {
    port: PORT,
    host: HOST,
    dbPath: path.resolve(repoRoot, DB_PATH),
    webDist: WEB_DIST ? path.resolve(repoRoot, WEB_DIST) : undefined,
    apiToken: API_TOKEN,
    mediaDir: path.resolve(repoRoot, MEDIA_DIR),
    ffmpegPath: FFMPEG_PATH,
    corsOrigins: CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    corsAllowPrivateNetwork: CORS_ALLOW_PRIVATE_NETWORK,
    vapid:
      VAPID_PUBLIC_KEY !== undefined
        ? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY!, subject: VAPID_SUBJECT! }
        : undefined,
  };
}
