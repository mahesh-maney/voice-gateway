-- Voice-Gateway schema
-- Run once against your PostgreSQL database (or use a migration tool).

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              TEXT        NOT NULL,
  access_token      TEXT        NOT NULL UNIQUE,
  platform_user_ids JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS users_access_token_idx ON users (access_token);

CREATE TABLE IF NOT EXISTS sites (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  user_id    TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS sites_user_id_idx ON sites (user_id);

CREATE TABLE IF NOT EXISTS scenes (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS scenes_site_id_idx ON scenes (site_id);

CREATE TABLE IF NOT EXISTS appliances (
  id           TEXT     PRIMARY KEY,
  name         TEXT     NOT NULL,
  type         TEXT     NOT NULL,
  scene_id     TEXT     NOT NULL REFERENCES scenes (id) ON DELETE CASCADE,
  capabilities TEXT[]   NOT NULL DEFAULT '{}',
  state        JSONB    NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS appliances_scene_id_idx ON appliances (scene_id);

-- Idempotency log: stores the result of every executed command so replayed
-- requests (same commandId) return the cached result without re-firing the device.
CREATE TABLE IF NOT EXISTS command_log (
  command_id  TEXT        PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result      JSONB       NOT NULL
);
CREATE INDEX IF NOT EXISTS command_log_received_at_idx ON command_log (received_at);
