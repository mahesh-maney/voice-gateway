import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Node.js process metrics (memory, event loop lag, CPU, GC, …)
collectDefaultMetrics({ register: registry });

/** Total voice commands received, labelled by platform. */
export const voiceRequestsTotal = new Counter({
  name: 'voice_requests_total',
  help: 'Total number of voice commands received',
  labelNames: ['platform'],
  registers: [registry],
});

/**
 * End-to-end duration of the gateway pipeline for each voice request.
 * Observe latency distribution per platform.
 */
export const voiceRequestDuration = new Histogram({
  name: 'voice_request_duration_seconds',
  help: 'Duration of the voice-gateway pipeline in seconds',
  labelNames: ['platform'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});
