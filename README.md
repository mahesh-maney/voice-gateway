# Voice Gateway

A production-grade **microservice** that lets users control IoT appliances by voice.
Alexa is fully implemented; **Google Assistant** and **Siri** are stubbed plug points
ready to be filled in without touching the core.

> Example: the user says *"turn on the AC at master bedroom"* and the matching
> appliance is switched on. Replies are spoken back through the assistant.

---

## The idea in one line

Every assistant speaks a different language. This service puts **one adapter
per assistant** at the edge, each translating into a single **canonical command**
that the rest of the system understands. Adding an assistant = adding one adapter.
The core never changes.

```
Alexa  ─┐
Google ─┼─►  adapter  ─►  canonical command  ─►  resolve ─► dispatch ─► IoT core
Siri   ─┘   (per platform)   (one shared shape)        (shared pipeline)
```

---

## Domain model

```
User ──< Site ──< Scene ──< Appliance
```

- **User** owns one or more **Sites** (e.g. "My Home", "Office").
- A **Site** contains **Scenes** — a Scene is a room/area (e.g. "Master Bedroom").
- A **Scene** contains **Appliances** — any household item (AC, light, fan, TV, …).

When the user doesn't name a site, the **default site** is used. So
*"turn on the AC at master bedroom"* resolves to: default site → scene
"Master Bedroom" → the air conditioner there.

---

## Quick start

Requires Node.js 18.18+.

```bash
npm install        # install dependencies

npm run demo       # run several spoken commands through the gateway (no server)
npm test           # run the test suite (vitest) — 46 tests
npm run dev        # start the HTTP server on http://localhost:3000
npm run typecheck  # type-check only
npm run build      # compile to dist/
```

### Try the HTTP endpoint

```bash
npm run dev
# in another terminal:
curl -s http://localhost:3000/voice/alexa \
  -H 'content-type: application/json' \
  -d @examples/alexa-request.json | jq
```

Expected reply:

```json
{
  "version": "1.0",
  "response": {
    "outputSpeech": {
      "type": "SSML",
      "ssml": "<speak>Okay. Turned on the air conditioner in the master bedroom.</speak>"
    },
    "shouldEndSession": true
  }
}
```

### Other endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + DB connectivity check |
| `GET` | `/metrics` | Prometheus metrics (scrape with Grafana Agent / Prometheus) |
| `POST` | `/voice/alexa` | Alexa skill endpoint |
| `POST` | `/voice/google` | Google Assistant plug point (requires `X-Api-Key`) |
| `POST` | `/voice/siri` | Siri / iOS Shortcuts plug point (requires `X-Api-Key`) |

---

## Project layout

```
src/
  domain/          canonical-command, canonical-result, actions, entities
  adapters/        adapter.ts (the plug contract)
    alexa/           alexa.adapter.ts  (implemented), types, intent→action map
    google/          google.adapter.ts (stub — plug point)
    siri/            siri.adapter.ts   (stub — plug point)
  core/            gateway (pipeline), identity, resolver, dispatcher,
                   synonyms, errors, composition (wiring)
  iot/             iot-core.interface.ts, iot-core.client.ts (mock),
                   resilient-iot-client.ts (retry + circuit breaker + timeout)
  repository/      repository.ts (interface), in-memory impl, postgres impl,
                   command-log.ts (idempotency), seed-data, schema.sql
  http/
    middleware/    security-headers, rate-limit, api-key, alexa-verify, timeout,
                   request-logger
    validation/    alexa.schema.ts (Zod)
    app.ts         Express routes
  observability/   metrics.ts (prom-client)
  util/            logger.ts, text.ts, request-context.ts (AsyncLocalStorage)
  config.ts        all env-var config in one place
  index.ts         server entry point + graceful shutdown
tests/
  http.test.ts           HTTP integration (supertest)
  alexa-flow.test.ts     end-to-end Alexa pipeline
  resolver.test.ts       TargetResolver unit tests
  identity.test.ts       IdentityResolver unit tests
  dispatcher.test.ts     idempotency tests
  resilient-iot-client.test.ts  retry / circuit breaker / timeout
scripts/demo.ts    runnable demo (no server)
examples/          alexa-request.json
alexa-skill/       interaction-model.json (intents, slots, utterances)
```

---

## How a request flows (the pipeline)

