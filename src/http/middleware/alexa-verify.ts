import type { Request, Response, NextFunction } from 'express';
import { get } from 'https';
import { createVerify, X509Certificate } from 'crypto';
import { config } from '../../config.js';

// ---------------------------------------------------------------------------
// Cert URL validation
// ---------------------------------------------------------------------------

// Amazon serves Alexa signing certs from these hostnames.
const VALID_CERT_HOSTNAMES = new Set([
  's3.amazonaws.com',
  's3.dualstack.us-east-1.amazonaws.com',
]);

function isValidCertUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return (
    u.protocol === 'https:' &&
    VALID_CERT_HOSTNAMES.has(u.hostname) &&
    u.pathname.toLowerCase().startsWith('/echo.api/') &&
    (u.port === '' || u.port === '443')
  );
}

// ---------------------------------------------------------------------------
// Cert fetching with a 1-hour in-process cache
// ---------------------------------------------------------------------------

interface CertEntry { pem: string; expiresAt: number }
const certCache = new Map<string, CertEntry>();

async function fetchCert(url: string): Promise<string> {
  const hit = certCache.get(url);
  if (hit && hit.expiresAt > Date.now()) return hit.pem;

  return new Promise<string>((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Cert fetch failed: HTTP ${res.statusCode ?? 'unknown'}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const pem = Buffer.concat(chunks).toString('utf8');
        certCache.set(url, { pem, expiresAt: Date.now() + 60 * 60 * 1000 });
        resolve(pem);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Cert validation
// ---------------------------------------------------------------------------

function assertCertValid(pem: string): void {
  const cert = new X509Certificate(pem);

  if (new Date(cert.validTo) < new Date()) {
    throw new Error('Alexa signing certificate has expired.');
  }

  // The Subject Alternative Name must include echo-api.amazon.com
  // (format: "DNS:echo-api.amazon.com, DNS:...")
  const san = cert.subjectAltName ?? '';
  if (!san.includes('echo-api.amazon.com')) {
    throw new Error('Alexa certificate SAN does not contain echo-api.amazon.com.');
  }
}

// ---------------------------------------------------------------------------
// Timestamp validation — Alexa requires requests within 150 s of server time
// ---------------------------------------------------------------------------

function assertTimestampFresh(body: Record<string, unknown>): void {
  const timestamp = (body?.request as Record<string, unknown>)?.timestamp;
  if (typeof timestamp !== 'string') throw new Error('Missing request.timestamp.');

  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (Math.abs(ageMs) > 150_000) {
    throw new Error(`Request timestamp outside 150 s tolerance (${Math.round(ageMs / 1000)} s).`);
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Verifies that an incoming POST /voice/alexa request is genuinely from Amazon:
 *   1. SignatureCertChainUrl header points to a valid Amazon S3 cert.
 *   2. The cert is unexpired and carries the echo-api.amazon.com SAN.
 *   3. The Signature header (RSA-SHA1) matches the raw request body.
 *   4. The request timestamp is within 150 seconds of now.
 *
 * Set SKIP_ALEXA_VERIFY=true (or run outside production) to bypass during local dev.
 */
export async function alexaVerify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (config.skipAlexaVerify) { next(); return; }

  try {
    const certUrl = req.headers['signaturecertchainurl'];
    const signature = req.headers['signature'];

    if (typeof certUrl !== 'string' || typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing Alexa verification headers.' });
      return;
    }

    if (!isValidCertUrl(certUrl)) {
      res.status(400).json({ error: 'Invalid SignatureCertChainUrl.' });
      return;
    }

    const pem = await fetchCert(certUrl);
    assertCertValid(pem);

    const rawBody = (req as RawBodyRequest).rawBody;
    if (!rawBody?.length) {
      res.status(400).json({ error: 'Empty or missing request body.' });
      return;
    }

    // Alexa signs the raw request body with RSA-SHA1.
    const verifier = createVerify('RSA-SHA1');
    verifier.update(rawBody);
    if (!verifier.verify(pem, signature, 'base64')) {
      res.status(400).json({ error: 'Alexa request signature is invalid.' });
      return;
    }

    assertTimestampFresh(req.body as Record<string, unknown>);
    next();
  } catch (err) {
    res.status(400).json({ error: `Alexa verification failed: ${(err as Error).message}` });
  }
}
