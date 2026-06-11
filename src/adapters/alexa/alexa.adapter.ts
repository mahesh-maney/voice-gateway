import type { VoiceAdapter, AdapterContext, FormatOptions } from '../adapter.js';
import type { CanonicalCommand, CommandKind, CommandParameters } from '../../domain/canonical-command.js';
import type { CanonicalResult } from '../../domain/canonical-result.js';
import type { AlexaRequest, AlexaResponse, AlexaSlot } from './alexa.types.js';
import { INTENT_TO_ACTION } from './alexa.intents.js';
import { GatewayError, UnmappedIntentError } from '../../core/errors.js';
import { uuid } from '../../util/text.js';

const slotValue = (slots: Record<string, AlexaSlot> | undefined, name: string): string | undefined =>
  slots?.[name]?.value;

/** Alexa number slots carry no unit; infer from locale (US -> F, else C). */
const unitForLocale = (locale: string): 'C' | 'F' => (locale === 'en-US' ? 'F' : 'C');

export class AlexaAdapter implements VoiceAdapter<AlexaRequest, AlexaResponse> {
  readonly platform = 'alexa' as const;

  async toCanonical(req: AlexaRequest, ctx: AdapterContext): Promise<CanonicalCommand> {
    const r = req.request;
    const intentName = r.intent?.name;
    if (!intentName) throw new UnmappedIntentError(r.type);

    const action = INTENT_TO_ACTION[intentName];
    if (!action) throw new UnmappedIntentError(intentName);

    // Account linking: token (or Alexa user id) -> our internal user id.
    const userId = await ctx.identity.resolveUserId({
      platform: 'alexa',
      accessToken: req.session.user.accessToken,
      platformUserId: req.session.user.userId,
    });

    const slots = r.intent?.slots;
    const locale = r.locale;
    const kind: CommandKind = action === 'appliance.query_state' ? 'query' : 'control';

    return {
      version: '1.0',
      commandId: uuid(),
      correlationId: r.requestId,
      receivedAt: r.timestamp,
      kind,
      action,
      source: {
        platform: 'alexa',
        locale,
        surfaceDeviceId: req.context.System.device?.deviceId,
        requestId: r.requestId,
      },
      actor: { userId, platformUserId: req.session.user.userId },
      target: {
        spokenSite: slotValue(slots, 'Site'),
        spokenScene: slotValue(slots, 'Scene'),
        spokenAppliance: slotValue(slots, 'Appliance'),
        applianceIds: [], // filled by the shared resolver
      },
      parameters: this.parametersFor(intentName, slots, locale),
    };
  }

  private parametersFor(
    intentName: string,
    slots: Record<string, AlexaSlot> | undefined,
    locale: string,
  ): CommandParameters {
    const p: CommandParameters = {};
    switch (intentName) {
      case 'TurnOnIntent': p.power = 'on'; break;
      case 'TurnOffIntent': p.power = 'off'; break;
      case 'OpenIntent': p.openClose = 'open'; break;
      case 'CloseIntent': p.openClose = 'close'; break;
      case 'SetTemperatureIntent': {
        const v = Number(slotValue(slots, 'Temperature'));
        if (!Number.isNaN(v)) p.temperature = { value: v, unit: unitForLocale(locale) };
        break;
      }
      case 'SetBrightnessIntent': {
        const v = Number(slotValue(slots, 'Brightness'));
        if (!Number.isNaN(v)) p.brightness = v;
        break;
      }
      case 'SetFanSpeedIntent': {
        const v = Number(slotValue(slots, 'FanSpeed'));
        if (!Number.isNaN(v)) p.fanSpeed = v;
        break;
      }
    }
    return p;
  }

  toResponse(result: CanonicalResult, _opts: FormatOptions): AlexaResponse {
    const lead = result.status === 'success' ? 'Okay. ' : result.status === 'partial' ? 'Partly done. ' : 'Sorry. ';
    return this.speak(lead + result.summary);
  }

  toErrorResponse(error: Error, _opts: FormatOptions): AlexaResponse {
    const message = error instanceof GatewayError ? error.userMessage : 'Sorry, something went wrong.';
    return this.speak(message);
  }

  private speak(text: string): AlexaResponse {
    return {
      version: '1.0',
      response: {
        outputSpeech: { type: 'SSML', ssml: `<speak>${text}</speak>` },
        shouldEndSession: true,
      },
    };
  }
}
