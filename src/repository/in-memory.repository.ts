import type { Repository } from './repository.js';
import type { User, Site, Scene, Appliance, ApplianceState } from '../domain/entities.js';
import { users, sites, scenes, appliances } from './seed-data.js';

/** Simple in-memory store seeded from seed-data. Replace with a real DB later. */
export class InMemoryRepository implements Repository {
  private users = new Map<string, User>(users.map((u) => [u.id, u]));
  private sites = new Map<string, Site>(sites.map((s) => [s.id, s]));
  private scenes = new Map<string, Scene>(scenes.map((s) => [s.id, s]));
  private appliances = new Map<string, Appliance>(
    // deep-copy so the demo can mutate state without touching the seed array
    appliances.map((ap) => [ap.id, structuredClone(ap)]),
  );

  async getUserByAccessToken(token: string): Promise<User | undefined> {
    return [...this.users.values()].find((u) => u.accessToken === token);
  }

  async getUserByPlatformId(platform: string, platformUserId: string): Promise<User | undefined> {
    return [...this.users.values()].find(
      (u) => (u.platformUserIds as Record<string, string>)[platform] === platformUserId,
    );
  }

  async getSitesForUser(userId: string): Promise<Site[]> {
    return [...this.sites.values()].filter((s) => s.userId === userId);
  }

  async getDefaultSite(userId: string): Promise<Site | undefined> {
    const all = await this.getSitesForUser(userId);
    return all.find((s) => s.isDefault) ?? all[0];
  }

  async getScenesForSite(siteId: string): Promise<Scene[]> {
    return [...this.scenes.values()].filter((s) => s.siteId === siteId);
  }

  async getAppliancesForScene(sceneId: string): Promise<Appliance[]> {
    return [...this.appliances.values()].filter((ap) => ap.sceneId === sceneId);
  }

  async getAppliance(applianceId: string): Promise<Appliance | undefined> {
    return this.appliances.get(applianceId);
  }

  async updateApplianceState(applianceId: string, patch: Partial<ApplianceState>): Promise<Appliance | undefined> {
    const ap = this.appliances.get(applianceId);
    if (!ap) return undefined;
    ap.state = { ...ap.state, ...patch };
    return ap;
  }
}
