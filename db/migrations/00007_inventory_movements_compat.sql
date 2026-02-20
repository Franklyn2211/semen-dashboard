-- +goose Up
-- +goose StatementBegin

-- Some dev DBs may already have an inventory_movements table with a different column set.
-- This migration makes the table compatible with the operations module by ensuring the
-- canonical columns exist.

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS movement_type TEXT;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS ref_type TEXT NOT NULL DEFAULT '';

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS ref_id TEXT NOT NULL DEFAULT '';

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='direction'
  ) THEN
    -- Backfill movement_type from direction if needed.
    EXECUTE 'UPDATE inventory_movements SET movement_type = direction WHERE movement_type IS NULL AND direction IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='ref_entity_type'
  ) THEN
    EXECUTE 'UPDATE inventory_movements SET ref_type = COALESCE(NULLIF(ref_type, ''''), ref_entity_type)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_movements' AND column_name='ref_entity_id'
  ) THEN
    EXECUTE 'UPDATE inventory_movements SET ref_id = COALESCE(NULLIF(ref_id, ''''), ref_entity_id)';
  END IF;
END $$;

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('IN','OUT','ADJUST'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

-- Best-effort: keep columns (dropping could break older code paths).

-- +goose StatementEnd
