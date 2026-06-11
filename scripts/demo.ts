import { buildGateway } from '../src/core/composition.js';
import type { AlexaRequest, AlexaResponse } from '../src/adapters/alexa/alexa.types.js';

/** Run with: npm run demo */

const { gateway } = buildGateway();

function alexa(intent: string, slots: Record<string, string>, accessToken = 'demo-token-ravi', userId = 'amzn1.ask.account.RAVI'): AlexaRequest {
  return {
    version: '1.0',
    session: { user: { userId, accessToken } },
    context: { System: { device: { deviceId: 'amzn1.ask.device.ECHO1' } } },
    request: {
      type: 'IntentRequest',
      requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
      locale: 'en-IN',
      timestamp: new Date().toISOString(),
      intent: {
        name: intent,
        slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])),
      },
    },
  };
}

const utterances: Array<[string, AlexaRequest]> = [
  ['turn on the AC at master bedroom', alexa('TurnOnIntent', { Appliance: 'AC', Scene: 'master bedroom' })],
  ['set the AC to 21 degrees in the living room', alexa('SetTemperatureIntent', { Appliance: 'AC', Scene: 'living room', Temperature: '21' })],
  ['turn on the lights in the kitchen', alexa('TurnOnIntent', { Appliance: 'lights', Scene: 'kitchen' })],
  ['open the curtains in the living room', alexa('OpenIntent', { Appliance: 'curtains', Scene: 'living room' })],
  ['is the fan on in the master bedroom?', alexa('QueryStateIntent', { Appliance: 'fan', Scene: 'master bedroom' })],
  ['turn on the geyser in the bathroom (not present)', alexa('TurnOnIntent', { Appliance: 'geyser', Scene: 'bathroom' })],
  ['turn off the TV (account not linked)', alexa('TurnOffIntent', { Appliance: 'TV', Scene: 'master bedroom' }, 'wrong-token', 'amzn1.ask.account.UNKNOWN')],
];

const strip = (r: AlexaResponse) => r.response.outputSpeech.ssml.replace(/<\/?speak>/g, '');

for (const [said, req] of utterances) {
  const res = (await gateway.handle('alexa', req, 'en-IN')) as AlexaResponse;
  console.log(`\n🗣  "${said}"`);
  console.log(`🔊  ${strip(res)}`);
}
console.log('');
