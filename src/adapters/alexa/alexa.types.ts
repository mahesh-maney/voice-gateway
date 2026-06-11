/** The slices of the Alexa custom-skill request/response we actually use. */

export interface AlexaSlot {
  name: string;
  value?: string;
  resolutions?: {
    resolutionsPerAuthority?: Array<{
      status: { code: string };
      values?: Array<{ value: { name: string; id: string } }>;
    }>;
  };
}

export interface AlexaRequest {
  version: string;
  session: { user: { userId: string; accessToken?: string } };
  context: { System: { device?: { deviceId?: string }; user?: { userId?: string } } };
  request: {
    type: 'IntentRequest' | 'LaunchRequest' | 'SessionEndedRequest';
    requestId: string;
    locale: string;
    timestamp: string;
    intent?: { name: string; slots?: Record<string, AlexaSlot> };
  };
}

export interface AlexaResponse {
  version: '1.0';
  response: {
    outputSpeech: { type: 'SSML'; ssml: string };
    shouldEndSession: boolean;
  };
}
