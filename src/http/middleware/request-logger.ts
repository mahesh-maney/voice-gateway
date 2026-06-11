import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../../util/logger.js';
import { requestContext } from '../../util/request-context.js';

/**
 * Per-request middleware that:
 *   1. Assigns a requestId (from X-Request-Id header or generated UUID).
 *   2. Runs the rest of the request inside AsyncLocalStorage so every logger
 *      call emits the same requestId automatically.
 *   3. Logs the incoming request and the outgoing response with timing.
 *   4. Sets X-Request-Id on the response.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, () => {
    const start = Date.now();

    logger.debug('http.request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      correlationId: req.headers['x-correlation-id'],
    });

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('http.response', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        contentLength: res.getHeader('content-length'),
      });
    });

    next();
  });
}
