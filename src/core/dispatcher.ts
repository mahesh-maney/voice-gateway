import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { CanonicalResult } from '../domain/canonical-result.js';
import type { IotCoreClient } from '../iot/iot-core.interface.js';
import type { CommandLog } from '../repository/command-log.js';

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
    const cached = await this.commandLog.find(cmd.commandId);
    if (cached) return cached;

    const result = await this.iot.execute(cmd);
    await this.commandLog.record(cmd.commandId, result);
    return result;
  }
}
