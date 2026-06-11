import { describe, it, expect, beforeEach } from 'vitest';
import { buildGateway } from '../src/core/composition.js';
import type { VoiceGateway } from '../src/core/gateway.js';
import type { AlexaRequest, AlexaResponse } from '../src/adapters/alexa/alexa.types.js';

function alexa(intent: string, slots: Record<string, string>, accessToken = 'demo-token-ravi', userId = 'amzn1.ask.account.RAVI'): AlexaRequest {
  return {
    version: '1.0',
    session: { user: { userId, accessToken } },
    context: { System: { device: { deviceId: 'amzn1.ask.device.ECHO1' } } },
    request: {
      type: 'IntentRequest',
      requestId: 'req-test',
      locale: 'en-IN',
      timestamp: '2026-06-11T09:00:00Z',
      intent: { name: intent, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) },
    },
  };
}

const speech = (r: AlexaResponse) => r.response.outputSpeech.ssml.replace(/<\/?speak>/g, '');

describe('Alexa flow', () => {
  let gateway: VoiceGateway;
  beforeEach(() => { gateway = buildGateway().gateway; });

  it('turns on the AC in the master bedroom', async () => {
    const res = (await gateway.handle('alexa', alexa('TurnOnIntent', { Appliance: 'AC', Scene: 'master bedroom' }), 'en-IN')) as AlexaResponse;
    expect(speech(res).toLowerCase()).toContain('turned on');
    expect(speech(res).toLowerCase()).toContain('master bedroom');
  });

  it('sets the AC temperature in the living room', async () => {
    const res = (await gateway.handle('alexa', alexa('SetTemperatureIntent', { Appliance: 'AC', Scene: 'living room', Temperature: '21' }), 'en-IN')) as AlexaResponse;
    expect(speech(res)).toContain('21 degrees');
  });

  it('reports a friendly error when the appliance is not in the scene', async () => {
    const res = (await gateway.handle('alexa', alexa('TurnOnIntent', { Appliance: 'geyser', Scene: 'kitchen' }), 'en-IN')) as AlexaResponse;
    expect(speech(res).toLowerCase()).toContain("couldn't find");
  });

  it('reports account-not-linked when the token is unknown', async () => {
    const res = (await gateway.handle('alexa', alexa('TurnOffIntent', { Appliance: 'TV', Scene: 'master bedroom' }, 'bad-token', 'amzn1.ask.account.UNKNOWN'), 'en-IN')) as AlexaResponse;
    expect(speech(res).toLowerCase()).toContain('link your account');
  });
});
