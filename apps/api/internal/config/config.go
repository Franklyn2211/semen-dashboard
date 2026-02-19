package config

import (
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	DatabaseURL   string
	Port          string
	SessionSecret string
	CookieSecure  bool
	MigrationsDir string
}

func Load() Config {
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		databaseURL = defaultDatabaseURL()
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		sessionSecret = "dev-secret"
	}

	cookieSecure := false
	if v := strings.TrimSpace(os.Getenv("COOKIE_SECURE")); v == "1" || strings.EqualFold(v, "true") {
		cookieSecure = true
	}

	migrationsDir := strings.TrimSpace(os.Getenv("MIGRATIONS_DIR"))
	if migrationsDir == "" {
		migrationsDir = defaultMigrationsDir()
	}

	return Config{
		DatabaseURL:   normalizeDatabaseURL(databaseURL),
		Port:          port,
		SessionSecret: sessionSecret,
		CookieSecure:  cookieSecure,
		MigrationsDir: migrationsDir,
	}
}

func defaultMigrationsDir() string {
	// Try to find repo-root db/migrations regardless of current working dir.
	if wd, err := os.Getwd(); err == nil {
		if found := findMigrationsDirFrom(wd); found != "" {
			return found
		}
	}
	if exe, err := os.Executable(); err == nil {
		if found := findMigrationsDirFrom(filepath.Dir(exe)); found != "" {
			return found
		}
	}
	// Fallback: relative path (works if started from repo root).
	return "db/migrations"
}

func dirExists(path string) bool {
	st, err := os.Stat(path)
	if err != nil {
		return false
	}
	return st.IsDir()
}

func findMigrationsDirFrom(startDir string) string {
	dir := startDir
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "db", "migrations")
		if dirExists(candidate) {
			return candidate
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

func defaultDatabaseURL() string {
	// Default for local dev with docker-compose.
	return "postgres://cementops:cementops@localhost:5432/cementops?sslmode=disable"
}

func normalizeDatabaseURL(url string) string {
	// If user provides a managed DATABASE_URL (Replit), keep as-is.
	// For local URLs, if sslmode missing, default disable.
	if strings.Contains(url, "sslmode=") {
		return url
	}
	if strings.Contains(url, "localhost") || strings.Contains(url, "127.0.0.1") {
		if strings.Contains(url, "?") {
			return url + "&sslmode=disable"
		}
		return url + "?sslmode=disable"
	}
	return url
}
