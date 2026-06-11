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

    const pipelineStart = Date.now();
    try {
      const cmd = await adapter.toCanonical(req, { identity: this.identity });
      logger.info('command.parsed', {
        commandId: cmd.commandId,
        correlationId: cmd.correlationId,
        action: cmd.action,
        kind: cmd.kind,
        userId: cmd.actor.userId,
        platform: cmd.source.platform,
        locale: cmd.source.locale,
        deviceId: cmd.source.surfaceDeviceId,
        spokenScene: cmd.target.spokenScene,
        spokenAppliance: cmd.target.spokenAppliance,
        parameters: cmd.parameters,
      });

      await this.resolver.resolve(cmd);
      logger.info('command.resolved', {
        commandId: cmd.commandId,
        correlationId: cmd.correlationId,
        userId: cmd.actor.userId,
        siteId: cmd.target.siteId,
        siteName: cmd.target.siteName,
        sceneId: cmd.target.sceneId,
        sceneName: cmd.target.sceneName,
        applianceIds: cmd.target.applianceIds,
      });

      const dispatchStart = Date.now();
      const result = await this.dispatcher.dispatch(cmd);
      logger.info('command.executed', {
        commandId: cmd.commandId,
        correlationId: cmd.correlationId,
        userId: cmd.actor.userId,
        action: cmd.action,
        applianceIds: cmd.target.applianceIds,
        status: result.status,
        summary: result.summary,
        dispatchMs: Date.now() - dispatchStart,
        totalMs: Date.now() - pipelineStart,
      });

      return adapter.toResponse(result, { locale });
    } catch (err) {
      const error = err as Error;
      logger.warn('command.failed', {
        platform,
        errorType: error.constructor.name,
        error: error.message,
        totalMs: Date.now() - pipelineStart,
      });
      return adapter.toErrorResponse(error, { locale });
    }
  }
}
