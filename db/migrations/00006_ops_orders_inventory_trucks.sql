-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS trucks (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  capacity_tons   DOUBLE PRECISION NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  home_warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  cement_type   TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('IN','OUT','ADJUST')),
  quantity_tons DOUBLE PRECISION NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  ref_entity_type TEXT NOT NULL DEFAULT '',
  ref_entity_id   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS inventory_movements_ts_idx ON inventory_movements(ts DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_wh_ct_idx ON inventory_movements(warehouse_id, cement_type);

CREATE TABLE IF NOT EXISTS order_requests (
  id               BIGSERIAL PRIMARY KEY,
  distributor_id   BIGINT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  cement_type      TEXT NOT NULL,
  quantity_tons    DOUBLE PRECISION NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','FULFILLED')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at       TIMESTAMPTZ,
  decided_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decision_reason  TEXT NOT NULL DEFAULT '',
  approved_shipment_id BIGINT REFERENCES shipments(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_requests_status_idx ON order_requests(status);
CREATE INDEX IF NOT EXISTS order_requests_requested_at_idx ON order_requests(requested_at DESC);

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS cement_type TEXT NOT NULL DEFAULT 'OPC';

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS quantity_tons DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS truck_id BIGINT REFERENCES trucks(id) ON DELETE SET NULL;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS order_request_id BIGINT REFERENCES order_requests(id) ON DELETE SET NULL;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: use stock cement types as a rough placeholder.
UPDATE shipments
SET cement_type = COALESCE(NULLIF(cement_type, ''), 'OPC')
WHERE cement_type IS NULL OR cement_type = '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE shipments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE shipments DROP COLUMN IF EXISTS order_request_id;
ALTER TABLE shipments DROP COLUMN IF EXISTS truck_id;
ALTER TABLE shipments DROP COLUMN IF EXISTS quantity_tons;
ALTER TABLE shipments DROP COLUMN IF EXISTS cement_type;

DROP TABLE IF EXISTS order_requests;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS trucks;

-- +goose StatementEnd