```
HTTP POST /voice/alexa
  │
  ├─ requestTimeout middleware    (408 if no response within requestTimeoutMs)
  ├─ alexaVerify middleware        (signature + timestamp — skipped outside prod)
  ├─ validateAlexa middleware      (Zod schema — rejects malformed bodies)
  ├─ voiceRateLimit middleware     (30 req/min per IP)
  │
  ▼
VoiceGateway.handle('alexa', body, locale)
  │
  ├─ 1. AlexaAdapter.toCanonical   parse intent + slots → CanonicalCommand
  │      └─ IdentityResolver       access token / platform id → internal userId
  │
  ├─ 2. TargetResolver.resolve     spoken names → siteId, sceneId, applianceIds
  │
  ├─ 3. Dispatcher.dispatch
  │      ├─ CommandLog.find        idempotency check (same commandId → cached result)
  │      └─ ResilientIotCoreClient.execute
  │           ├─ CircuitBreaker    fail-fast when IoT is known-down
  │           ├─ withRetry         exponential backoff + jitter (3 attempts)
  │           └─ withTimeout       per-attempt timeout (5 s default)
  │
  └─ 4. AlexaAdapter.toResponse    CanonicalResult → Alexa SSML reply
```

Only steps 1 and 4 are platform-specific. Steps 2–3 are identical for every assistant.

---

## The canonical command (the contract)

```ts
interface CanonicalCommand {
  version: '1.0';
  commandId: string;        // gateway UUID — idempotency + tracing
  correlationId: string;    // echoed as X-Correlation-Id response header
  receivedAt: string;       // ISO 8601
  kind: 'control' | 'query';
  action: CanonicalAction;  // e.g. 'appliance.set_power'
  source:  { platform; locale; surfaceDeviceId?; requestId };
  actor:   { userId; platformUserId? };          // OUR internal user id
  target:  { spokenScene?; spokenAppliance?; siteId?; sceneId?; applianceIds };
  parameters: { power?; temperature?; brightness?; fanSpeed?; ... };
}
```

Canonical actions live in `src/domain/actions.ts`. Keep that list small and
stable — it is what the IoT core depends on.

---

## Configuration

Copy `.env.example` to `.env` and adjust. All values have sensible defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | `production` enables Alexa signature verification |
| `DATABASE_URL` | *(unset)* | PostgreSQL connection string. Unset → in-memory store |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` / `silent` |
| `API_KEY` | *(unset)* | Secret for `X-Api-Key` header on Google / Siri routes |
| `SKIP_ALEXA_VERIFY` | `true` | Set `false` in production-like environments for testing |
| `REQUEST_TIMEOUT_MS` | `7500` | Max ms before a voice route returns 408 (Alexa needs < 8 s) |
| `IOT_TIMEOUT_MS` | `5000` | Per-attempt IoT call timeout |
| `IOT_RETRY_MAX_ATTEMPTS` | `3` | Total attempts including the first |
| `IOT_RETRY_BASE_DELAY_MS` | `100` | Base delay for exponential backoff |
| `IOT_CB_FAILURE_THRESHOLD` | `5` | Consecutive failures before circuit opens |
| `IOT_CB_RESET_MS` | `30000` | ms to wait in OPEN before probing again |

---

## Security

| Concern | Implementation |
|---------|---------------|
| Alexa request authenticity | RSA-SHA1 signature + timestamp verification (`alexa-verify.ts`) — auto-enabled in `NODE_ENV=production` |
| Google / Siri auth | `X-Api-Key` header checked against `API_KEY` env var |
| Rate limiting | 300 req / 15 min (global) + 30 req / min (voice routes) via `express-rate-limit` |
| Input validation | Zod schema rejects malformed Alexa request bodies before they reach the gateway |
| Security headers | `helmet` sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc. |
| Request timeout | 408 returned if handler stalls past `REQUEST_TIMEOUT_MS` |

---

## Data persistence

By default the service uses an **in-memory repository** (great for local dev and tests).
Set `DATABASE_URL` to switch to **PostgreSQL**:

```bash
# First run the schema (once per DB):
psql $DATABASE_URL -f src/repository/schema.sql

