import type { Request, Response, NextFunction } from 'express';

/**
 * Returns an Express middleware that responds 408 Request Timeout if no
 * response has been sent within `ms` milliseconds.
 *
 * Apply on individual route groups rather than globally so health / metrics
 * endpoints are not affected by the voice-command timeout budget.
 */
export function requestTimeout(ms: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout.' });
      }
    }, ms);

    const clear = (): void => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}
