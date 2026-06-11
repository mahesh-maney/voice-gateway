import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
}

/**
 * Stores per-request context (requestId) so any logger call within a
 * request — no matter how deep in the call stack — can emit the same id
 * without threading it through every function signature.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