# Then start the service:
DATABASE_URL=postgresql://user:pass@localhost:5432/voice_gateway npm run dev
```

The `Repository` interface (`src/repository/repository.ts`) is the swap boundary.
`PostgresRepository` and `InMemoryRepository` are interchangeable — nothing else
in the codebase knows which one is in use.

**Idempotency:** every command execution is recorded in the `command_log` table.
A replayed request (same `commandId`) returns the cached result without re-firing
the device. Works correctly across multiple service instances.

---

## Observability

### Logging

Structured JSON on stdout. Every line within a request automatically includes
`requestId` via `AsyncLocalStorage` — no manual threading required.

```json
{"ts":"2026-06-11T12:00:00Z","level":"info","msg":"command.resolved",
 "requestId":"550e8400-e29b","correlationId":"req-abc","site":"My Home",
 "scene":"Master Bedroom","applianceIds":["ac_mbr"]}
```

Set `LOG_LEVEL=debug` for verbose output including every HTTP request.

### Metrics

Prometheus-compatible metrics at `GET /metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `voice_requests_total{platform}` | Counter | Total voice commands by platform |
| `voice_request_duration_seconds{platform}` | Histogram | Gateway pipeline latency |
| `nodejs_*` | Various | Default Node.js process metrics (heap, GC, event loop lag) |

### Response headers

| Header | Set on | Value |
|--------|--------|-------|
| `X-Request-Id` | All responses | UUID generated per HTTP request (or echoed from incoming header) |
| `X-Correlation-Id` | Voice responses | Platform's own `requestId` — use to correlate gateway logs with assistant logs |

### Health check

`GET /health` returns `200 ok` or `503 degraded` depending on DB connectivity:

```json
{ "status": "ok", "service": "voice-gateway", "checks": { "database": "ok" } }
```

---

## Reliability

### IoT resilience layers

Every IoT call passes through three stacked layers (outermost first):

```
CircuitBreaker
  └─ withRetry (exponential backoff + full jitter)
       └─ withTimeout (per-attempt)
            └─ your real IoT client
```

**Timeout** — each individual attempt is bounded by `IOT_TIMEOUT_MS` (default 5 s).
A hung IoT call throws `IotTimeoutError` rather than blocking indefinitely.

**Retry** — transient failures are retried up to `IOT_RETRY_MAX_ATTEMPTS` times.
Delay between attempts follows `random(0, baseDelay × 2^attempt)` (full jitter)
to prevent thundering herd.

**Circuit breaker** — after `IOT_CB_FAILURE_THRESHOLD` consecutive exhausted-retry
sequences the circuit opens. Subsequent calls fail immediately with `CircuitOpenError`
(no IoT round-trips). After `IOT_CB_RESET_MS` the circuit probes with one request.
State transitions (`OPEN` / `HALF_OPEN` / `CLOSED`) are logged.

`IotTimeoutError` and `CircuitOpenError` both extend `GatewayError` so the voice
assistant speaks a friendly message rather than a generic error.

### Server timeouts

```
server.keepAliveTimeout  = 65 s   (> typical load balancer idle of 60 s)
server.headersTimeout    = 66 s
server.requestTimeout    = REQUEST_TIMEOUT_MS
```

---

## Adding a new assistant (e.g. Google)

1. Open `src/adapters/google/google.adapter.ts`.
2. Implement the three `VoiceAdapter` methods, exactly like `AlexaAdapter`:
   - `toCanonical` — parse Google's request → `CanonicalCommand`
   - `toResponse` — `CanonicalResult` → Google's reply
   - `toErrorResponse` — `GatewayError` → a friendly spoken reply
3. Add a Google intent→action map (like `alexa.intents.ts`).
4. That's it. `identity`, `resolver`, `dispatcher`, resilience layers, and the
   IoT core are reused unchanged. The route `/voice/google` is already wired.

**Siri note:** Siri is mostly on-device (App Intents / Shortcuts) or HomeKit,
not cloud-to-cloud like Alexa/Google. Part of its "adapter" lives in the iOS
app, which calls `/voice/siri` over an authenticated REST call and maps into the
same `CanonicalCommand`.

---

## Connecting the real Alexa skill

1. Import `alexa-skill/interaction-model.json` into the Alexa Developer Console
   (Build → JSON Editor).
2. Set the skill endpoint to `POST /voice/alexa` (HTTPS endpoint or AWS Lambda).
3. Enable **account linking** so each user gets an access token; map that token
   to your user in `IdentityResolver` / your user store.
