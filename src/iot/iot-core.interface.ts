import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { CanonicalResult } from '../domain/canonical-result.js';

/** Contract that every IoT core implementation must satisfy. */
export interface IotCoreClient {
  execute(cmd: CanonicalCommand): Promise<CanonicalResult>;
}
