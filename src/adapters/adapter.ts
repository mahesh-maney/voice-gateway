import type { CanonicalCommand, SourcePlatform } from '../domain/canonical-command.js';
import type { CanonicalResult } from '../domain/canonical-result.js';
import type { IdentityResolver } from '../core/identity.js';

export interface AdapterContext {
  identity: IdentityResolver;
}

export interface FormatOptions {
  locale: string;
}

/**
 * The plug contract. Adding a new assistant = implementing this once.
 *  - toCanonical:     that assistant's request  ->  canonical command
 *  - toResponse:      canonical result          ->  that assistant's reply
 *  - toErrorResponse: a GatewayError            ->  a friendly spoken reply
 *
 * The gateway pipeline (resolve -> dispatch) is identical for every platform,
 * so none of it is duplicated here.
 */
export interface VoiceAdapter<Req = unknown, Res = unknown> {
  readonly platform: SourcePlatform;
  toCanonical(req: Req, ctx: AdapterContext): Promise<CanonicalCommand>;
  toResponse(result: CanonicalResult, opts: FormatOptions): Res;
  toErrorResponse(error: Error, opts: FormatOptions): Res;
}
