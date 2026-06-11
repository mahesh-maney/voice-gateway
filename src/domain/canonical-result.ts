import type { CanonicalAction } from './actions.js';
import type { ApplianceState } from './entities.js';

/** What the IoT core returns; each adapter turns this back into a spoken reply. */

export interface ApplianceOutcome {
  applianceId: string;
  applianceName: string;
  state?: ApplianceState;
  error?: { code: string; message: string };
}

export interface CanonicalResult {
  commandId: string;          // echoes the command for correlation
  action: CanonicalAction;
  status: 'success' | 'failure' | 'partial';
  /** A natural-language summary the response formatter can speak. */
  summary: string;
  outcomes: ApplianceOutcome[];
}
