export interface IotConfig {
  /** Per-attempt timeout before IotTimeoutError is thrown (ms). */
  timeoutMs: number;
  /** Maximum call attempts including the first (1 = no retry). */
  retryMaxAttempts: number;
  /** Base delay for exponential-backoff jitter (ms). */
  retryBaseDelayMs: number;
  /** Consecutive failures before the circuit opens. */
  circuitBreakerFailureThreshold: number;
  /** How long the circuit stays OPEN before probing again (ms). */
  circuitBreakerResetMs: number;
}

export interface Config {
  port: number;
  env: string;
  /** Secret key required on X-Api-Key header for Google / Siri routes. */
  apiKey: string | undefined;
  /**
   * Skip Alexa request-signature verification.
   * Automatically true outside production; set SKIP_ALEXA_VERIFY=true to
   * also skip it in a production-like environment during testing.
   */
  skipAlexaVerify: boolean;
  /** PostgreSQL connection string. When unset, the in-memory repository is used. */
  databaseUrl: string | undefined;
  /** Minimum log level emitted. Defaults to 'info'; 'silent' suppresses all output. */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** Max ms a voice-route handler may run before a 408 is returned. */
  requestTimeoutMs: number;
  /** IoT core resilience settings. */
  iot: IotConfig;
}

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  apiKey: process.env.API_KEY || undefined,
  skipAlexaVerify:
    process.env.NODE_ENV !== 'production' ||
    process.env.SKIP_ALEXA_VERIFY === 'true',
  databaseUrl: process.env.DATABASE_URL || undefined,
  logLevel: (process.env.LOG_LEVEL as Config['logLevel']) ?? 'info',
  // Alexa requires a response within 8 s; leave 500 ms headroom.
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 7_500),
  iot: {
    timeoutMs:                      Number(process.env.IOT_TIMEOUT_MS                       ?? 5_000),
    retryMaxAttempts:               Number(process.env.IOT_RETRY_MAX_ATTEMPTS               ?? 3),
    retryBaseDelayMs:               Number(process.env.IOT_RETRY_BASE_DELAY_MS              ?? 100),
    circuitBreakerFailureThreshold: Number(process.env.IOT_CB_FAILURE_THRESHOLD             ?? 5),
    circuitBreakerResetMs:          Number(process.env.IOT_CB_RESET_MS                      ?? 30_000),
  },
};
