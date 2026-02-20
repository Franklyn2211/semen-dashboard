-- +goose Up
-- +goose StatementBegin

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

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS ops_issues;

-- +goose StatementEnd
