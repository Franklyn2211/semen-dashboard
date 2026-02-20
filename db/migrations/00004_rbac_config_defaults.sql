-- +goose Up
-- +goose StatementBegin

-- Ensure RBAC config exists for the 4 supported roles.
-- This migration is safe to run on existing DBs:
-- - Inserts missing roles
-- - Patches missing keys (permissions/sidebar) without overwriting existing values

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

-- Ensure no legacy roles remain in users (in case seeds/manual inserts happened after 00002).
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';
UPDATE users SET role = 'OPERATOR'    WHERE role = 'OPS';
UPDATE users SET role = 'MANAGEMENT'  WHERE role = 'EXEC';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- No-op: do not delete/modify existing RBAC configs on rollback.
SELECT 1;
-- +goose StatementEnd
