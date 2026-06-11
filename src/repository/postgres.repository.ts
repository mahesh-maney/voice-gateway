import type { Sql } from 'postgres';
import type { Repository } from './repository.js';
import type { User, Site, Scene, Appliance, ApplianceState } from '../domain/entities.js';

/**
 * PostgreSQL-backed repository.
 *
 * Accepts a shared postgres.js Sql client (created once in composition.ts so
 * the connection pool is shared with PostgresCommandLog).
 *
 * All queries use indexed lookups — no full-table scans.
 */
export class PostgresRepository implements Repository {
  constructor(private readonly sql: Sql) {}

  async getUserByAccessToken(token: string): Promise<User | undefined> {
    const rows = await this.sql<DbUser[]>`
      SELECT id, name, access_token, platform_user_ids
      FROM users WHERE access_token = ${token} LIMIT 1
    `;
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  async getUserByPlatformId(platform: string, platformUserId: string): Promise<User | undefined> {
    // JSONB text extraction: platform_user_ids->>'alexa' = $2
    const rows = await this.sql<DbUser[]>`
      SELECT id, name, access_token, platform_user_ids
      FROM users WHERE platform_user_ids->>${platform} = ${platformUserId} LIMIT 1
    `;
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  async getSitesForUser(userId: string): Promise<Site[]> {
    const rows = await this.sql<DbSite[]>`
      SELECT id, name, user_id, is_default FROM sites WHERE user_id = ${userId}
    `;
    return rows.map(toSite);
  }

  async getDefaultSite(userId: string): Promise<Site | undefined> {
    const rows = await this.sql<DbSite[]>`
      SELECT id, name, user_id, is_default FROM sites
      WHERE user_id = ${userId}
      ORDER BY is_default DESC LIMIT 1
    `;
    return rows[0] ? toSite(rows[0]) : undefined;
  }

  async getScenesForSite(siteId: string): Promise<Scene[]> {
    const rows = await this.sql<DbScene[]>`
      SELECT id, name, site_id FROM scenes WHERE site_id = ${siteId}
    `;
    return rows.map(toScene);
  }

  async getAppliancesForScene(sceneId: string): Promise<Appliance[]> {
    const rows = await this.sql<DbAppliance[]>`
      SELECT id, name, type, scene_id, capabilities, state
      FROM appliances WHERE scene_id = ${sceneId}
    `;
    return rows.map(toAppliance);
  }

  async getAppliance(applianceId: string): Promise<Appliance | undefined> {
    const rows = await this.sql<DbAppliance[]>`
      SELECT id, name, type, scene_id, capabilities, state
      FROM appliances WHERE id = ${applianceId} LIMIT 1
    `;
    return rows[0] ? toAppliance(rows[0]) : undefined;
  }

  async updateApplianceState(
    applianceId: string,
    patch: Partial<ApplianceState>,
  ): Promise<Appliance | undefined> {
    // JSONB merge operator || deep-merges the patch into existing state.
    const rows = await this.sql<DbAppliance[]>`
      UPDATE appliances
      SET state = state || ${this.sql.json(patch as never)}
      WHERE id = ${applianceId}
      RETURNING id, name, type, scene_id, capabilities, state
    `;
    return rows[0] ? toAppliance(rows[0]) : undefined;
  }

  async ping(): Promise<void> {
    await this.sql`SELECT 1`;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

// ---------------------------------------------------------------------------
// DB row types (snake_case as stored) → domain types (camelCase)
// ---------------------------------------------------------------------------

interface DbUser {
  id: string;
  name: string;
  access_token: string;
  platform_user_ids: Record<string, string>;
}

interface DbSite {
  id: string;
  name: string;
  user_id: string;
  is_default: boolean;
}

interface DbScene {
  id: string;
  name: string;
  site_id: string;
}

interface DbAppliance {
  id: string;
  name: string;
  type: string;
  scene_id: string;
  capabilities: string[];
  state: ApplianceState;
}

function toUser(r: DbUser): User {
  return {
    id: r.id,
    name: r.name,
    accessToken: r.access_token,
    platformUserIds: r.platform_user_ids as User['platformUserIds'],
  };
}

function toSite(r: DbSite): Site {
  return { id: r.id, name: r.name, userId: r.user_id, isDefault: r.is_default };
}

function toScene(r: DbScene): Scene {
  return { id: r.id, name: r.name, siteId: r.site_id };
}

function toAppliance(r: DbAppliance): Appliance {
  return {
    id: r.id,
    name: r.name,
    type: r.type as Appliance['type'],
    sceneId: r.scene_id,
    capabilities: r.capabilities as Appliance['capabilities'],
    state: r.state,
  };
}
