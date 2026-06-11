import type { Repository } from '../repository/repository.js';
import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { Site, Scene } from '../domain/entities.js';
import { normalize } from '../util/text.js';
import { applianceTypeFor } from './synonyms.js';
import { SiteNotFoundError, SceneNotFoundError, ApplianceNotFoundError } from './errors.js';
import { logger } from '../util/logger.js';

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

    logger.debug('resolver.start', {
      commandId: cmd.commandId,
      userId,
      spokenSite: t.spokenSite,
      spokenScene: t.spokenScene,
      spokenAppliance: t.spokenAppliance,
    });

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

    logger.debug('resolver.complete', {
      commandId: cmd.commandId,
      siteId: site.id,
      siteName: site.name,
      sceneId: scene.id,
      sceneName: scene.name,
      applianceIds: t.applianceIds,
    });
  }

  private async resolveSite(userId: string, spokenSite?: string): Promise<Site> {
    if (!spokenSite) {
      logger.debug('resolver.site.default', { userId });
      const def = await this.repo.getDefaultSite(userId);
      if (!def) {
        logger.warn('resolver.site.not-found', { userId, spokenSite: '(default)' });
        throw new SiteNotFoundError('your home');
      }
      logger.debug('resolver.site.resolved', { siteId: def.id, siteName: def.name, via: 'default' });
      return def;
    }
    const want = normalize(spokenSite);
    const all = await this.repo.getSitesForUser(userId);
    logger.debug('resolver.site.searching', { userId, spokenSite, normalized: want, candidates: all.map(s => s.name) });
    const match = all.find((s) => normalize(s.name) === want);
    if (!match) {
      logger.warn('resolver.site.not-found', { userId, spokenSite, normalized: want });
      throw new SiteNotFoundError(spokenSite);
    }
    logger.debug('resolver.site.resolved', { siteId: match.id, siteName: match.name, via: 'named' });
    return match;
  }

  private async resolveScene(site: Site, spokenScene?: string): Promise<Scene> {
    if (!spokenScene) {
      logger.warn('resolver.scene.not-specified', { siteId: site.id });
      throw new SceneNotFoundError('that room');
    }
    const want = normalize(spokenScene);
    const all = await this.repo.getScenesForSite(site.id);
    logger.debug('resolver.scene.searching', { siteId: site.id, spokenScene, normalized: want, candidates: all.map(s => s.name) });

    const exact = all.find((s) => normalize(s.name) === want);
    const match = exact ?? all.find((s) => normalize(s.name).includes(want) || want.includes(normalize(s.name)));

    if (!match) {
      logger.warn('resolver.scene.not-found', { siteId: site.id, spokenScene, normalized: want });
      throw new SceneNotFoundError(spokenScene);
    }
    logger.debug('resolver.scene.resolved', {
      sceneId: match.id,
      sceneName: match.name,
      matchType: exact ? 'exact' : 'substring',
    });
    return match;
  }

  private async resolveApplianceIds(scene: Scene, spokenAppliance?: string): Promise<string[]> {
    if (!spokenAppliance) {
      logger.warn('resolver.appliance.not-specified', { sceneId: scene.id });
      throw new ApplianceNotFoundError('device', scene.name);
    }
    const want = normalize(spokenAppliance);
    const type = applianceTypeFor(want);
    const inScene = await this.repo.getAppliancesForScene(scene.id);

    logger.debug('resolver.appliance.searching', {
      sceneId: scene.id,
      spokenAppliance,
      normalized: want,
      resolvedType: type ?? '(none — will try name match)',
      candidateCount: inScene.length,
    });

    const matches = inScene.filter((ap) =>
      (type && ap.type === type) || normalize(ap.name) === want,
    );

    if (matches.length === 0) {
      logger.warn('resolver.appliance.not-found', {
        sceneId: scene.id,
        sceneName: scene.name,
        spokenAppliance,
        resolvedType: type,
        availableTypes: [...new Set(inScene.map(ap => ap.type))],
      });
      throw new ApplianceNotFoundError(spokenAppliance, scene.name);
    }

    logger.debug('resolver.appliance.resolved', {
      sceneId: scene.id,
      spokenAppliance,
      resolvedType: type,
      matchedIds: matches.map(ap => ap.id),
      matchedNames: matches.map(ap => ap.name),
    });
    return matches.map((ap) => ap.id);
  }
}
