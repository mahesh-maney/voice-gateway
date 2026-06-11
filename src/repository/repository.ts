import type { User, Site, Scene, Appliance, ApplianceState } from '../domain/entities.js';

/**
 * Data access boundary. The in-memory implementation is used for the demo;
 * swap it for a real DB / device-registry client without touching the rest.
 *
 * All methods are async so both sync (in-memory) and async (PostgreSQL) impls
 * satisfy the same interface.
 */
export interface Repository {
  getUserByAccessToken(token: string): Promise<User | undefined>;
  getUserByPlatformId(platform: string, platformUserId: string): Promise<User | undefined>;

  getSitesForUser(userId: string): Promise<Site[]>;
  getDefaultSite(userId: string): Promise<Site | undefined>;

  getScenesForSite(siteId: string): Promise<Scene[]>;
  getAppliancesForScene(sceneId: string): Promise<Appliance[]>;

  getAppliance(applianceId: string): Promise<Appliance | undefined>;
  updateApplianceState(applianceId: string, patch: Partial<ApplianceState>): Promise<Appliance | undefined>;

  /** Optional liveness check — used by the /health endpoint. */
  ping?(): Promise<void>;
  /** Optional teardown — close DB connections on shutdown. */
  close?(): Promise<void>;
}
