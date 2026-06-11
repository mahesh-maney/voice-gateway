import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientIotCoreClient, type ResilientOptions } from '../src/iot/resilient-iot-client.js';
import { IotTimeoutError, CircuitOpenError } from '../src/core/errors.js';
import type { IotCoreClient } from '../src/iot/iot-core.interface.js';
import type { CanonicalCommand } from '../src/domain/canonical-command.js';
import type { CanonicalResult } from '../src/domain/canonical-result.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cmd: CanonicalCommand = {
  version: '1.0',
  commandId: 'cmd-1',
  correlationId: 'corr-1',
  receivedAt: new Date().toISOString(),
  kind: 'control',
  action: 'appliance.set_power',
  source: { platform: 'alexa', locale: 'en-US', requestId: 'req-1' },
  actor: { userId: 'user_42' },
  target: { applianceIds: ['ac_mbr'] },
  parameters: { power: 'on' },
};

const okResult: CanonicalResult = {
  commandId: 'cmd-1',
  action: 'appliance.set_power',
  status: 'success',
  summary: 'Done.',
  outcomes: [],
};

/** Options with no retry delay and a low circuit-breaker threshold for fast tests. */
function opts(overrides: Partial<ResilientOptions> = {}): ResilientOptions {
  return {
    timeoutMs: 200,
    retry: { maxAttempts: 3, baseDelayMs: 0 }, // 0 delay → retries are immediate
    circuitBreaker: { failureThreshold: 3, successThreshold: 2, resetTimeoutMs: 1_000 },
    ...overrides,
  };
}

function makeClient(inner: IotCoreClient, o = opts()) {
  return new ResilientIotCoreClient(inner, o);
}

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------

