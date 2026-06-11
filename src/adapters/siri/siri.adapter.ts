import type { VoiceAdapter, AdapterContext, FormatOptions } from '../adapter.js';
import type { CanonicalCommand } from '../../domain/canonical-command.js';
import type { CanonicalResult } from '../../domain/canonical-result.js';

/**
 * PLUG POINT — Siri (not yet implemented).
 *
 * NOTE: Siri is different from Alexa/Google. Alexa and Google are cloud-to-cloud
 * (their servers call this gateway). Siri is mostly ON-DEVICE via App Intents /
 * Shortcuts, or HomeKit. So part of the "Siri adapter" lives in the iOS app and
 * calls this gateway over a normal authenticated REST endpoint, which then maps
 * into the SAME CanonicalCommand. The contract below is unchanged.
 */
export class SiriAdapter implements VoiceAdapter {
  readonly platform = 'siri' as const;

  async toCanonical(_req: unknown, _ctx: AdapterContext): Promise<CanonicalCommand> {
    throw new Error('SiriAdapter.toCanonical not implemented yet');
  }

  toResponse(_result: CanonicalResult, _opts: FormatOptions): unknown {
    throw new Error('SiriAdapter.toResponse not implemented yet');
  }

  toErrorResponse(_error: Error, _opts: FormatOptions): unknown {
    throw new Error('SiriAdapter.toErrorResponse not implemented yet');
  }
}
