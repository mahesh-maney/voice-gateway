import postgres from 'postgres';
import { config } from '../config.js';
import { InMemoryRepository } from '../repository/in-memory.repository.js';
import { PostgresRepository } from '../repository/postgres.repository.js';
import { InMemoryCommandLog, PostgresCommandLog } from '../repository/command-log.js';
import type { Repository } from '../repository/repository.js';
import type { CommandLog } from '../repository/command-log.js';
import { IdentityResolver } from './identity.js';
import { TargetResolver } from './resolver.js';
import { Dispatcher } from './dispatcher.js';
import { MockIotCoreClient } from '../iot/iot-core.client.js';
import { ResilientIotCoreClient } from '../iot/resilient-iot-client.js';
import { VoiceGateway } from './gateway.js';
import { AlexaAdapter } from '../adapters/alexa/alexa.adapter.js';
import { GoogleAdapter } from '../adapters/google/google.adapter.js';
import { SiriAdapter } from '../adapters/siri/siri.adapter.js';

export interface GatewayBundle {
  gateway: VoiceGateway;
  repo: Repository;
}

/**
 * Builds a fully-wired gateway.
 *
 * - When DATABASE_URL is set: uses PostgresRepository + PostgresCommandLog,
 *   both sharing a single postgres.js connection pool.
 * - Otherwise: uses in-memory implementations (development / tests).
 */
export function buildGateway(): GatewayBundle {
  let repo: Repository;
  let commandLog: CommandLog;

  if (config.databaseUrl) {
    // One shared pool for both the repository and the command log.
    const sql = postgres(config.databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    repo = new PostgresRepository(sql);
    commandLog = new PostgresCommandLog(sql);
  } else {
    repo = new InMemoryRepository();
    commandLog = new InMemoryCommandLog();
  }

  const identity = new IdentityResolver(repo);
  const resolver = new TargetResolver(repo);

  const iotClient = new ResilientIotCoreClient(new MockIotCoreClient(repo), {
    timeoutMs: config.iot.timeoutMs,
    retry: {
      maxAttempts: config.iot.retryMaxAttempts,
      baseDelayMs: config.iot.retryBaseDelayMs,
    },
    circuitBreaker: {
      failureThreshold: config.iot.circuitBreakerFailureThreshold,
      successThreshold: 2,
      resetTimeoutMs:   config.iot.circuitBreakerResetMs,
    },
  });
  const dispatcher = new Dispatcher(iotClient, commandLog);
  const adapters = [new AlexaAdapter(), new GoogleAdapter(), new SiriAdapter()];

  return { gateway: new VoiceGateway(adapters, identity, resolver, dispatcher), repo };
}
