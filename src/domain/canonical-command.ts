import type { CanonicalAction } from './actions.js';

/**
 * The canonical command — the single, assistant-agnostic object that every
 * adapter produces and the IoT core consumes. This is the heart of the design:
 * the core never sees an Alexa/Google/Siri request, only this.
 */

export type SchemaVersion = '1.0';
export type SourcePlatform = 'alexa' | 'google' | 'siri';
export type CommandKind = 'control' | 'query';

export interface CommandSource {
  platform: SourcePlatform;
  locale: string;            // e.g. "en-IN"
  surfaceDeviceId?: string;  // the Echo / phone spoken INTO (not the target appliance)
  requestId: string;         // the platform's own request id (audit)
}

export interface CommandActor {
  /** OUR internal user id, resolved from the account-linking token. */
  userId: string;
  /** Raw platform user id — kept only for audit. */
  platformUserId?: string;
}

export interface CommandTarget {
  // What the user said (filled by the adapter):
  spokenSite?: string;       // optional: "office" — usually omitted, default site is used
  spokenScene?: string;      // "master bedroom"
  spokenAppliance?: string;  // "AC"
  // Resolved by the shared resolver:
  siteId?: string;
  siteName?: string;
  sceneId?: string;
  sceneName?: string;
  applianceIds: string[];
}

export interface CommandParameters {
  power?: 'on' | 'off';
  temperature?: { value: number; unit: 'C' | 'F' };
  brightness?: number;       // 0–100
  fanSpeed?: number;         // 1–5
  level?: number;            // 0–100
  mode?: string;
  openClose?: 'open' | 'close';
  [key: string]: unknown;    // room to grow without a schema bump
}

export interface CanonicalCommand {
  version: SchemaVersion;
  commandId: string;         // gateway-generated UUID (idempotency + tracing)
  correlationId: string;     // follows the request across every log line
  receivedAt: string;        // ISO 8601
  kind: CommandKind;
  action: CanonicalAction;
  source: CommandSource;
  actor: CommandActor;
  target: CommandTarget;
  parameters: CommandParameters;
}
