-- +goose Up
-- +goose StatementBegin

-- Single-file bootstrap migration for fresh databases.
-- This replaces the previous incremental migrations.

-- ── Core tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL,
  distributor_id BIGINT NULL,
  disabled_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','MANAGEMENT','OPERATOR','DISTRIBUTOR'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS plants (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lat  DOUBLE PRECISION NOT NULL,
  lng  DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouses (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  capacity_tons DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS distributors (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  service_radius_km DOUBLE PRECISION NOT NULL DEFAULT 10
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='users_distributor_id_fkey' AND table_name='users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_distributor_id_fkey
      FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS stores (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lat  DOUBLE PRECISION NOT NULL,
  lng  DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  demand_tons_month DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id            BIGSERIAL PRIMARY KEY,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  cement_type   TEXT NOT NULL,
  quantity_tons DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, cement_type)
);

-- ── Shipments (final lifecycle) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shipments (
  id                BIGSERIAL PRIMARY KEY,
  from_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_distributor_id BIGINT NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL,
  cement_type       TEXT NOT NULL DEFAULT 'OPC',
  quantity_tons     DOUBLE PRECISION NOT NULL DEFAULT 0,
  truck_id          BIGINT NULL,
  order_request_id  BIGINT NULL,
  depart_at         TIMESTAMPTZ,
  arrive_eta        TIMESTAMPTZ,
  eta_minutes       INTEGER NOT NULL DEFAULT 0,
  last_lat          DOUBLE PRECISION,
  last_lng          DOUBLE PRECISION,
  last_update       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipments_status_check CHECK (status IN ('SCHEDULED', 'ON_DELIVERY', 'COMPLETED', 'DELAYED'))
);

CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments(status);
CREATE INDEX IF NOT EXISTS shipments_depart_at_idx ON shipments(depart_at);

-- ── Sales + planning data ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_orders (
  id             BIGSERIAL PRIMARY KEY,
  distributor_id BIGINT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  order_date     DATE NOT NULL,
  quantity_tons  DOUBLE PRECISION NOT NULL,
  total_price    DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS sales_orders_order_date_idx ON sales_orders(order_date);

CREATE TABLE IF NOT EXISTS sales_targets (
  id          BIGSERIAL PRIMARY KEY,
  month       DATE NOT NULL UNIQUE,
  target_tons DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_presence (
  id                  BIGSERIAL PRIMARY KEY,
  store_id             BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  our_share_pct        DOUBLE PRECISION NOT NULL,
  competitor_share_pct DOUBLE PRECISION NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);

CREATE TABLE IF NOT EXISTS road_segments (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL,
  width_m   DOUBLE PRECISION NOT NULL,
  lat       DOUBLE PRECISION NOT NULL,
  lng       DOUBLE PRECISION NOT NULL,
  geom_json JSONB
);

CREATE INDEX IF NOT EXISTS road_segments_lat_lng_idx ON road_segments(lat, lng);

-- ── RBAC + Administration ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rbac_config (
  role       TEXT PRIMARY KEY,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rbac_config_role_check CHECK (role IN ('SUPER_ADMIN','MANAGEMENT','OPERATOR','DISTRIBUTOR'))
);

CREATE TABLE IF NOT EXISTS threshold_settings (
  id             BIGSERIAL PRIMARY KEY,
  warehouse_id   BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  cement_type    TEXT NOT NULL,
  min_stock      DOUBLE PRECISION NOT NULL,
  safety_stock   DOUBLE PRECISION NOT NULL,
  warning_level  DOUBLE PRECISION NOT NULL,
  critical_level DOUBLE PRECISION NOT NULL,
  lead_time_days INT NOT NULL DEFAULT 3,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, cement_type)
);

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

-- ── Operations extensions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trucks (
  id                BIGSERIAL PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  capacity_tons     DOUBLE PRECISION NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  home_warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='shipments_truck_id_fkey' AND table_name='shipments'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_truck_id_fkey
      FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  cement_type   TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_tons DOUBLE PRECISION NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  ref_type      TEXT NOT NULL DEFAULT '',
  ref_id        TEXT NOT NULL DEFAULT '',
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_movements_movement_type_check CHECK (movement_type IN ('IN','OUT','ADJUST'))
);

CREATE INDEX IF NOT EXISTS inventory_movements_ts_idx ON inventory_movements(ts DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_wh_ct_idx ON inventory_movements(warehouse_id, cement_type);

CREATE TABLE IF NOT EXISTS order_requests (
  id                   BIGSERIAL PRIMARY KEY,
  distributor_id       BIGINT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  cement_type          TEXT NOT NULL,
  quantity_tons        DOUBLE PRECISION NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','FULFILLED')),
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at           TIMESTAMPTZ,
  decided_by_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decision_reason      TEXT NOT NULL DEFAULT '',
  approved_shipment_id BIGINT REFERENCES shipments(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_requests_status_idx ON order_requests(status);
CREATE INDEX IF NOT EXISTS order_requests_requested_at_idx ON order_requests(requested_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='shipments_order_request_id_fkey' AND table_name='shipments'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT shipments_order_request_id_fkey
      FOREIGN KEY (order_request_id) REFERENCES order_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ops_issues (
  id BIGSERIAL PRIMARY KEY,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MED',
  status TEXT NOT NULL DEFAULT 'OPEN',

  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',

  shipment_id BIGINT NULL REFERENCES shipments(id) ON DELETE SET NULL,
  warehouse_id BIGINT NULL REFERENCES warehouses(id) ON DELETE SET NULL,
  distributor_id BIGINT NULL REFERENCES distributors(id) ON DELETE SET NULL,

  reported_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  resolved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolution_notes TEXT NOT NULL DEFAULT '',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_issues
  DROP CONSTRAINT IF EXISTS ops_issues_issue_type_check;
ALTER TABLE ops_issues
  ADD CONSTRAINT ops_issues_issue_type_check
  CHECK (issue_type IN ('DELAY','STOCK_SHORTAGE','FLEET','OTHER'));

ALTER TABLE ops_issues
  DROP CONSTRAINT IF EXISTS ops_issues_severity_check;
ALTER TABLE ops_issues
  ADD CONSTRAINT ops_issues_severity_check
  CHECK (severity IN ('LOW','MED','HIGH'));

ALTER TABLE ops_issues
  DROP CONSTRAINT IF EXISTS ops_issues_status_check;
ALTER TABLE ops_issues
  ADD CONSTRAINT ops_issues_status_check
  CHECK (status IN ('OPEN','RESOLVED'));

CREATE INDEX IF NOT EXISTS idx_ops_issues_status_created_at ON ops_issues (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_issues_issue_type ON ops_issues (issue_type);
CREATE INDEX IF NOT EXISTS idx_ops_issues_shipment_id ON ops_issues (shipment_id);
CREATE INDEX IF NOT EXISTS idx_ops_issues_warehouse_id ON ops_issues (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_ops_issues_distributor_id ON ops_issues (distributor_id);

-- ── Default RBAC config ─────────────────────────────────────────────────────

INSERT INTO rbac_config (role, config)
VALUES
  (
    'SUPER_ADMIN',
    '{
      "permissions": {
        "Planning": {"view": true, "create": true, "edit": true, "delete": true},
        "Operations": {"view": true, "create": true, "edit": true, "delete": true},
        "Executive": {"view": true, "create": true, "edit": true, "delete": true},
        "Administration": {"view": true, "create": true, "edit": true, "delete": true}
      },
      "sidebar": ["Dashboard", "Planning", "Operations", "Executive", "Administration"]
    }'::jsonb
  ),
  (
    'MANAGEMENT',
    '{
      "permissions": {
        "Planning": {"view": true, "create": false, "edit": false, "delete": false},
        "Operations": {"view": true, "create": false, "edit": false, "delete": false},
        "Executive": {"view": true, "create": false, "edit": false, "delete": false},
        "Administration": {"view": false, "create": false, "edit": false, "delete": false}
      },
      "sidebar": ["Dashboard", "Planning", "Executive"]
    }'::jsonb
  ),
  (
    'OPERATOR',
    '{
      "permissions": {
        "Planning": {"view": true, "create": false, "edit": false, "delete": false},
        "Operations": {"view": true, "create": true, "edit": true, "delete": false},
        "Executive": {"view": false, "create": false, "edit": false, "delete": false},
        "Administration": {"view": false, "create": false, "edit": false, "delete": false}
      },
      "sidebar": ["Dashboard", "Operations", "Planning"]
    }'::jsonb
  ),
  (
    'DISTRIBUTOR',
    '{
      "permissions": {
        "Planning": {"view": true, "create": false, "edit": false, "delete": false},
        "Operations": {"view": false, "create": false, "edit": false, "delete": false},
        "Executive": {"view": false, "create": false, "edit": false, "delete": false},
        "Administration": {"view": false, "create": false, "edit": false, "delete": false}
      },
      "sidebar": ["Dashboard"]
    }'::jsonb
  )
ON CONFLICT (role) DO UPDATE
SET
  config = (
    CASE
      WHEN rbac_config.config IS NULL OR rbac_config.config = '{}'::jsonb THEN EXCLUDED.config
      ELSE
        (
          CASE
            WHEN rbac_config.config ? 'permissions' THEN rbac_config.config
            ELSE jsonb_set(rbac_config.config, '{permissions}', (EXCLUDED.config->'permissions'), true)
          END
        ) || (
          CASE
            WHEN rbac_config.config ? 'sidebar' THEN '{}'::jsonb
            ELSE jsonb_build_object('sidebar', (EXCLUDED.config->'sidebar'))
          END
        )
    END
  ),
  updated_at = now();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- No-op (bootstrap migration is intended for fresh DBs)
SELECT 1;
-- +goose StatementEnd
