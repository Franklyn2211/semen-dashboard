-- +goose Up
-- +goose StatementBegin

-- Expand roles to: SUPER_ADMIN, MANAGEMENT, OPERATOR, DISTRIBUTOR
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS distributor_id BIGINT REFERENCES distributors(id) ON DELETE SET NULL;

-- Migrate old roles to new roles.
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';
UPDATE users SET role = 'OPERATOR'    WHERE role = 'OPS';
UPDATE users SET role = 'MANAGEMENT'  WHERE role = 'EXEC';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','MANAGEMENT','OPERATOR','DISTRIBUTOR'));

-- RBAC configuration stored in DB (per-role JSON)
CREATE TABLE IF NOT EXISTS rbac_config (
  role       TEXT PRIMARY KEY CHECK (role IN ('SUPER_ADMIN','MANAGEMENT','OPERATOR','DISTRIBUTOR')),
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stock threshold settings per warehouse + cement type
CREATE TABLE IF NOT EXISTS threshold_settings (
  id            BIGSERIAL PRIMARY KEY,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  cement_type   TEXT NOT NULL,
  min_stock     DOUBLE PRECISION NOT NULL,
  safety_stock  DOUBLE PRECISION NOT NULL,
  warning_level DOUBLE PRECISION NOT NULL,
  critical_level DOUBLE PRECISION NOT NULL,
  lead_time_days INT NOT NULL DEFAULT 3,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, cement_type)
);

-- Alert configuration stored in DB
CREATE TABLE IF NOT EXISTS alert_configs (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT true,
  severity         TEXT NOT NULL CHECK (severity IN ('Low','Medium','High')),
  recipients_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  recipients_users BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
  channels         JSONB NOT NULL DEFAULT '{"inApp":true,"email":false}'::jsonb,
  params           JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit/system logs stored in DB
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs(ts DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS alert_configs;
DROP TABLE IF EXISTS threshold_settings;
DROP TABLE IF EXISTS rbac_config;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Best-effort downgrade mapping.
UPDATE users SET role = 'ADMIN' WHERE role = 'SUPER_ADMIN';
UPDATE users SET role = 'OPS'   WHERE role = 'OPERATOR';
UPDATE users SET role = 'EXEC'  WHERE role = 'MANAGEMENT';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN','OPS','EXEC'));

ALTER TABLE users DROP COLUMN IF EXISTS distributor_id;

-- +goose StatementEnd
