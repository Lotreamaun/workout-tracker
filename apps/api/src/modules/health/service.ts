import { sql } from 'drizzle-orm';
import type { HealthResponse } from '@wt/shared';
import type { Db } from '../../db/client';

export function checkHealth(db: Db): HealthResponse {
  db.get(sql`select 1`);
  return { status: 'ok', time: new Date().toISOString() };
}
