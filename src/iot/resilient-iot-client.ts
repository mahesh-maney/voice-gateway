import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { CanonicalResult } from '../domain/canonical-result.js';
import type { IotCoreClient } from './iot-core.interface.js';
import { IotTimeoutError, CircuitOpenError } from '../core/errors.js';
import { logger } from '../util/logger.js';

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const race = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IotTimeoutError(ms)), ms);
  });
  return Promise.race([promise, race]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff + full jitter
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      // Full jitter: delay in [0, baseDelayMs * 2^(attempt-1)]
      const cap = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * cap;
      logger.warn('iot.retry', { attempt, maxAttempts, delayMs: Math.round(jitter), error: (err as Error).message });
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOpts {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** Consecutive successes needed in HALF_OPEN to close the circuit again. */
  successThreshold: number;
  /** Milliseconds to wait in OPEN before probing with a single request. */
  resetTimeoutMs: number;
}

class CircuitBreaker {
  private state: CBState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;

  constructor(private readonly opts: CircuitBreakerOpts) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt < this.opts.resetTimeoutMs) {
        throw new CircuitOpenError();
      }
      // Probe: allow one attempt in HALF_OPEN
      this.state = 'HALF_OPEN';
      this.successes = 0;
      logger.warn('iot.circuit.half-open', {});
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.opts.successThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        logger.info('iot.circuit.closed', {});
      }
    } else {
      // Reset failure count on any success in CLOSED state
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === 'HALF_OPEN' || this.failures >= this.opts.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      logger.error('iot.circuit.open', { consecutiveFailures: this.failures });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResilientOptions {
  /** Per-attempt timeout in ms before throwing IotTimeoutError. */
  timeoutMs: number;
  retry: {
    /** Total attempts (1 = no retry). */
    maxAttempts: number;
    /** Base delay for exponential backoff in ms. */
    baseDelayMs: number;
  };
  circuitBreaker: CircuitBreakerOpts;
}

/**
 * Wraps any IotCoreClient with three reliability layers:
 *
 *   [Circuit Breaker]
 *     → fails fast when the IoT core is known-down; probes after resetTimeoutMs
 *   [Retry + jitter]
 *     → retries transient failures up to maxAttempts with exponential backoff
 *   [Timeout]
 *     → each individual attempt is bounded by timeoutMs
 *
 * The circuit breaker sees ONE failure only when ALL retry attempts are
 * exhausted — a single transient error that succeeds on retry does not count.
 */
export class ResilientIotCoreClient implements IotCoreClient {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly inner: IotCoreClient,
    private readonly opts: ResilientOptions,
  ) {
    this.breaker = new CircuitBreaker(opts.circuitBreaker);
  }

  execute(cmd: CanonicalCommand): Promise<CanonicalResult> {
    logger.debug('iot.resilient.execute', {
      commandId: cmd.commandId,
      timeoutMs: this.opts.timeoutMs,
      maxAttempts: this.opts.retry.maxAttempts,
    });
    return this.breaker.execute(() =>
      withRetry(
        () => {
          logger.debug('iot.attempt', { commandId: cmd.commandId });
          return withTimeout(this.inner.execute(cmd), this.opts.timeoutMs);
        },
        this.opts.retry.maxAttempts,
        this.opts.retry.baseDelayMs,
      ),
    );
  }
}
