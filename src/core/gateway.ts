import type { VoiceAdapter } from '../adapters/adapter.js';
import type { SourcePlatform } from '../domain/canonical-command.js';
import type { IdentityResolver } from './identity.js';
import type { TargetResolver } from './resolver.js';
import type { Dispatcher } from './dispatcher.js';
import { logger } from '../util/logger.js';

/**
 * The pipeline every assistant shares:
 *
 *   raw request --(adapter.toCanonical)--> canonical command
 *               --(resolver.resolve)-----> ids filled in
 *               --(dispatcher.dispatch)--> IoT core executes
 *               --(adapter.toResponse)---> raw reply
 *
 * Only the adapter is platform-specific. The three middle steps never change.
 */
export class VoiceGateway {
  private readonly adapters = new Map<SourcePlatform, VoiceAdapter<any, any>>();

  constructor(
    adapters: VoiceAdapter<any, any>[],
    private readonly identity: IdentityResolver,
    private readonly resolver: TargetResolver,
    private readonly dispatcher: Dispatcher,
  ) {
    for (const a of adapters) this.adapters.set(a.platform, a);
  }

  async handle(platform: SourcePlatform, req: unknown, locale: string): Promise<unknown> {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`No adapter registered for platform "${platform}"`);

    try {
      const cmd = await adapter.toCanonical(req, { identity: this.identity });
      logger.info('command.parsed', {
        correlationId: cmd.correlationId, action: cmd.action,
        scene: cmd.target.spokenScene, appliance: cmd.target.spokenAppliance,
      });

      await this.resolver.resolve(cmd);
      logger.info('command.resolved', {
        correlationId: cmd.correlationId,
        site: cmd.target.siteName, scene: cmd.target.sceneName,
        applianceIds: cmd.target.applianceIds,
      });

      const result = await this.dispatcher.dispatch(cmd);
      logger.info('command.executed', { correlationId: cmd.correlationId, status: result.status });

      return adapter.toResponse(result, { locale });
    } catch (err) {
      logger.warn('command.failed', { platform, error: (err as Error).message });
      return adapter.toErrorResponse(err as Error, { locale });
    }
  }
}
