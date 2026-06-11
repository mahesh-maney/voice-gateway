import { requestContext } from './request-context.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<Level, number> = {
  debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

const configured: Level =
  (process.env['LOG_LEVEL'] as Level | undefined) ??
  (process.env['NODE_ENV'] === 'test' ? 'silent' : 'info');

// ---------------------------------------------------------------------------
// File writers — one combined file and one errors-only file.
// Disabled in test environment to keep test output clean.
// ---------------------------------------------------------------------------

const logsDir = process.env['LOG_DIR']
  ? path.resolve(process.env['LOG_DIR'])
  : path.resolve(process.cwd(), 'logs');

let combinedStream: fs.WriteStream | null = null;
let errorStream: fs.WriteStream | null = null;

if (process.env['NODE_ENV'] !== 'test' && configured !== 'silent') {
  fs.mkdirSync(logsDir, { recursive: true });
  combinedStream = fs.createWriteStream(path.join(logsDir, 'combined.log'), { flags: 'a' });
  errorStream   = fs.createWriteStream(path.join(logsDir, 'error.log'),    { flags: 'a' });
}

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

  const serialised = JSON.stringify(line);

  // Console — errors go to stderr, everything else to stdout
  (level === 'error' ? console.error : console.log)(serialised);

  // Files — append with newline
  combinedStream?.write(serialised + '\n');
  if (level === 'error') errorStream?.write(serialised + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};

/** Flush and close log file streams — call on graceful shutdown. */
export function closeLogs(): Promise<void> {
  return new Promise((resolve) => {
    let pending = 0;
    const done = () => { if (--pending === 0) resolve(); };
    if (combinedStream) { pending++; combinedStream.end(done); }
    if (errorStream)    { pending++; errorStream.end(done); }
    if (pending === 0) resolve();
  });
}
