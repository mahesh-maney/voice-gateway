import express, { type Express, type Request, type Response } from 'express';
import type { VoiceGateway } from '../core/gateway.js';
import type { Repository } from '../repository/repository.js';
import type { AlexaRequest } from '../adapters/alexa/alexa.types.js';
import type { SourcePlatform } from '../domain/canonical-command.js';
import { securityHeaders } from './middleware/security-headers.js';
import { globalRateLimit, voiceRateLimit } from './middleware/rate-limit.js';
import { alexaVerify } from './middleware/alexa-verify.js';
import { validateAlexa } from './validation/alexa.schema.js';
import { requireApiKey } from './middleware/api-key.js';
import { requestLogger } from './middleware/request-logger.js';
import { requestTimeout } from './middleware/timeout.js';
import { registry, voiceRequestsTotal, voiceRequestDuration } from '../observability/metrics.js';
import { config } from '../config.js';

/** Builds the Express app. One route per assistant; all share the gateway. */
export function buildApp(gateway: VoiceGateway, repo: Repository): Express {
  const app = express();

  // Security headers on every response.
  app.use(securityHeaders);

  // Assign / propagate X-Request-Id; log every HTTP request + response.
  app.use(requestLogger);

  // Global rate limit — broad guard across all routes.
  app.use(globalRateLimit);

  // Parse JSON and capture the raw body buffer so alexaVerify can check the
  // request signature (signature is over the raw bytes, not the parsed object).
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // ------------------------------------------------------------------
  // Health check — reflects real DB connectivity when Postgres is wired
  // ------------------------------------------------------------------
  app.get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    if (repo.ping) {
      try {
        await repo.ping();
        checks['database'] = 'ok';
      } catch {
        checks['database'] = 'error';
      }
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    // No DB configured (in-memory dev mode) → always healthy.
    const status = Object.keys(checks).length === 0 || healthy ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({ status, service: 'voice-gateway', checks });
  });

  // ------------------------------------------------------------------
  // Prometheus metrics (scrape from your infra or Grafana agent)
  // ------------------------------------------------------------------
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  // ------------------------------------------------------------------
  // Voice routes
  // ------------------------------------------------------------------

  // Shared timeout for all voice routes — Alexa requires a response within 8 s.
  const voiceTimeout = requestTimeout(config.requestTimeoutMs);

  // Alexa: timeout → signature verification → schema validation → rate limit → handler.
  app.post(
    '/voice/alexa',
    voiceTimeout,
    alexaVerify,
    validateAlexa,
    voiceRateLimit,
    async (req: Request, res: Response) => {
      const alexaReq = req.body as AlexaRequest;
      const locale = alexaReq?.request?.locale ?? 'en-US';
      await handleVoice('alexa', gateway, req, res, alexaReq, locale);
    },
  );

  // Google / Siri: timeout → API key → rate limit → handler.
  // Locale is read from the Accept-Language header (platform body not yet parsed).
  app.post(
    '/voice/google',
    voiceTimeout,
    requireApiKey,
    voiceRateLimit,
    async (req: Request, res: Response) => {
      const locale = parseLocale(req);
      await handleVoice('google', gateway, req, res, req.body, locale);
    },
  );

  app.post(
    '/voice/siri',
    voiceTimeout,
    requireApiKey,
    voiceRateLimit,
    async (req: Request, res: Response) => {
      const locale = parseLocale(req);
      await handleVoice('siri', gateway, req, res, req.body, locale);
    },
  );

  return app;
}

// ---------------------------------------------------------------------------
// Shared voice-route handler — records metrics and propagates correlation id
// ---------------------------------------------------------------------------

/** Best-effort locale from Accept-Language header, e.g. "en-IN" or "en-US". */
function parseLocale(req: Request): string {
  return (req.headers['accept-language'] as string | undefined)
    ?.split(',')[0]
    ?.trim()
    ?? 'en-US';
}

async function handleVoice(
  platform: SourcePlatform,
  gateway: VoiceGateway,
  req: Request,
  res: Response,
  body: unknown,
  locale: string,
): Promise<void> {
  const endTimer = voiceRequestDuration.startTimer({ platform });
  try {
    const response = await gateway.handle(platform, body, locale);
    voiceRequestsTotal.inc({ platform });

    // Echo the platform's own request id back so callers can correlate logs.
    const correlationId = (req.body as Record<string, unknown>)?.request;
    if (typeof correlationId === 'object' && correlationId !== null) {
      const rid = (correlationId as Record<string, unknown>)['requestId'];
      if (typeof rid === 'string') res.setHeader('x-correlation-id', rid);
    }

    res.json(response);
  } finally {
    endTimer();
  }
}
