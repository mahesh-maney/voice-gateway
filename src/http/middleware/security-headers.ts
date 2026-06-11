import helmet from 'helmet';

// API-only service — disable CSP (no HTML served) but keep all other helmet defaults.
export const securityHeaders = helmet({ contentSecurityPolicy: false });
