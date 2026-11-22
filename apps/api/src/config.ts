import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DB_PATH: z.string().min(1).default('data/workout-tracker.db'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CORS_ALLOW_PRIVATE_NETWORK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  corsOrigins: string[];
  corsAllowPrivateNetwork: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения: ${z.prettifyError(parsed.error)}`);
  }
  const { PORT, HOST, DB_PATH, CORS_ORIGINS, CORS_ALLOW_PRIVATE_NETWORK } = parsed.data;
  return {
    port: PORT,
    host: HOST,
    dbPath: path.resolve(repoRoot, DB_PATH),
    corsOrigins: CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    corsAllowPrivateNetwork: CORS_ALLOW_PRIVATE_NETWORK,
  };
}