4. Set `NODE_ENV=production` — Alexa request signature verification is
   automatically enabled and validates every incoming request against Amazon's
   certificate chain.

### Alexa interaction model

The skill model lives in `alexa-skill/interaction-model.json`. Key parts:

| Part | Value |
|------|-------|
| Invocation name | `"my home"` — user says *"Alexa, ask my home to …"* |
| Appliance slot type (`ApplianceType`) | AC, light, fan, TV, geyser, curtains, exhaust fan, microwave, speaker, projector (each with synonyms) |
| Scene slot type (`SceneType`) | master bedroom, living room, kitchen, cabin, conference hall |

Supported intents:

| Intent | Slots | Example utterance |
|--------|-------|-------------------|
| `TurnOnIntent` | Appliance, Scene | *"turn on the AC in the master bedroom"* |
| `TurnOffIntent` | Appliance, Scene | *"switch off the fan in living room"* |
| `SetTemperatureIntent` | Appliance, Scene, Temperature | *"set the AC to 22 degrees in the cabin"* |
| `SetBrightnessIntent` | Appliance, Scene, Brightness | *"dim the living room lights to 40"* |
| `SetFanSpeedIntent` | Appliance, Scene, FanSpeed | *"set the fan to speed 2 in master bedroom"* |
| `OpenIntent` | Appliance, Scene | *"open the curtains in the living room"* |
| `CloseIntent` | Appliance, Scene | *"close the living room curtains"* |
| `QueryStateIntent` | Appliance, Scene | *"is the AC on in the master bedroom"* |

To add a new room or appliance type, edit the `types` array in the JSON and re-import it — no gateway code changes required.

---

## Replacing the mock IoT core

`src/iot/iot-core.client.ts` updates in-memory state and returns a spoken summary.
Replace it with a client that calls your real IoT core over HTTP / gRPC / MQTT:

1. Implement `IotCoreClient` (`src/iot/iot-core.interface.ts`).
2. Swap it in `src/core/composition.ts` where `MockIotCoreClient` is instantiated.
3. `ResilientIotCoreClient` wraps whatever client you provide — retries, circuit
   breaker, and timeout work automatically with your real client.

### IoT core resilience configuration

All resilience knobs are environment variables (see also the Configuration table above):

```bash
IOT_TIMEOUT_MS=5000            # per-attempt timeout — throws IotTimeoutError if exceeded
IOT_RETRY_MAX_ATTEMPTS=3       # total attempts including the first (set to 1 to disable retry)
IOT_RETRY_BASE_DELAY_MS=100    # base delay for exponential backoff + full jitter between retries
IOT_CB_FAILURE_THRESHOLD=5     # consecutive retry-exhausted failures before circuit opens
IOT_CB_RESET_MS=30000          # ms the circuit stays OPEN before sending one probe (HALF_OPEN)
```

The layers stack like this (outermost first):

```
CircuitBreaker          ← fail-fast when IoT is known-down; probes after resetTimeoutMs
  └─ withRetry          ← exponential backoff + full jitter, up to maxAttempts
       └─ withTimeout   ← per-attempt deadline; throws IotTimeoutError if hung
            └─ your IoT client
```

`IotTimeoutError` and `CircuitOpenError` both extend `GatewayError` so the voice
assistant always speaks a friendly message instead of a raw error.

---

## Seed data

The in-memory store (`src/repository/seed-data.ts`) ships with one demo user and
two sites. This is the data used by `npm run demo` and all tests.

