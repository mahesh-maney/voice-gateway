import type { Repository } from '../repository/repository.js';
import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { Site, Scene } from '../domain/entities.js';
import { normalize } from '../util/text.js';
import { applianceTypeFor } from './synonyms.js';
import { SiteNotFoundError, SceneNotFoundError, ApplianceNotFoundError } from './errors.js';

/**
 * Resolves the spoken references on a command into real ids, using the user's
 * own data. This is SHARED across all assistants — written once here, not
 * re-implemented per adapter.
 *
 *   "AC" + "master bedroom"  ->  siteId, sceneId, applianceIds
 */
export class TargetResolver {
  constructor(private readonly repo: Repository) {}

  /** Mutates cmd.target in place; throws a GatewayError if anything is unresolved. */
  async resolve(cmd: CanonicalCommand): Promise<void> {
    const userId = cmd.actor.userId;
    const t = cmd.target;

    // 1. Site — named, or the user's default.
    const site = await this.resolveSite(userId, t.spokenSite);
    t.siteId = site.id;
    t.siteName = site.name;

    // 2. Scene — match by normalized name within the site.
    const scene = await this.resolveScene(site, t.spokenScene);
    t.sceneId = scene.id;
    t.sceneName = scene.name;

    // 3. Appliance(s) — match by synonym/type within the scene.
    t.applianceIds = await this.resolveApplianceIds(scene, t.spokenAppliance);
  }

  private async resolveSite(userId: string, spokenSite?: string): Promise<Site> {
    if (!spokenSite) {
      const def = await this.repo.getDefaultSite(userId);
      if (!def) throw new SiteNotFoundError('your home');
      return def;
    }
    const want = normalize(spokenSite);
    const all = await this.repo.getSitesForUser(userId);
    const match = all.find((s) => normalize(s.name) === want);
    if (!match) throw new SiteNotFoundError(spokenSite);
    return match;
  }

  private async resolveScene(site: Site, spokenScene?: string): Promise<Scene> {
    if (!spokenScene) throw new SceneNotFoundError('that room');
    const want = normalize(spokenScene);
    const all = await this.repo.getScenesForSite(site.id);
    const match =
      all.find((s) => normalize(s.name) === want) ??
      all.find((s) => normalize(s.name).includes(want) || want.includes(normalize(s.name)));
    if (!match) throw new SceneNotFoundError(spokenScene);
    return match;
  }

  private async resolveApplianceIds(scene: Scene, spokenAppliance?: string): Promise<string[]> {
    if (!spokenAppliance) throw new ApplianceNotFoundError('device', scene.name);
    const want = normalize(spokenAppliance);
    const type = applianceTypeFor(want);
    const inScene = await this.repo.getAppliancesForScene(scene.id);

    const matches = inScene.filter((ap) =>
      (type && ap.type === type) || normalize(ap.name) === want,
    );
    if (matches.length === 0) throw new ApplianceNotFoundError(spokenAppliance, scene.name);
    return matches.map((ap) => ap.id);
  }
}
