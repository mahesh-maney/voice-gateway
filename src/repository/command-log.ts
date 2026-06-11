import type { CanonicalResult } from '../domain/canonical-result.js';
import type { Sql } from 'postgres';
import { logger } from '../util/logger.js';

/**
 * Idempotency log — records every command that has been executed so a
 * replayed request (same commandId) returns the original result rather than
 * executing the IoT action a second time.
 */
export interface CommandLog {
  find(commandId: string): Promise<CanonicalResult | undefined>;
  record(commandId: string, result: CanonicalResult): Promise<void>;
}

/** In-process store — used in development / tests. Resets on restart. */
export class InMemoryCommandLog implements CommandLog {
  private readonly store = new Map<string, CanonicalResult>();

  async find(commandId: string): Promise<CanonicalResult | undefined> {
    const hit = this.store.get(commandId);
    logger.debug('commandLog.find', { commandId, hit: !!hit, store: 'memory' });
    return hit;
  }

  async record(commandId: string, result: CanonicalResult): Promise<void> {
    this.store.set(commandId, result);
    logger.debug('commandLog.record', { commandId, action: result.action, status: result.status, store: 'memory' });
  }
}

/** Postgres-backed log — survives restarts and is shared across instances. */
export class PostgresCommandLog implements CommandLog {
  constructor(private readonly sql: Sql) {}

  async find(commandId: string): Promise<CanonicalResult | undefined> {
    const rows = await this.sql<{ result: CanonicalResult }[]>`
      SELECT result FROM command_log WHERE command_id = ${commandId} LIMIT 1
    `;
    const hit = rows[0]?.result;
    logger.debug('commandLog.find', { commandId, hit: !!hit, store: 'postgres' });
    return hit;
  }

  async record(commandId: string, result: CanonicalResult): Promise<void> {
    await this.sql`
      INSERT INTO command_log (command_id, result)
      VALUES (${commandId}, ${this.sql.json(result as never)})
      ON CONFLICT (command_id) DO NOTHING
    `;
    logger.debug('commandLog.record', { commandId, action: result.action, status: result.status, store: 'postgres' });
  }
}
