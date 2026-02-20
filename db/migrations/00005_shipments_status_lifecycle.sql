-- +goose Up
-- +goose StatementBegin

-- Align shipment lifecycle with the operations module.
-- Old: PLANNED, IN_TRANSIT, DELIVERED, CANCELLED
-- New: SCHEDULED, ON_DELIVERY, COMPLETED, DELAYED

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS eta_minutes INTEGER NOT NULL DEFAULT 0;

UPDATE shipments
SET status = CASE status
  WHEN 'PLANNED' THEN 'SCHEDULED'
  WHEN 'IN_TRANSIT' THEN 'ON_DELIVERY'
  WHEN 'DELIVERED' THEN 'COMPLETED'
  WHEN 'CANCELLED' THEN 'DELAYED'
  ELSE status
END;

ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS shipments_status_check;

ALTER TABLE shipments
  ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('SCHEDULED', 'ON_DELIVERY', 'COMPLETED', 'DELAYED'));

-- Best-effort backfill for existing rows.
UPDATE shipments
SET eta_minutes = GREATEST(0, (EXTRACT(EPOCH FROM (arrive_eta - now())) / 60)::INT)
WHERE arrive_eta IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Revert to the initial lifecycle.
UPDATE shipments
SET status = CASE status
  WHEN 'SCHEDULED' THEN 'PLANNED'
  WHEN 'ON_DELIVERY' THEN 'IN_TRANSIT'
  WHEN 'COMPLETED' THEN 'DELIVERED'
  WHEN 'DELAYED' THEN 'CANCELLED'
  ELSE status
END;

ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS shipments_status_check;

ALTER TABLE shipments
  ADD CONSTRAINT shipments_status_check
  CHECK (status IN ('PLANNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'));

ALTER TABLE shipments
  DROP COLUMN IF EXISTS eta_minutes;

-- +goose StatementEnd
