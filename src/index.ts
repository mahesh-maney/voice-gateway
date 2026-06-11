import { buildGateway } from './core/composition.js';
import { buildApp } from './http/app.js';
import { config } from './config.js';
import { logger } from './util/logger.js';

const { gateway, repo } = buildGateway();
const app = buildApp(gateway, repo);

const server = app.listen(config.port, () => {
  logger.info('voice-gateway.started', { port: config.port, env: config.env });
  logger.info('endpoints', {
    health:  `GET  http://localhost:${config.port}/health`,
    metrics: `GET  http://localhost:${config.port}/metrics`,
    alexa:   `POST http://localhost:${config.port}/voice/alexa`,
  });
});

// Keep-alive timeout slightly > the typical load-balancer idle timeout (60 s)
// to prevent the LB from sending a request on a connection Node is about to close.
server.keepAliveTimeout = 65_000;
// headersTimeout must exceed keepAliveTimeout to avoid a Node.js race condition.
server.headersTimeout = 66_000;
// Maximum time from receiving the first request byte to completing the read (Node 18+).
server.requestTimeout = config.requestTimeoutMs;

// Graceful shutdown — finish in-flight requests and close the DB pool.
async function shutdown(signal: string): Promise<void> {
  logger.info('voice-gateway.shutting-down', { signal });
  server.close(async () => {
    await repo.close?.();
    process.exit(0);
  });
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT'); });
