import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config.js';

/**
 * Requires an X-Api-Key header matching the configured API_KEY.
 * Used on Google and Siri routes (Alexa uses its own signature-based auth).
 *
 * - In production: API_KEY must be set; requests without the correct key → 401.
 * - In development (no API_KEY set): requests pass through so local testing is easy.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiKey) {
    if (config.env === 'production') {
      // Misconfigured — fail closed rather than letting all traffic through.
      res.status(503).json({ error: 'Service not configured.' });
      return;
    }
    next();
    return;
  }

  const provided = req.headers['x-api-key'];
  if (provided !== config.apiKey) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  next();
}