```
User: Ravi  (id: user_42)
  accessToken       : demo-token-ravi
  Alexa platform id : amzn1.ask.account.RAVI

├── Site: My Home  [default]  (site_home)
│     ├── Master Bedroom  (scene_mbr)
│     │     ac_mbr       Air Conditioner  — power, temperature (24 °C), mode: cool
│     │     light_mbr    Light            — power, brightness (80 %)
│     │     fan_mbr      Fan              — power, fan_speed (3)
│     │     tv_mbr       TV               — power
│     │     geyser_mbr   Water Heater     — power, temperature (45 °C)
│     │
│     ├── Living Room  (scene_living)
│     │     ac_living      Air Conditioner  — power, temperature (25 °C), mode: cool
│     │     light_living   Lights           — power, brightness (100 %)
│     │     tv_living      TV               — power
│     │     curtain_living Curtains         — open/close, level (0)
│     │     speaker_living Speaker          — power
│     │
│     └── Kitchen  (scene_kitchen)
│           light_kitchen   Light        — power, brightness (90 %)
│           exhaust_kitchen Exhaust Fan  — power
│           micro_kitchen   Microwave    — power
│           fridge_kitchen  Refrigerator — power [starts ON]
│
└── Site: Office  (site_office)
      ├── Cabin  (scene_cabin)
      │     ac_cabin    Air Conditioner  — power, temperature (23 °C)
      │     light_cabin Light            — power
      │
      └── Conference Hall  (scene_hall)
            ac_hall    Air Conditioner  — power, temperature (22 °C)
            light_hall Lights           — power
            proj_hall  Projector        — power
```

All appliances default to `power: 'off'` except the kitchen refrigerator.
When `DATABASE_URL` is unset the service uses this data directly (no DB needed).

---

## How spoken names are resolved

`TargetResolver` (`src/core/resolver.ts`) runs three steps in sequence, all
shared across every voice assistant:

### 1. Site

If the user didn't name a site → the user's **default site** is used automatically.
If they named one → `normalize(spoken) === normalize(site.name)` (exact match).

### 2. Scene

Two-pass match against all scenes in the resolved site:

```
Pass 1 — exact:     normalize(scene.name) === normalize(spoken)
Pass 2 — substring: one value contains the other
```

So *"master bedroom"*, *"the master bedroom"*, and *"bedroom"* all resolve to
`scene_mbr`.

### 3. Appliance

`normalize()` (`src/util/text.ts`) strips noise first:

```
lowercase → strip non-alphanumeric → remove filler words
            (the, my, a, an, please, to, in, at, on) → collapse spaces
```

`applianceTypeFor()` (`src/core/synonyms.ts`) then maps the cleaned word to a
canonical appliance type:

| Spoken | Resolved type |
|--------|---------------|
| ac, a c, air con, cooler | `air_conditioner` |
| light, lights, lamp, bulb | `light` |
| tv, telly, television | `television` |
| geyser, water heater | `water_heater` |
| fridge | `refrigerator` |
| blinds, curtain | `curtain` |
| motor, pump | `water_pump` |

Appliances in the scene are then filtered:

```ts
matches = inScene.filter(ap =>
  (type && ap.type === type)      // synonym matched → filter by type
  || normalize(ap.name) === want  // fallback: exact name match
)
```

All matches are returned — a scene with two ACs controls both. If nothing
matches, `ApplianceNotFoundError` is thrown and the adapter speaks
*"I couldn't find that device"*.

---

## Repository

`Repository` (`src/repository/repository.ts`) is the data-access boundary.
All methods return `Promise<T>` so both implementations satisfy the same interface.

### InMemoryRepository

Four `Map`s seeded from `seed-data.ts` at construction time:

```
users      Map<id, User>
sites      Map<id, Site>
scenes     Map<id, Scene>
appliances Map<id, Appliance>   ← deep-cloned so mutations don't corrupt the seed
```

| Method | Strategy |
|--------|----------|
| `getUserByAccessToken` | Linear scan, match on `accessToken` field |
| `getUserByPlatformId` | Linear scan, match on `platformUserIds[platform]` |
| `getSitesForUser` | Filter by `userId` |
| `getDefaultSite` | Filter by `userId` → find `isDefault: true`, fallback to `[0]` |
| `getScenesForSite` | Filter by `siteId` |
| `getAppliancesForScene` | Filter by `sceneId` |
| `getAppliance` | Direct `Map.get` — O(1) |
| `updateApplianceState` | Merge patch: `{ ...current, ...patch }` — preserves unpatched fields |

`ping()` and `close()` are not implemented (they are optional on the interface
and only needed by `PostgresRepository`).

### PostgresRepository

Activated when `DATABASE_URL` is set. Uses a single shared `postgres.js`
connection pool (max 10 connections). The schema lives in
`src/repository/schema.sql` — run it once before starting the service:

```bash
psql $DATABASE_URL -f src/repository/schema.sql
```

---

## Docker

```bash
docker compose up --build
# service on http://localhost:3000
```

For production, pass environment variables to the container:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e API_KEY=... \
  voice-gateway
```
