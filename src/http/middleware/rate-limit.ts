import rateLimit from 'express-rate-limit';

/** Broad guard on all routes: 300 requests per 15-minute window per IP. */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Tighter limit on voice endpoints: 30 commands per minute per IP. */
export const voiceRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many voice commands per minute.' },
});
