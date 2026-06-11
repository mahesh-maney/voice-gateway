import { requestContext } from './request-context.js';

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<Level, number> = {
  debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

const configured: Level =
  (process.env['LOG_LEVEL'] as Level | undefined) ??
  (process.env['NODE_ENV'] === 'test' ? 'silent' : 'info');

function log(level: Exclude<Level, 'silent'>, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[configured]) return;

  const ctx = requestContext.getStore();
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? { requestId: ctx.requestId } : {}),
    ...meta,
  };

  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
