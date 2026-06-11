import type { VoiceAdapter, AdapterContext, FormatOptions } from '../adapter.js';
import type { CanonicalCommand } from '../../domain/canonical-command.js';
import type { CanonicalResult } from '../../domain/canonical-result.js';

/**
 * PLUG POINT — Google Assistant (not yet implemented).
 *
 * To add Google you fill these three methods, exactly like AlexaAdapter:
 *   1. toCanonical:     parse Google's Smart Home intent (SYNC/QUERY/EXECUTE)
 *                       or Conversational action -> CanonicalCommand
 *   2. toResponse:      CanonicalResult -> Google's response payload
 *   3. toErrorResponse: GatewayError    -> Google's error/spoken payload
 *
 * Everything downstream (identity, resolver, dispatcher, IoT core) is reused
 * unchanged. That is what "pluggable" means.
 */
export class GoogleAdapter implements VoiceAdapter {
  readonly platform = 'google' as const;

  async toCanonical(_req: unknown, _ctx: AdapterContext): Promise<CanonicalCommand> {
    throw new Error('GoogleAdapter.toCanonical not implemented yet');
  }

  toResponse(_result: CanonicalResult, _opts: FormatOptions): unknown {
    throw new Error('GoogleAdapter.toResponse not implemented yet');
  }

  toErrorResponse(_error: Error, _opts: FormatOptions): unknown {
    throw new Error('GoogleAdapter.toErrorResponse not implemented yet');
  }
}
