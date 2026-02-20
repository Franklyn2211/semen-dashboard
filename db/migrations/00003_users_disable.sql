-- +goose Up
-- +goose StatementBegin

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_disabled_at_idx ON users(disabled_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS users_disabled_at_idx;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_at;

-- +goose StatementEnd
