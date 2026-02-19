-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPS', 'EXEC')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL
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

CREATE TABLE IF NOT EXISTS shipments (
  id                BIGSERIAL PRIMARY KEY,
  from_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_distributor_id BIGINT NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL CHECK (status IN ('PLANNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
  depart_at         TIMESTAMPTZ,
  arrive_eta        TIMESTAMPTZ,
  last_lat          DOUBLE PRECISION,
  last_lng          DOUBLE PRECISION,
  last_update       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments(status);
CREATE INDEX IF NOT EXISTS shipments_depart_at_idx ON shipments(depart_at);

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

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS road_segments;
DROP TABLE IF EXISTS competitor_presence;
DROP TABLE IF EXISTS sales_targets;
DROP TABLE IF EXISTS sales_orders;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS stock_levels;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS distributors;
DROP TABLE IF EXISTS warehouses;
DROP TABLE IF EXISTS plants;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

-- +goose StatementEnd
