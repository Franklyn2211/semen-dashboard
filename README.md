# CementOps (Demo)

Single-repo demo app:

- Web: Next.js (App Router) + TypeScript + Tailwind + Leaflet + Recharts
- API: Go (chi + pgxpool) + PostgreSQL
- DB: migrations + idempotent seed auto-run on API start

## Prereqs

- Node.js 18+ (recommended 20+)
- Go 1.22+
- PostgreSQL (either Docker Compose below, or a managed DB with `DATABASE_URL`)

## Quickstart (local with Docker Postgres)

1) Start Postgres:

```bash
docker compose up -d postgres
```

If this fails on Windows, make sure Docker Desktop is installed and running. Otherwise, skip Docker and use a hosted Postgres by setting `DATABASE_URL`.

2) Install deps:

```bash
npm install
```

3) Run API + Web together:

```bash
# PowerShell
$env:DATABASE_URL='postgres://cementops:cementops@localhost:5432/cementops?sslmode=disable'
npm run dev
```

Open http://localhost:3000

The API runs on http://127.0.0.1:8080 and automatically runs migrations + seed data on boot.

## Quickstart (Replit / no Docker)

Set `DATABASE_URL` to your Replit Postgres connection string, then:

```bash
npm install
npm run dev
```

## Demo Accounts

- ADMIN: `admin@cementops.local` / `admin123`
- OPS: `ops@cementops.local` / `ops123`
- EXEC: `exec@cementops.local` / `exec123`

## Scripts

- `npm run dev` : runs web + api concurrently
- `npm run build` : builds the Next.js app
- `npm run lint` : lints the Next.js app

## Repo Layout

- `apps/web` : Next.js app
- `apps/api` : Go API
- `db/migrations` : SQL migrations (goose)
- `docker-compose.yml` : local Postgres
