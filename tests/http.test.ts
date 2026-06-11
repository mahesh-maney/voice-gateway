/**
 * HTTP integration tests — exercises the full Express app end-to-end
 * using the in-memory repository (no real DB or IoT device required).
 *
 * Alexa signature verification is automatically skipped in NODE_ENV != 'production'.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildGateway } from '../src/core/composition.js';
import { buildApp } from '../src/http/app.js';
import { config } from '../src/config.js';

// ---------------------------------------------------------------------------
// Shared app instance (in-memory repo, no real DB)
// ---------------------------------------------------------------------------

let app: Express;

beforeAll(() => {
  const { gateway, repo } = buildGateway();
  app = buildApp(gateway, repo);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid Alexa IntentRequest that passes Zod validation. */
function alexaBody(
  intent = 'TurnOnIntent',
  slots: Record<string, string> = { Appliance: 'AC', Scene: 'master bedroom' },
  accessToken = 'demo-token-ravi',
  userId = 'amzn1.ask.account.RAVI',
  commandId = `req-${Math.random().toString(36).slice(2)}`,
) {
  return {
    version: '1.0',
    session: { user: { userId, accessToken } },
    context: { System: { device: { deviceId: 'amzn1.ask.device.ECHO1' } } },
    request: {
      type: 'IntentRequest',
      requestId: commandId,
      timestamp: new Date().toISOString(),
      locale: 'en-IN',
      intent: {
        name: intent,
        slots: Object.fromEntries(
          Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }]),
        ),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('voice-gateway');
  });
});

// ---------------------------------------------------------------------------
// /metrics
// ---------------------------------------------------------------------------

describe('GET /metrics', () => {
  it('returns Prometheus text format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    // Should include at least one default Node.js metric
    expect(res.text).toContain('nodejs_');
  });
});

// ---------------------------------------------------------------------------
// POST /voice/alexa — happy path
// ---------------------------------------------------------------------------

describe('POST /voice/alexa — happy path', () => {
  it('returns 200 with Alexa SSML response for a valid intent', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(alexaBody());

    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0');
    expect(res.body.response.outputSpeech.type).toBe('SSML');
    expect(res.body.response.outputSpeech.ssml).toContain('<speak>');
    expect(res.body.response.shouldEndSession).toBe(true);
  });

  it('speaks a success message when the device is found', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(alexaBody('TurnOnIntent', { Appliance: 'AC', Scene: 'master bedroom' }));

    expect(res.status).toBe(200);
    const ssml: string = res.body.response.outputSpeech.ssml;
    expect(ssml.toLowerCase()).toContain('turned on');
    expect(ssml.toLowerCase()).toContain('master bedroom');
  });

  it('handles SetTemperatureIntent correctly', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(
        alexaBody('SetTemperatureIntent', {
          Appliance: 'AC',
          Scene: 'living room',
          Temperature: '22',
        }),
      );

    expect(res.status).toBe(200);
    expect(res.body.response.outputSpeech.ssml).toContain('22 degrees');
  });
});

// ---------------------------------------------------------------------------
// POST /voice/alexa — error paths
// ---------------------------------------------------------------------------

describe('POST /voice/alexa — error paths', () => {
  it('returns 400 when the request body fails Zod validation', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send({ not: 'an alexa request' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 400 for an empty body', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .set('content-type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });

  it('returns 400 when session.user is missing', async () => {
    const body = alexaBody();
    // @ts-expect-error — intentionally malformed
    delete body.session;
    const res = await request(app).post('/voice/alexa').send(body);
    expect(res.status).toBe(400);
  });

  it('returns a spoken account-not-linked message for an unknown token', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(alexaBody('TurnOnIntent', { Appliance: 'AC', Scene: 'master bedroom' }, 'bad-token', 'amzn1.ask.account.UNKNOWN'));

    // Gateway returns a 200 with a spoken error — never a 4xx for domain errors
    expect(res.status).toBe(200);
    const ssml: string = res.body.response.outputSpeech.ssml;
    expect(ssml.toLowerCase()).toContain('link your account');
  });

  it('returns a spoken error when the appliance is not found', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(alexaBody('TurnOnIntent', { Appliance: 'dishwasher', Scene: 'kitchen' }));

    expect(res.status).toBe(200);
    const ssml: string = res.body.response.outputSpeech.ssml;
    expect(ssml.toLowerCase()).toContain("couldn't find");
  });

  it('returns a spoken error for an unmapped intent', async () => {
    const res = await request(app)
      .post('/voice/alexa')
      .send(alexaBody('UnknownWeirdIntent', {}));

    expect(res.status).toBe(200);
    const ssml: string = res.body.response.outputSpeech.ssml;
    expect(ssml.toLowerCase()).toContain("can't do that");
  });
});

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

describe('Response headers', () => {
  it('sets X-Request-Id on every response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a provided X-Request-Id back on the response', async () => {
    const id = 'my-trace-abc123';
    const res = await request(app).get('/health').set('x-request-id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('sets X-Correlation-Id on a successful Alexa response', async () => {
    const body = alexaBody();
    const res = await request(app).post('/voice/alexa').send(body);
    expect(res.status).toBe(200);
    // correlationId echoes the platform's requestId
    expect(res.headers['x-correlation-id']).toBe(body.request.requestId);
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// API key auth (Google / Siri)
// ---------------------------------------------------------------------------

describe('API key middleware', () => {
  it('returns 401 when API_KEY is configured and the header is absent', async () => {
    const prev = config.apiKey;
    config.apiKey = 'test-secret';
    try {
      const res = await request(app).post('/voice/google').send({});
      expect(res.status).toBe(401);
    } finally {
      config.apiKey = prev;
    }
  });

  it('returns 401 when the wrong key is supplied', async () => {
    const prev = config.apiKey;
    config.apiKey = 'test-secret';
    try {
      const res = await request(app)
        .post('/voice/siri')
        .set('x-api-key', 'wrong-key')
        .send({});
      expect(res.status).toBe(401);
    } finally {
      config.apiKey = prev;
    }
  });
});
