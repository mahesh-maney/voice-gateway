import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { CanonicalResult } from '../domain/canonical-result.js';
import type { IotCoreClient } from '../iot/iot-core.interface.js';
import type { CommandLog } from '../repository/command-log.js';
import { logger } from '../util/logger.js';

/**
 * Thin seam between the gateway pipeline and the IoT core client.
 * Wraps execution with idempotency: if the same commandId has already been
 * processed, the cached result is returned without re-firing the device.
 */
export class Dispatcher {
  constructor(
    private readonly iot: IotCoreClient,
    private readonly commandLog: CommandLog,
  ) {}

  async dispatch(cmd: CanonicalCommand): Promise<CanonicalResult> {
    logger.debug('dispatcher.idempotency.check', {
      commandId: cmd.commandId,
      correlationId: cmd.correlationId,
    });

    const cached = await this.commandLog.find(cmd.commandId);
    if (cached) {
      // AUDIT: replayed request — device NOT fired again
      logger.info('dispatcher.cache.hit', {
        commandId: cmd.commandId,
        correlationId: cmd.correlationId,
        action: cmd.action,
        cachedStatus: cached.status,
        note: 'idempotency — IoT core was NOT called',
      });
      return cached;
    }

    // AUDIT: first execution — IoT core will be called
    logger.info('dispatcher.iot.dispatching', {
      commandId: cmd.commandId,
      correlationId: cmd.correlationId,
      action: cmd.action,
      userId: cmd.actor.userId,
      applianceIds: cmd.target.applianceIds,
      parameters: cmd.parameters,
    });

    const start = Date.now();
    const result = await this.iot.execute(cmd);
    const durationMs = Date.now() - start;

    await this.commandLog.record(cmd.commandId, result);

    // AUDIT: IoT core responded — result persisted to command log
    logger.info('dispatcher.iot.dispatched', {
      commandId: cmd.commandId,
      correlationId: cmd.correlationId,
      action: cmd.action,
      userId: cmd.actor.userId,
      applianceIds: cmd.target.applianceIds,
      status: result.status,
      outcomeCount: result.outcomes.length,
      durationMs,
    });

    return result;
  }
}