describe('ResilientIotCoreClient — retry', () => {
  it('succeeds on the first attempt without retrying', async () => {
    const inner = { execute: vi.fn().mockResolvedValue(okResult) };
    const result = await makeClient(inner).execute(cmd);

    expect(result).toEqual(okResult);
    expect(inner.execute).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and returns the result on a later attempt', async () => {
    const inner = {
      execute: vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(okResult),
    };
    const result = await makeClient(inner).execute(cmd);

    expect(result).toEqual(okResult);
    expect(inner.execute).toHaveBeenCalledTimes(2);
  });

  it('exhausts all attempts and throws the last error', async () => {
    const inner = { execute: vi.fn().mockRejectedValue(new Error('persistent')) };
    const client = makeClient(inner, opts({ retry: { maxAttempts: 3, baseDelayMs: 0 } }));

    await expect(client.execute(cmd)).rejects.toThrow('persistent');
    expect(inner.execute).toHaveBeenCalledTimes(3);
  });

  it('does not retry when maxAttempts is 1', async () => {
    const inner = { execute: vi.fn().mockRejectedValue(new Error('fail')) };
    const client = makeClient(inner, opts({ retry: { maxAttempts: 1, baseDelayMs: 0 } }));

    await expect(client.execute(cmd)).rejects.toThrow('fail');
    expect(inner.execute).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeout behaviour
// ---------------------------------------------------------------------------

describe('ResilientIotCoreClient — timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('throws IotTimeoutError when the call exceeds timeoutMs', async () => {
    // A promise that never resolves — simulates a hung IoT call
    const inner = { execute: vi.fn().mockReturnValue(new Promise(() => {})) };
    const client = makeClient(inner, opts({
      timeoutMs: 100,
      retry: { maxAttempts: 1, baseDelayMs: 0 }, // no retry so only one timer fires
    }));

    const promise = client.execute(cmd);
    // Attach the rejection handler BEFORE advancing fake time.
    // If we advanced first, Node.js would see the rejection as "unhandled"
    // for the brief window before the assertion's .catch() is attached.
    const assertion = expect(promise).rejects.toThrow(IotTimeoutError);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });

  it('does not throw when the call resolves before the timeout', async () => {
    const inner = {
      execute: vi.fn().mockImplementation(
        () => new Promise<CanonicalResult>((resolve) => setTimeout(() => resolve(okResult), 50)),
      ),
    };
    const client = makeClient(inner, opts({
      timeoutMs: 200,
      retry: { maxAttempts: 1, baseDelayMs: 0 },
    }));

    const promise = client.execute(cmd);
    const assertion = expect(promise).resolves.toEqual(okResult);
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker behaviour
// ---------------------------------------------------------------------------

describe('ResilientIotCoreClient — circuit breaker', () => {
  it('stays CLOSED and resets the failure count when a call succeeds', async () => {
    const inner = {
      execute: vi.fn()
        .mockRejectedValueOnce(new Error('fail'))  // call 1 — failure 1
        .mockRejectedValueOnce(new Error('fail'))  // call 2 — failure 2
        .mockResolvedValueOnce(okResult)           // call 3 — success → resets counter
        .mockRejectedValueOnce(new Error('fail'))  // call 4 — failure 1 (counter was reset)
        .mockRejectedValueOnce(new Error('fail'))  // call 5 — failure 2 (< threshold 3)
        .mockResolvedValue(okResult),              // call 6+ — success; circuit never opened
    };
    const client = makeClient(inner, opts({ retry: { maxAttempts: 1, baseDelayMs: 0 } }));

    await expect(client.execute(cmd)).rejects.toThrow();       // failure 1
    await expect(client.execute(cmd)).rejects.toThrow();       // failure 2 (still < 3)
    await expect(client.execute(cmd)).resolves.toEqual(okResult); // success → reset counter
    await expect(client.execute(cmd)).rejects.toThrow();       // failure 1 again
    await expect(client.execute(cmd)).rejects.toThrow();       // failure 2 again (still < 3)
    await expect(client.execute(cmd)).resolves.toEqual(okResult); // still works
  });

  it('opens the circuit after `failureThreshold` consecutive failures', async () => {
    const inner = { execute: vi.fn().mockRejectedValue(new Error('down')) };
    const client = makeClient(inner, opts({
      retry: { maxAttempts: 1, baseDelayMs: 0 },
      circuitBreaker: { failureThreshold: 3, successThreshold: 2, resetTimeoutMs: 5_000 },
    }));

    // Exhaust the threshold
    for (let i = 0; i < 3; i++) {
      await expect(client.execute(cmd)).rejects.toThrow('down');
    }

    // Circuit is now OPEN — next call must NOT reach the IoT client
    await expect(client.execute(cmd)).rejects.toThrow(CircuitOpenError);
    expect(inner.execute).toHaveBeenCalledTimes(3); // not 4
  });

  it('throws CircuitOpenError without calling the inner client when circuit is OPEN', async () => {
    const inner = { execute: vi.fn().mockRejectedValue(new Error('down')) };
    const client = makeClient(inner, opts({
      retry: { maxAttempts: 1, baseDelayMs: 0 },
      circuitBreaker: { failureThreshold: 2, successThreshold: 2, resetTimeoutMs: 60_000 },
    }));

    await expect(client.execute(cmd)).rejects.toThrow();
    await expect(client.execute(cmd)).rejects.toThrow(); // opens circuit

    const callsBefore = vi.mocked(inner.execute).mock.calls.length;
    await expect(client.execute(cmd)).rejects.toThrow(CircuitOpenError);
    // inner was not called for the 3rd request
    expect(vi.mocked(inner.execute).mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker — half-open / recovery
// ---------------------------------------------------------------------------

describe('ResilientIotCoreClient — circuit breaker recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('probes with one request after resetTimeoutMs (HALF_OPEN)', async () => {
    const inner = { execute: vi.fn().mockRejectedValue(new Error('down')) };
    const client = makeClient(inner, opts({
      retry: { maxAttempts: 1, baseDelayMs: 0 },
      circuitBreaker: { failureThreshold: 2, successThreshold: 2, resetTimeoutMs: 1_000 },
    }));

    // Open the circuit
    await expect(client.execute(cmd)).rejects.toThrow();
    await expect(client.execute(cmd)).rejects.toThrow();
    await expect(client.execute(cmd)).rejects.toThrow(CircuitOpenError);

    // Advance past resetTimeoutMs — circuit should probe (HALF_OPEN)
    await vi.advanceTimersByTimeAsync(1_001);

    // The probe reaches the inner client (it still fails → re-opens).
    // Attach the rejection handler before advancing time further so
    // Node does not see a momentary unhandled rejection.
    const callsBefore = vi.mocked(inner.execute).mock.calls.length;
    const probePromise = client.execute(cmd);
    const probeAssertion = expect(probePromise).rejects.toThrow('down');
    await vi.advanceTimersByTimeAsync(0); // flush microtasks
    await probeAssertion;
    expect(vi.mocked(inner.execute).mock.calls.length).toBe(callsBefore + 1);
  });

  it('closes the circuit after successThreshold successes in HALF_OPEN', async () => {
    const inner = {
      execute: vi.fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'))
        // Recover: two successes in HALF_OPEN close the circuit
        .mockResolvedValue(okResult),
    };
    const client = makeClient(inner, opts({
      retry: { maxAttempts: 1, baseDelayMs: 0 },
      circuitBreaker: { failureThreshold: 2, successThreshold: 2, resetTimeoutMs: 500 },
    }));

    // Open the circuit
    await expect(client.execute(cmd)).rejects.toThrow();
    await expect(client.execute(cmd)).rejects.toThrow();

    // Advance to HALF_OPEN
    await vi.advanceTimersByTimeAsync(501);

    // Two successes should close the circuit
    await expect(client.execute(cmd)).resolves.toEqual(okResult); // HALF_OPEN success 1
    await expect(client.execute(cmd)).resolves.toEqual(okResult); // HALF_OPEN success 2 → CLOSED

    // Now the circuit is closed — inner still reachable
    await expect(client.execute(cmd)).resolves.toEqual(okResult);
  });
});
