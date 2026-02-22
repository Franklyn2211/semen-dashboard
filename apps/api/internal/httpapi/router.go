package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cementops/api/internal/config"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Deps struct {
	DB     *pgxpool.Pool
	Config config.Config
}

type App struct {
	db  *pgxpool.Pool
	cfg config.Config
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	app := &App{db: deps.DB, cfg: deps.Config}

	r.Route("/api", func(api chi.Router) {
		api.Post("/auth/login", app.handleLogin)
		api.Post("/auth/logout", app.handleLogout)

		api.Group(func(pr chi.Router) {
			pr.Use(app.authMiddleware)
			pr.Get("/auth/me", app.handleMe)
			pr.Get("/rbac/me", app.handleRBACMe)

			// Planning is read-only analytics; access is controlled by DB RBAC on the frontend.
			// Keep API accessible to any authenticated user to avoid role mismatch / 403 loops.
			pr.Route("/planning", func(pl chi.Router) {
				pl.Get("/heatmap", app.handlePlanningHeatmap)
				pl.Get("/site-profile", app.handlePlanningSiteProfile)
				pl.Get("/whitespace", app.handlePlanningWhitespace)
				pl.Get("/catchment", app.handlePlanningCatchment)
			})

			// Operations: OPERATOR runs day-to-day ops; MANAGEMENT monitors (read-only).
			pr.With(app.requireRole("SUPER_ADMIN", "OPERATOR", "MANAGEMENT")).Route("/ops", func(op chi.Router) {
				// Read-only monitoring endpoints (allowed for MANAGEMENT).
				op.Get("/overview", app.handleOpsOverview)
				op.Get("/logistics/map", app.handleOpsLogisticsMap)
				op.Get("/trucks", app.handleOpsTrucks)
				op.Get("/stock", app.handleOpsStock)
				op.Get("/inventory", app.handleOpsInventory)
				op.Get("/prediction/reorder", app.handleOpsPredictionReorder)
				op.Get("/orders", app.handleOpsOrders)
				op.Get("/order-audit", app.handleOpsOrderAudit)
				op.Get("/activity-log", app.handleOpsActivityLog)
				op.Get("/issues", app.handleOpsIssues)
				op.Get("/shipments", app.handleOpsShipments)
				op.Get("/shipments/{id}", app.handleOpsShipmentDetail)

				// Mutating endpoints.
				// - OPERATOR: allowed (day-to-day operations)
				// - SUPER_ADMIN: emergency override for shipment updates only
				// - MANAGEMENT: never allowed to mutate
				op.Group(func(mut chi.Router) {
					mut.With(app.requireRoleStrict("OPERATOR")).Group(func(opOnly chi.Router) {
						opOnly.Post("/inventory/adjust", app.handleOpsInventoryAdjust)
						opOnly.Post("/orders/{id}/approve", app.handleOpsApproveOrder)
						opOnly.Post("/orders/{id}/reject", app.handleOpsRejectOrder)
						opOnly.Post("/issues", app.handleOpsCreateIssue)
						opOnly.Patch("/issues/{id}/resolve", app.handleOpsResolveIssue)
					})
					mut.With(app.requireRoleStrict("OPERATOR", "SUPER_ADMIN")).Group(func(sh chi.Router) {
						sh.Patch("/shipments/{id}", app.handleOpsUpdateShipment)
						sh.Patch("/shipments/{id}/status", app.handleOpsUpdateShipmentStatus)
					})
				})
			})

			// Distributor portal: scoped to the authenticated distributor user.
			pr.With(app.requireRoleStrict("DISTRIBUTOR")).Route("/distributor", func(di chi.Router) {
				di.Get("/inventory", app.handleDistributorInventory)
				di.Get("/orders", app.handleDistributorOrders)
				di.Post("/orders", app.handleDistributorCreateOrder)
				di.Get("/shipments", app.handleDistributorShipments)
				di.Get("/transactions", app.handleDistributorTransactions)
			})

			pr.With(app.requireRole("SUPER_ADMIN")).Route("/admin", func(ad chi.Router) {
				// Users
				ad.Get("/users", app.handleAdminListUsers)
				ad.Post("/users", app.handleAdminCreateUser)
				ad.Put("/users/{id}", app.handleAdminUpdateUser)
				ad.Delete("/users/{id}", app.handleAdminDeleteUser)
				ad.Patch("/users/{id}/status", app.handleAdminUpdateUserStatus)
				ad.Post("/users/{id}/reset-password", app.handleAdminResetUserPassword)

				// RBAC
				ad.Get("/rbac", app.handleAdminGetRBAC)
				ad.Put("/rbac/{role}", app.handleAdminPutRBAC)

				// Thresholds
				ad.Get("/thresholds", app.handleAdminListThresholds)
				ad.Put("/thresholds/{id}", app.handleAdminUpdateThreshold)

				// Alerts
				ad.Get("/alerts", app.handleAdminListAlerts)
				ad.Put("/alerts", app.handleAdminPutAlerts)

				// Logs
				ad.Get("/logs", app.handleAdminListAuditLogs)

				// Plants CRUD
				ad.Get("/plants", app.handleAdminListPlants)
				ad.Post("/plants", app.handleAdminCreatePlant)
				ad.Put("/plants/{id}", app.handleAdminUpdatePlant)
				ad.Delete("/plants/{id}", app.handleAdminDeletePlant)

				// Warehouses CRUD
				ad.Get("/warehouses", app.handleAdminListWarehouses)
				ad.Post("/warehouses", app.handleAdminCreateWarehouse)
				ad.Put("/warehouses/{id}", app.handleAdminUpdateWarehouse)
				ad.Delete("/warehouses/{id}", app.handleAdminDeleteWarehouse)

				// Distributors CRUD
				ad.Get("/distributors", app.handleAdminListDistributors)
				ad.Post("/distributors", app.handleAdminCreateDistributor)
				ad.Put("/distributors/{id}", app.handleAdminUpdateDistributor)
				ad.Delete("/distributors/{id}", app.handleAdminDeleteDistributor)
				// Stores CRUD
				ad.Get("/stores", app.handleAdminListStores)
				ad.Post("/stores", app.handleAdminCreateStore)
				ad.Put("/stores/{id}", app.handleAdminUpdateStore)
				ad.Delete("/stores/{id}", app.handleAdminDeleteStore)
				// Projects CRUD
				ad.Get("/projects", app.handleAdminListProjects)
				ad.Post("/projects", app.handleAdminCreateProject)
				ad.Put("/projects/{id}", app.handleAdminUpdateProject)
				ad.Delete("/projects/{id}", app.handleAdminDeleteProject)
			})

			pr.With(app.requireRole("SUPER_ADMIN", "MANAGEMENT")).Route("/exec", func(ex chi.Router) {
				ex.Get("/target-vs-actual", app.handleExecTargetVsActual)
				ex.Get("/competitor/map", app.handleExecCompetitorMap)
				ex.Get("/partners/performance", app.handleExecPartnersPerformance)
				ex.Get("/shipments/summary", app.handleExecShipmentsSummary)
				ex.Get("/sales/summary", app.handleExecSalesSummary)
				ex.Get("/sales/overview", app.handleExecSalesOverview)
				ex.Get("/regional/performance", app.handleExecRegionalPerformance)
			})
		})
	})

	return r
}

// ---------- helpers ----------

type apiError struct {
	Error struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeAPIError(w http.ResponseWriter, status int, code, message string) {
	var e apiError
	e.Error.Code = code
	e.Error.Message = message
	writeJSON(w, status, e)
}

// ---------- auth ----------

type ctxKey string

const ctxUserKey ctxKey = "cementops_user"

type User struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Email         string `json:"email"`
	Role          string `json:"role"`
	DistributorID *int64 `json:"distributorId,omitempty"`
}

func (a *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("cementops_session")
		if err != nil || strings.TrimSpace(c.Value) == "" {
			writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
			return
		}
		sid, err := uuid.Parse(c.Value)
		if err != nil {
			writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid session")
			return
		}

		var u User
		var distributorID sql.NullInt64
		var expiresAt time.Time
		row := a.db.QueryRow(r.Context(), `
      SELECT u.id, u.name, u.email, u.role, u.distributor_id, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
    `, sid)
		if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &distributorID, &expiresAt); err != nil {
			writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "session not found")
			return
		}
		if distributorID.Valid {
			v := distributorID.Int64
			u.DistributorID = &v
		}
		if time.Now().After(expiresAt) {
			_, _ = a.db.Exec(r.Context(), `DELETE FROM sessions WHERE id = $1`, sid)
			writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "session expired")
			return
		}

		ctx := context.WithValue(r.Context(), ctxUserKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *App) requireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := r.Context().Value(ctxUserKey).(User)
			if !ok {
				writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
				return
			}
			if u.Role == "SUPER_ADMIN" {
				next.ServeHTTP(w, r)
				return
			}
			if !allowed[u.Role] {
				writeAPIError(w, http.StatusForbidden, "FORBIDDEN", "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (a *App) requireRoleStrict(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := r.Context().Value(ctxUserKey).(User)
			if !ok {
				writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
				return
			}
			if !allowed[u.Role] {
				writeAPIError(w, http.StatusForbidden, "FORBIDDEN", "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	if body.Email == "" || !strings.Contains(body.Email, "@") || strings.TrimSpace(body.Password) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "email and password required")
		return
	}

	var u User
	var passwordHash string
	row := a.db.QueryRow(r.Context(), `SELECT id, name, email, role, password_hash FROM users WHERE email = $1`, body.Email)
	if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &passwordHash); err != nil {
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid credentials")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.Password)); err != nil {
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid credentials")
		return
	}

	sid := uuid.New()
	expires := time.Now().Add(7 * 24 * time.Hour)
	if _, err := a.db.Exec(r.Context(), `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)`, sid, u.ID, expires); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "could not create session")
		return
	}

	secure := a.cfg.CookieSecure
	if !secure {
		if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			secure = true
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "cementops_session",
		Value:    sid.String(),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		Expires:  expires,
	})

	a.insertAuditLog(r, &u, "LOGIN", "session", sid.String(), map[string]any{"email": u.Email})

	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("cementops_session"); err == nil {
		if sid, err := uuid.Parse(c.Value); err == nil {
			_, _ = a.db.Exec(r.Context(), `DELETE FROM sessions WHERE id = $1`, sid)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "cementops_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	u, ok := r.Context().Value(ctxUserKey).(User)
	if !ok {
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (a *App) handleRBACMe(w http.ResponseWriter, r *http.Request) {
	u, ok := r.Context().Value(ctxUserKey).(User)
	if !ok {
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	var config json.RawMessage
	if err := a.db.QueryRow(r.Context(), `SELECT config FROM rbac_config WHERE role=$1`, u.Role).Scan(&config); err != nil {
		if err == sql.ErrNoRows {
			writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "rbac config not found")
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"role": u.Role, "config": config})
}

// ---------- planning ----------

func parseBBox(s string) (minLat, minLng, maxLat, maxLng float64, ok bool) {
	parts := strings.Split(strings.TrimSpace(s), ",")
	if len(parts) != 4 {
		return 0, 0, 0, 0, false
	}
	f := make([]float64, 4)
	for i := 0; i < 4; i++ {
		v, err := strconv.ParseFloat(strings.TrimSpace(parts[i]), 64)
		if err != nil {
			return 0, 0, 0, 0, false
		}
		f[i] = v
	}
	return f[0], f[1], f[2], f[3], true
}

func (a *App) handlePlanningHeatmap(w http.ResponseWriter, r *http.Request) {
	bboxStr := r.URL.Query().Get("bbox")
	minLat, minLng, maxLat, maxLng, ok := parseBBox(bboxStr)
	if !ok {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "bbox must be minLat,minLng,maxLat,maxLng")
		return
	}

	rows, err := a.db.Query(r.Context(), `
    SELECT lat, lng, demand_tons_month
    FROM projects
    WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
  `, minLat, maxLat, minLng, maxLng)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	cell := 0.02
	type cellKey struct{ a, b int }
	scores := map[cellKey]float64{}
	for rows.Next() {
		var lat, lng, demand float64
		if err := rows.Scan(&lat, &lng, &demand); err != nil {
			continue
		}
		la := int(math.Floor(lat / cell))
		lb := int(math.Floor(lng / cell))
		scores[cellKey{la, lb}] += demand
	}

	out := make([]map[string]any, 0, len(scores))
	for k, sc := range scores {
		clat := float64(k.a) * cell
		clng := float64(k.b) * cell
		out = append(out, map[string]any{
			"cellLat":   clat,
			"cellLng":   clng,
			"centerLat": clat + cell/2,
			"centerLng": clng + cell/2,
			"size":      cell,
			"score":     sc,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"cells": out, "cellSize": cell})
}

func (a *App) handlePlanningSiteProfile(w http.ResponseWriter, r *http.Request) {
	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err1 != nil || err2 != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "lat and lng required")
		return
	}

	// Road width: nearest segments within 0.5km, take max width.
	rows, err := a.db.Query(r.Context(), `SELECT width_m, lat, lng, name FROM road_segments`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	bestWidth := 0.0
	bestRoad := ""
	for rows.Next() {
		var width, rlat, rlng float64
		var name string
		if err := rows.Scan(&width, &rlat, &rlng, &name); err != nil {
			continue
		}
		dkm := haversineKM(lat, lng, rlat, rlng)
		if dkm <= 0.5 && width > bestWidth {
			bestWidth = width
			bestRoad = name
		}
	}

	// Demand around point.
	prow, err := a.db.Query(r.Context(), `SELECT lat, lng, demand_tons_month FROM projects`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer prow.Close()
	demand3km := 0.0
	for prow.Next() {
		var plat, plng, dem float64
		if err := prow.Scan(&plat, &plng, &dem); err != nil {
			continue
		}
		if haversineKM(lat, lng, plat, plng) <= 3 {
			demand3km += dem
		}
	}

	// Distance to nearest warehouse.
	wrows, err := a.db.Query(r.Context(), `SELECT lat, lng FROM warehouses`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer wrows.Close()
	nearestWH := 1e9
	for wrows.Next() {
		var wlat, wlng float64
		if err := wrows.Scan(&wlat, &wlng); err != nil {
			continue
		}
		d := haversineKM(lat, lng, wlat, wlng)
		if d < nearestWH {
			nearestWH = d
		}
	}

	score := 50.0
	reasons := []string{}

	if bestWidth > 0 {
		if bestWidth >= 7 {
			score += 20
			reasons = append(reasons, "Road width "+fmtFloat(bestWidth)+"m OK for truck ("+bestRoad+")")
		} else if bestWidth >= 5 {
			score += 10
			reasons = append(reasons, "Road width "+fmtFloat(bestWidth)+"m acceptable ("+bestRoad+")")
		} else {
			score -= 10
			reasons = append(reasons, "Road width "+fmtFloat(bestWidth)+"m may be tight for heavy truck")
		}
	} else {
		score -= 5
		reasons = append(reasons, "No nearby road segment within 500m")
	}

	if demand3km > 600 {
		score += 20
		reasons = append(reasons, "High demand within 3km")
	} else if demand3km > 250 {
		score += 10
		reasons = append(reasons, "Moderate demand within 3km")
	} else {
		reasons = append(reasons, "Demand within 3km is low")
	}

	if nearestWH < 20 {
		score += 10
		reasons = append(reasons, "Warehouse within 20km")
	} else if nearestWH < 50 {
		score += 5
		reasons = append(reasons, "Warehouse within 50km")
	} else {
		score -= 5
		reasons = append(reasons, "Nearest warehouse is far")
	}

	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"score":                 score,
		"reasons":               reasons,
		"roadWidthM":            bestWidth,
		"demandWithin3km":       demand3km,
		"distanceToWarehouseKm": nearestWH,
	})
}

func (a *App) handlePlanningWhitespace(w http.ResponseWriter, r *http.Request) {
	bboxStr := r.URL.Query().Get("bbox")
	minLat, minLng, maxLat, maxLng, ok := parseBBox(bboxStr)
	if !ok {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "bbox must be minLat,minLng,maxLat,maxLng")
		return
	}

	// Preload distributors + stores (small dataset)
	type pt struct{ lat, lng float64 }
	drows, _ := a.db.Query(r.Context(), `SELECT lat, lng FROM distributors`)
	distributors := []pt{}
	for drows.Next() {
		var la, ln float64
		_ = drows.Scan(&la, &ln)
		distributors = append(distributors, pt{la, ln})
	}
	drows.Close()
	srows, _ := a.db.Query(r.Context(), `SELECT lat, lng FROM stores`)
	stores := []pt{}
	for srows.Next() {
		var la, ln float64
		_ = srows.Scan(&la, &ln)
		stores = append(stores, pt{la, ln})
	}
	srows.Close()

	// Heatmap cells in bbox
	rows, err := a.db.Query(r.Context(), `
    SELECT lat, lng, demand_tons_month
    FROM projects
    WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
  `, minLat, maxLat, minLng, maxLng)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	cell := 0.02
	type cellKey struct{ a, b int }
	scores := map[cellKey]float64{}
	for rows.Next() {
		var lat, lng, demand float64
		if err := rows.Scan(&lat, &lng, &demand); err != nil {
			continue
		}
		la := int(math.Floor(lat / cell))
		lb := int(math.Floor(lng / cell))
		scores[cellKey{la, lb}] += demand
	}

	whitespace := []map[string]any{}
	for k, sc := range scores {
		if sc < 450 {
			continue
		}
		clat := float64(k.a) * cell
		clng := float64(k.b) * cell
		centerLat := clat + cell/2
		centerLng := clng + cell/2

		nearestStore := 1e9
		for _, s := range stores {
			d := haversineKM(centerLat, centerLng, s.lat, s.lng)
			if d < nearestStore {
				nearestStore = d
			}
		}
		nearestDist := 1e9
		for _, d := range distributors {
			dd := haversineKM(centerLat, centerLng, d.lat, d.lng)
			if dd < nearestDist {
				nearestDist = dd
			}
		}
		if nearestStore > 5 && nearestDist > 6 {
			whitespace = append(whitespace, map[string]any{
				"cellLat":              clat,
				"cellLng":              clng,
				"centerLat":            centerLat,
				"centerLng":            centerLng,
				"size":                 cell,
				"score":                sc,
				"nearestStoreKm":       nearestStore,
				"nearestDistributorKm": nearestDist,
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"areas": whitespace, "cellSize": cell})
}

func (a *App) handlePlanningCatchment(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	warehouseID := strings.TrimSpace(q.Get("warehouseId"))
	distributorID := strings.TrimSpace(q.Get("distributorId"))
	if warehouseID == "" && distributorID == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "warehouseId or distributorId required")
		return
	}

	type entity struct {
		id     int64
		name   string
		lat    float64
		lng    float64
		radius float64
		kind   string
	}

	var sel entity
	if distributorID != "" {
		id, err := strconv.ParseInt(distributorID, 10, 64)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid distributorId")
			return
		}
		row := a.db.QueryRow(r.Context(), `SELECT id, name, lat, lng, service_radius_km FROM distributors WHERE id = $1`, id)
		if err := row.Scan(&sel.id, &sel.name, &sel.lat, &sel.lng, &sel.radius); err != nil {
			writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "distributor not found")
			return
		}
		sel.kind = "distributor"
	} else {
		id, err := strconv.ParseInt(warehouseID, 10, 64)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid warehouseId")
			return
		}
		row := a.db.QueryRow(r.Context(), `SELECT id, name, lat, lng FROM warehouses WHERE id = $1`, id)
		if err := row.Scan(&sel.id, &sel.name, &sel.lat, &sel.lng); err != nil {
			writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "warehouse not found")
			return
		}
		sel.kind = "warehouse"
		sel.radius = 45
	}

	// Compute cannibalization overlaps between distributors.
	rows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng, service_radius_km FROM distributors`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	type dist struct {
		id     int64
		name   string
		lat    float64
		lng    float64
		radius float64
	}
	dists := []dist{}
	for rows.Next() {
		var d dist
		if err := rows.Scan(&d.id, &d.name, &d.lat, &d.lng, &d.radius); err != nil {
			continue
		}
		dists = append(dists, d)
	}

	conflicts := []map[string]any{}
	if sel.kind == "distributor" {
		for _, d := range dists {
			if d.id == sel.id {
				continue
			}
			centerDist := haversineKM(sel.lat, sel.lng, d.lat, d.lng)
			if centerDist < (sel.radius + d.radius) {
				conflicts = append(conflicts, map[string]any{
					"otherDistributorId":   d.id,
					"otherDistributorName": d.name,
					"distanceKm":           centerDist,
					"overlapKm":            (sel.radius + d.radius) - centerDist,
				})
			}
		}
	} else {
		// For warehouses, list all pairs of distributors inside warehouse service radius that overlap.
		inside := []dist{}
		for _, d := range dists {
			if haversineKM(sel.lat, sel.lng, d.lat, d.lng) <= sel.radius {
				inside = append(inside, d)
			}
		}
		for i := 0; i < len(inside); i++ {
			for j := i + 1; j < len(inside); j++ {
				a1 := inside[i]
				a2 := inside[j]
				centerDist := haversineKM(a1.lat, a1.lng, a2.lat, a2.lng)
				if centerDist < (a1.radius + a2.radius) {
					conflicts = append(conflicts, map[string]any{
						"aDistributorId":   a1.id,
						"aDistributorName": a1.name,
						"bDistributorId":   a2.id,
						"bDistributorName": a2.name,
						"distanceKm":       centerDist,
					})
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"entity": map[string]any{
			"kind":     sel.kind,
			"id":       sel.id,
			"name":     sel.name,
			"lat":      sel.lat,
			"lng":      sel.lng,
			"radiusKm": sel.radius,
		},
		"conflicts": conflicts,
	})
}

// ---------- operations ----------

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371.0
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	phi1 := toRad(lat1)
	phi2 := toRad(lat2)
	dPhi := toRad(lat2 - lat1)
	dLam := toRad(lng2 - lng1)
	a := math.Sin(dPhi/2)*math.Sin(dPhi/2) + math.Cos(phi1)*math.Cos(phi2)*math.Sin(dLam/2)*math.Sin(dLam/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return r * c
}

func estimateTravelMinutes(lat1, lng1, lat2, lng2 float64) int {
	km := haversineKm(lat1, lng1, lat2, lng2)
	// Dummy speed model: 45–60 km/h. Clamp to keep UX stable.
	speed := 52.0
	mins := int(math.Ceil((km / speed) * 60))
	if mins < 60 {
		mins = 60
	}
	if mins > 720 {
		mins = 720
	}
	return mins
}

func (a *App) insertAuditLog(r *http.Request, actor *User, action, entityType, entityID string, metadata map[string]any) {
	var actorID any = nil
	if actor != nil {
		actorID = actor.ID
	}
	b, _ := json.Marshal(metadata)
	ctx := context.Background()
	ip := clientIP(r)
	if r != nil {
		ctx = r.Context()
	}
	_, _ = a.db.Exec(ctx, `
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, ip)
	  VALUES ($1,$2,$3,$4,$5::jsonb,$6)
  `, actorID, action, entityType, entityID, string(b), ip)
}

func clientIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	// In most deployments chi's RealIP middleware already rewrites RemoteAddr,
	// but keep header parsing here to be robust.
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
		return xrip
	}
	addr := strings.TrimSpace(r.RemoteAddr)
	if addr == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(addr)
	if err == nil {
		return host
	}
	return addr
}

func (a *App) handleOpsOverview(w http.ResponseWriter, r *http.Request) {
	// Aggregations are intentionally simple and rule-based (no ML/AI).
	var nationalStock float64
	_ = a.db.QueryRow(r.Context(), `SELECT COALESCE(SUM(quantity_tons),0) FROM stock_levels`).Scan(&nationalStock)

	regional := []map[string]any{}
	rows, err := a.db.Query(r.Context(), `
    SELECT w.id, w.name, COALESCE(SUM(s.quantity_tons),0) AS stock
    FROM warehouses w
    LEFT JOIN stock_levels s ON s.warehouse_id = w.id
    GROUP BY w.id, w.name
    ORDER BY w.id
  `)
	if err == nil {
		for rows.Next() {
			var id int64
			var name string
			var stock float64
			_ = rows.Scan(&id, &name, &stock)
			regional = append(regional, map[string]any{"warehouseId": id, "warehouseName": name, "stockTons": stock})
		}
		rows.Close()
	}

	var warehousesCritical int
	_ = a.db.QueryRow(r.Context(), `
    SELECT COUNT(DISTINCT s.warehouse_id)
    FROM stock_levels s
    JOIN threshold_settings t ON t.warehouse_id=s.warehouse_id AND t.cement_type=s.cement_type
    WHERE s.quantity_tons <= t.critical_level
  `).Scan(&warehousesCritical)

	var minStockAlerts int
	_ = a.db.QueryRow(r.Context(), `
    SELECT COUNT(*)
    FROM stock_levels s
    JOIN threshold_settings t ON t.warehouse_id=s.warehouse_id AND t.cement_type=s.cement_type
    WHERE s.quantity_tons <= t.min_stock
  `).Scan(&minStockAlerts)

	var pendingOrdersToday int
	_ = a.db.QueryRow(r.Context(), `
    SELECT COUNT(*)
    FROM order_requests
    WHERE status='PENDING' AND requested_at::date = CURRENT_DATE
  `).Scan(&pendingOrdersToday)

	var activeShipments int
	_ = a.db.QueryRow(r.Context(), `
    SELECT COUNT(*)
    FROM shipments
    WHERE status IN ('SCHEDULED','ON_DELIVERY','DELAYED')
  `).Scan(&activeShipments)

	var delayedShipments int
	_ = a.db.QueryRow(r.Context(), `
    SELECT COUNT(*)
    FROM shipments
    WHERE status='DELAYED' OR (status='ON_DELIVERY' AND arrive_eta IS NOT NULL AND arrive_eta < now())
  `).Scan(&delayedShipments)

	writeJSON(w, http.StatusOK, map[string]any{
		"nationalStockTons":       nationalStock,
		"regionalStock":           regional,
		"warehousesCriticalCount": warehousesCritical,
		"pendingOrdersToday":      pendingOrdersToday,
		"activeShipments":         activeShipments,
		"delayedShipments":        delayedShipments,
		"minStockAlerts":          minStockAlerts,
		"note":                    "Regional menggunakan warehouse sebagai proxy (region tidak dimodelkan).",
	})
}

func (a *App) handleOpsLogisticsMap(w http.ResponseWriter, r *http.Request) {
	// Plant
	prow := a.db.QueryRow(r.Context(), `SELECT id, name, lat, lng FROM plants ORDER BY id LIMIT 1`)
	plant := map[string]any{}
	{
		var id int64
		var name string
		var lat, lng float64
		_ = prow.Scan(&id, &name, &lat, &lng)
		plant = map[string]any{"id": id, "name": name, "lat": lat, "lng": lng}
	}

	// Warehouses
	wrows, _ := a.db.Query(r.Context(), `SELECT id, name, lat, lng, capacity_tons FROM warehouses ORDER BY id`)
	warehouses := []map[string]any{}
	for wrows.Next() {
		var id int64
		var name string
		var lat, lng, cap float64
		_ = wrows.Scan(&id, &name, &lat, &lng, &cap)
		warehouses = append(warehouses, map[string]any{"id": id, "name": name, "lat": lat, "lng": lng, "capacityTons": cap})
	}
	wrows.Close()

	// Distributors
	drows, _ := a.db.Query(r.Context(), `SELECT id, name, lat, lng, service_radius_km FROM distributors ORDER BY id`)
	distributors := []map[string]any{}
	for drows.Next() {
		var id int64
		var name string
		var lat, lng, rad float64
		_ = drows.Scan(&id, &name, &lat, &lng, &rad)
		distributors = append(distributors, map[string]any{"id": id, "name": name, "lat": lat, "lng": lng, "serviceRadiusKm": rad})
	}
	drows.Close()

	// Sample routes: connect each warehouse to a couple of distributors.
	routes := []map[string]any{}
	for i := 0; i < len(warehouses); i++ {
		w := warehouses[i]
		for j := 0; j < 2; j++ {
			idx := (i*2 + j) % len(distributors)
			d := distributors[idx]
			routes = append(routes, map[string]any{
				"fromWarehouseId": w["id"],
				"toDistributorId": d["id"],
				"polyline": []map[string]any{
					{"lat": w["lat"], "lng": w["lng"]},
					{"lat": d["lat"], "lng": d["lng"]},
				},
			})
		}
	}

	// Active shipments: include simple polyline + simulated truck position.
	srows, err := a.db.Query(r.Context(), `
    SELECT s.id, s.status, s.depart_at, s.arrive_eta, s.eta_minutes, s.last_lat, s.last_lng, s.last_update,
           w.id, w.name, w.lat, w.lng,
           d.id, d.name, d.lat, d.lng
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
    WHERE s.status IN ('SCHEDULED','ON_DELIVERY','DELAYED')
    ORDER BY s.id DESC
    LIMIT 50
  `)
	activeShipments := []map[string]any{}
	if err == nil {
		now := time.Now().UTC()
		for srows.Next() {
			var id int64
			var status string
			var depart, eta *time.Time
			var etaMinutes int
			var lastLat, lastLng *float64
			var lastUpdate *time.Time
			var wid, did int64
			var wname, dname string
			var wlat, wlng, dlat, dlng float64
			_ = srows.Scan(&id, &status, &depart, &eta, &etaMinutes, &lastLat, &lastLng, &lastUpdate, &wid, &wname, &wlat, &wlng, &did, &dname, &dlat, &dlng)

			// Simulate position if ON_DELIVERY.
			if status == "ON_DELIVERY" && depart != nil && eta != nil {
				frac := float64(now.Sub(depart.UTC())) / float64(eta.UTC().Sub(depart.UTC()))
				if frac < 0 {
					frac = 0
				}
				if frac > 1 {
					frac = 1
				}
				ll := wlat + (dlat-wlat)*frac
				lg := wlng + (dlng-wlng)*frac
				lastLat, lastLng = &ll, &lg
				u := now
				lastUpdate = &u
				etaMinutes = int(math.Max(0, eta.UTC().Sub(now).Minutes()))
			}

			activeShipments = append(activeShipments, map[string]any{
				"id":            id,
				"status":        status,
				"etaMinutes":    etaMinutes,
				"truck":         map[string]any{"lastLat": lastLat, "lastLng": lastLng, "lastUpdate": lastUpdate},
				"fromWarehouse": map[string]any{"id": wid, "name": wname, "lat": wlat, "lng": wlng},
				"toDistributor": map[string]any{"id": did, "name": dname, "lat": dlat, "lng": dlng},
				"polyline":      []map[string]any{{"lat": wlat, "lng": wlng}, {"lat": dlat, "lng": dlng}},
			})
		}
		srows.Close()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"plant":           plant,
		"warehouses":      warehouses,
		"distributors":    distributors,
		"routes":          routes,
		"activeShipments": activeShipments,
	})
}

func (a *App) handleOpsStock(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT w.id, w.name, s.cement_type, s.quantity_tons, s.updated_at
    FROM stock_levels s
    JOIN warehouses w ON w.id = s.warehouse_id
    ORDER BY w.id, s.cement_type
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var wid int64
		var wname, ct string
		var qty float64
		var updated time.Time
		_ = rows.Scan(&wid, &wname, &ct, &qty, &updated)
		out = append(out, map[string]any{
			"warehouseId":   wid,
			"warehouseName": wname,
			"cementType":    ct,
			"quantityTons":  qty,
			"updatedAt":     updated,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (a *App) handleOpsTrucks(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT id, code, name, capacity_tons, active
    FROM trucks
    ORDER BY id
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var code, name string
		var cap float64
		var active bool
		_ = rows.Scan(&id, &code, &name, &cap, &active)
		items = append(items, map[string]any{"id": id, "code": code, "name": name, "capacityTons": cap, "active": active})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsInventory(w http.ResponseWriter, r *http.Request) {
	// Join stock with thresholds to compute a simple status.
	rows, err := a.db.Query(r.Context(), `
    SELECT w.id, w.name, w.capacity_tons,
	    s.cement_type, s.quantity_tons, s.updated_at,
           t.min_stock, t.safety_stock, t.warning_level, t.critical_level, t.lead_time_days
    FROM stock_levels s
    JOIN warehouses w ON w.id = s.warehouse_id
    LEFT JOIN threshold_settings t ON t.warehouse_id=s.warehouse_id AND t.cement_type=s.cement_type
    ORDER BY w.id, s.cement_type
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	type key struct {
		wid int64
		ct  string
	}
	items := []map[string]any{}
	keys := []key{}
	for rows.Next() {
		var wid int64
		var wname, ct string
		var cap float64
		var qty float64
		var updated time.Time
		var min, safety, warn, critical *float64
		var lead *int
		_ = rows.Scan(&wid, &wname, &cap, &ct, &qty, &updated, &min, &safety, &warn, &critical, &lead)

		status := "OK"
		if critical != nil && qty <= *critical {
			status = "CRITICAL"
		} else if warn != nil && qty <= *warn {
			status = "WARNING"
		}

		it := map[string]any{
			"warehouseId":   wid,
			"warehouseName": wname,
			"capacityTons":  cap,
			"cementType":    ct,
			"quantityTons":  qty,
			"updatedAt":     updated,
			"status":        status,
			"thresholds": map[string]any{
				"minStock":      min,
				"safetyStock":   safety,
				"warningLevel":  warn,
				"criticalLevel": critical,
				"leadTimeDays":  lead,
			},
		}
		items = append(items, it)
		keys = append(keys, key{wid: wid, ct: ct})
	}

	// Attach recent movements (3 per warehouse+cement type)
	mrows, err := a.db.Query(r.Context(), `
    SELECT id, ts, actor_user_id, warehouse_id, cement_type, movement_type, quantity_tons, reason
    FROM (
      SELECT m.*, ROW_NUMBER() OVER (PARTITION BY warehouse_id, cement_type ORDER BY ts DESC) AS rn
      FROM inventory_movements m
    ) x
    WHERE rn <= 3
    ORDER BY ts DESC
  `)
	recent := map[key][]map[string]any{}
	if err == nil {
		for mrows.Next() {
			var id int64
			var ts time.Time
			var actorID *int64
			var wid int64
			var ct, mt, reason string
			var qty float64
			_ = mrows.Scan(&id, &ts, &actorID, &wid, &ct, &mt, &qty, &reason)
			recent[key{wid: wid, ct: ct}] = append(recent[key{wid: wid, ct: ct}], map[string]any{
				"id":           id,
				"ts":           ts,
				"movementType": mt,
				"quantityTons": qty,
				"reason":       reason,
				"actorUserId":  actorID,
			})
		}
		mrows.Close()
	}
	for i := range items {
		wid := items[i]["warehouseId"].(int64)
		ct := items[i]["cementType"].(string)
		items[i]["recentMovements"] = recent[key{wid: wid, ct: ct}]
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsInventoryAdjust(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	var body struct {
		WarehouseID int64   `json:"warehouseId"`
		CementType  string  `json:"cementType"`
		DeltaTons   float64 `json:"deltaTons"`
		Reason      string  `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if body.WarehouseID <= 0 || strings.TrimSpace(body.CementType) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "warehouseId and cementType required")
		return
	}
	if body.DeltaTons == 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "deltaTons must be non-zero")
		return
	}
	if math.Abs(body.DeltaTons) > 500 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "deltaTons too large")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	// Upsert stock row.
	_, _ = tx.Exec(r.Context(), `
    INSERT INTO stock_levels (warehouse_id, cement_type, quantity_tons)
    VALUES ($1,$2,0)
    ON CONFLICT (warehouse_id, cement_type) DO NOTHING
  `, body.WarehouseID, body.CementType)

	var current float64
	if err := tx.QueryRow(r.Context(), `
    SELECT quantity_tons FROM stock_levels
    WHERE warehouse_id=$1 AND cement_type=$2
    FOR UPDATE
  `, body.WarehouseID, body.CementType).Scan(&current); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	newQty := current + body.DeltaTons
	if newQty < 0 {
		writeAPIError(w, http.StatusConflict, "INSUFFICIENT_STOCK", "resulting stock would be negative")
		return
	}
	if _, err := tx.Exec(r.Context(), `
    UPDATE stock_levels SET quantity_tons=$1, updated_at=now()
    WHERE warehouse_id=$2 AND cement_type=$3
  `, newQty, body.WarehouseID, body.CementType); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	// Movement + audit.
	if _, err := tx.Exec(r.Context(), `
    INSERT INTO inventory_movements (actor_user_id, warehouse_id, cement_type, movement_type, quantity_tons, reason, ref_type, ref_id, metadata)
    VALUES ($1,$2,$3,'ADJUST',$4,$5,'stock_levels','', '{}'::jsonb)
  `, u.ID, body.WarehouseID, body.CementType, body.DeltaTons, body.Reason); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	a.insertAuditLog(r, &u, "STOCK_ADJUSTMENT", "stock_levels", fmt.Sprintf("%d:%s", body.WarehouseID, body.CementType), map[string]any{"deltaTons": body.DeltaTons, "reason": body.Reason})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "newQuantityTons": newQty})
}

func (a *App) handleOpsOrders(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("status")))
	where := ""
	args := []any{}
	if status != "" {
		where = "WHERE o.status=$1"
		args = append(args, status)
	}
	q := fmt.Sprintf(`
    SELECT o.id, o.distributor_id, d.name, o.cement_type, o.quantity_tons, o.status, o.requested_at,
           o.decided_at, o.decided_by_user_id, o.decision_reason, o.approved_shipment_id
    FROM order_requests o
    JOIN distributors d ON d.id = o.distributor_id
    %s
    ORDER BY o.requested_at DESC, o.id DESC
    LIMIT 200
  `, where)
	rows, err := a.db.Query(r.Context(), q, args...)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, did int64
		var dname, ct, st, reason string
		var qty float64
		var requested time.Time
		var decided *time.Time
		var decidedBy *int64
		var approvedShipment *int64
		_ = rows.Scan(&id, &did, &dname, &ct, &qty, &st, &requested, &decided, &decidedBy, &reason, &approvedShipment)
		items = append(items, map[string]any{
			"id":                 id,
			"status":             st,
			"requestedAt":        requested,
			"decidedAt":          decided,
			"decidedBy":          decidedBy,
			"decisionReason":     reason,
			"approvedShipmentId": approvedShipment,
			"cementType":         ct,
			"quantityTons":       qty,
			"distributor":        map[string]any{"id": did, "name": dname},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsApproveOrder(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	idStr := chi.URLParam(r, "id")
	orderID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		FromWarehouseID *int64     `json:"fromWarehouseId"`
		TruckID         *int64     `json:"truckId"`
		DepartAt        *time.Time `json:"departAt"`
		Reason          string     `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	// Lock order request.
	var distributorID int64
	var cementType string
	var qty float64
	var status string
	if err := tx.QueryRow(r.Context(), `
    SELECT distributor_id, cement_type, quantity_tons, status
    FROM order_requests
    WHERE id=$1
    FOR UPDATE
  `, orderID).Scan(&distributorID, &cementType, &qty, &status); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "order not found")
		return
	}
	if status != "PENDING" {
		writeAPIError(w, http.StatusConflict, "INVALID_STATE", "order is not pending")
		return
	}

	fromWarehouseID := int64(0)
	if body.FromWarehouseID != nil {
		fromWarehouseID = *body.FromWarehouseID
	}
	if fromWarehouseID == 0 {
		// Pick warehouse with highest stock.
		_ = tx.QueryRow(r.Context(), `
      SELECT warehouse_id
      FROM stock_levels
      WHERE cement_type=$1
      ORDER BY quantity_tons DESC
      LIMIT 1
    `, cementType).Scan(&fromWarehouseID)
		if fromWarehouseID == 0 {
			writeAPIError(w, http.StatusConflict, "INSUFFICIENT_STOCK", "no warehouse stock for cement type")
			return
		}
	}

	// Check stock availability.
	var available float64
	if err := tx.QueryRow(r.Context(), `
    SELECT quantity_tons
    FROM stock_levels
    WHERE warehouse_id=$1 AND cement_type=$2
    FOR UPDATE
  `, fromWarehouseID, cementType).Scan(&available); err != nil {
		writeAPIError(w, http.StatusConflict, "INSUFFICIENT_STOCK", "stock row not found")
		return
	}
	if available < qty {
		writeAPIError(w, http.StatusConflict, "INSUFFICIENT_STOCK", "insufficient stock")
		return
	}

	// Compute ETA based on dummy distance.
	var wlat, wlng, dlat, dlng float64
	if err := tx.QueryRow(r.Context(), `SELECT lat,lng FROM warehouses WHERE id=$1`, fromWarehouseID).Scan(&wlat, &wlng); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid warehouse")
		return
	}
	if err := tx.QueryRow(r.Context(), `SELECT lat,lng FROM distributors WHERE id=$1`, distributorID).Scan(&dlat, &dlng); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid distributor")
		return
	}

	departAt := time.Now().UTC().Add(45 * time.Minute)
	if body.DepartAt != nil {
		departAt = body.DepartAt.UTC()
	}
	travelMin := estimateTravelMinutes(wlat, wlng, dlat, dlng)
	eta := departAt.Add(time.Duration(travelMin) * time.Minute)

	var shipmentID int64
	etaMinutes := int(math.Max(0, eta.Sub(time.Now().UTC()).Minutes()))
	truckID := body.TruckID
	if err := tx.QueryRow(r.Context(), `
    INSERT INTO shipments (from_warehouse_id, to_distributor_id, status, cement_type, quantity_tons, truck_id, depart_at, arrive_eta, eta_minutes)
    VALUES ($1,$2,'SCHEDULED',$3,$4,$5,$6,$7,$8)
    RETURNING id
  `, fromWarehouseID, distributorID, cementType, qty, truckID, departAt, eta, etaMinutes).Scan(&shipmentID); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	// Reserve stock (decrement now) + movement.
	if _, err := tx.Exec(r.Context(), `
    UPDATE stock_levels SET quantity_tons = quantity_tons - $1, updated_at=now()
    WHERE warehouse_id=$2 AND cement_type=$3
  `, qty, fromWarehouseID, cementType); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	_, _ = tx.Exec(r.Context(), `
    INSERT INTO inventory_movements (actor_user_id, warehouse_id, cement_type, movement_type, quantity_tons, reason, ref_type, ref_id, metadata)
    VALUES ($1,$2,$3,'OUT',$4,'Order approved','shipment',$5, '{}'::jsonb)
  `, u.ID, fromWarehouseID, cementType, qty, fmt.Sprintf("%d", shipmentID))

	// Update order request.
	if _, err := tx.Exec(r.Context(), `
    UPDATE order_requests
    SET status='APPROVED', decided_at=now(), decided_by_user_id=$1, decision_reason=$2, approved_shipment_id=$3, updated_at=now()
    WHERE id=$4
  `, u.ID, body.Reason, shipmentID, orderID); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	_, _ = tx.Exec(r.Context(), `UPDATE shipments SET order_request_id=$1 WHERE id=$2`, orderID, shipmentID)

	if err := tx.Commit(r.Context()); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	a.insertAuditLog(r, &u, "ORDER_APPROVED", "order_request", fmt.Sprintf("%d", orderID), map[string]any{"shipmentId": shipmentID, "warehouseId": fromWarehouseID, "cementType": cementType, "quantityTons": qty})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "shipmentId": shipmentID})
}

func (a *App) handleOpsRejectOrder(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	idStr := chi.URLParam(r, "id")
	orderID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	tag, err := a.db.Exec(r.Context(), `
    UPDATE order_requests
    SET status='REJECTED', decided_at=now(), decided_by_user_id=$1, decision_reason=$2, updated_at=now()
    WHERE id=$3 AND status='PENDING'
  `, u.ID, body.Reason, orderID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusConflict, "INVALID_STATE", "order is not pending")
		return
	}
	a.insertAuditLog(r, &u, "ORDER_REJECTED", "order_request", fmt.Sprintf("%d", orderID), map[string]any{"reason": body.Reason})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleOpsOrderAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT l.id, l.ts, l.actor_user_id, u.name, l.action, l.entity_id, l.metadata
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE l.entity_type='order_request'
    ORDER BY l.ts DESC
    LIMIT 200
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var ts time.Time
		var actorID *int64
		var actorName *string
		var action, entityID string
		var meta json.RawMessage
		_ = rows.Scan(&id, &ts, &actorID, &actorName, &action, &entityID, &meta)
		items = append(items, map[string]any{
			"id":             id,
			"ts":             ts,
			"actorUserId":    actorID,
			"actorName":      actorName,
			"action":         action,
			"orderRequestId": entityID,
			"metadata":       meta,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsActivityLog(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT l.id, l.ts, l.actor_user_id, u.name, l.action, l.entity_type, l.entity_id, l.metadata
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.ts DESC
    LIMIT 300
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var ts time.Time
		var actorID *int64
		var actorName *string
		var action, et, eid string
		var meta json.RawMessage
		_ = rows.Scan(&id, &ts, &actorID, &actorName, &action, &et, &eid, &meta)
		items = append(items, map[string]any{
			"id":          id,
			"ts":          ts,
			"actorUserId": actorID,
			"actorName":   actorName,
			"action":      action,
			"entityType":  et,
			"entityId":    eid,
			"metadata":    meta,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsUpdateShipment(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	idStr := chi.URLParam(r, "id")
	shipmentID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		FromWarehouseID *int64     `json:"fromWarehouseId"`
		ToDistributorID *int64     `json:"toDistributorId"`
		TruckID         *int64     `json:"truckId"`
		DepartAt        *time.Time `json:"departAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	// Read current shipment and coords.
	var fromID, toID int64
	var status string
	var wlat, wlng, dlat, dlng float64
	var depart *time.Time
	var eta *time.Time
	var truckID *int64
	if err := tx.QueryRow(r.Context(), `
    SELECT s.from_warehouse_id, s.to_distributor_id, s.status, s.truck_id, s.depart_at, s.arrive_eta,
           w.lat, w.lng, d.lat, d.lng
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
    WHERE s.id=$1
    FOR UPDATE
	`, shipmentID).Scan(&fromID, &toID, &status, &truckID, &depart, &eta, &wlat, &wlng, &dlat, &dlng); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "shipment not found")
		return
	}
	if body.TruckID != nil {
		truckID = body.TruckID
	}
	if body.FromWarehouseID != nil {
		fromID = *body.FromWarehouseID
		_ = tx.QueryRow(r.Context(), `SELECT lat,lng FROM warehouses WHERE id=$1`, fromID).Scan(&wlat, &wlng)
	}
	if body.ToDistributorID != nil {
		toID = *body.ToDistributorID
		_ = tx.QueryRow(r.Context(), `SELECT lat,lng FROM distributors WHERE id=$1`, toID).Scan(&dlat, &dlng)
	}
	if body.DepartAt != nil {
		d := body.DepartAt.UTC()
		depart = &d
	}
	if depart != nil && (status == "SCHEDULED" || status == "ON_DELIVERY" || status == "DELAYED") {
		travelMin := estimateTravelMinutes(wlat, wlng, dlat, dlng)
		e := depart.UTC().Add(time.Duration(travelMin) * time.Minute)
		eta = &e
	}
	etaMinutes := 0
	if eta != nil {
		etaMinutes = int(math.Max(0, eta.Sub(time.Now().UTC()).Minutes()))
	}

	if _, err := tx.Exec(r.Context(), `
    UPDATE shipments
    SET from_warehouse_id=$1, to_distributor_id=$2, truck_id=$3, depart_at=$4, arrive_eta=$5, eta_minutes=$6, updated_at=now()
    WHERE id=$7
	`, fromID, toID, truckID, depart, eta, etaMinutes, shipmentID); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	a.insertAuditLog(r, &u, "SHIPMENT_UPDATED", "shipment", fmt.Sprintf("%d", shipmentID), map[string]any{"fromWarehouseId": fromID, "toDistributorId": toID, "truckId": truckID})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleOpsPredictionReorder(w http.ResponseWriter, r *http.Request) {
	// Rule-based reorder recommendation:
	// uses current stock, threshold settings, lead time, and nearby project demand intensity.
	// Radius is a simple fixed value (50km) for demo purposes.
	const radiusKm = 50.0

	// Load projects for intensity signal.
	prows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng, demand_tons_month FROM projects`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	type proj struct {
		id     int64
		lat    float64
		lng    float64
		demand float64
	}
	projects := []proj{}
	for prows.Next() {
		var p proj
		var name string
		_ = prows.Scan(&p.id, &name, &p.lat, &p.lng, &p.demand)
		projects = append(projects, p)
	}
	prows.Close()

	rows, err := a.db.Query(r.Context(), `
    SELECT w.id, w.name, w.lat, w.lng,
           s.cement_type, s.quantity_tons,
           t.min_stock, t.safety_stock, t.warning_level, t.critical_level, t.lead_time_days
    FROM stock_levels s
    JOIN warehouses w ON w.id = s.warehouse_id
    JOIN threshold_settings t ON t.warehouse_id=s.warehouse_id AND t.cement_type=s.cement_type
    ORDER BY w.id, s.cement_type
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var wid int64
		var wname string
		var wlat, wlng float64
		var ct string
		var qty float64
		var min, safety, warn, critical float64
		var lead int
		_ = rows.Scan(&wid, &wname, &wlat, &wlng, &ct, &qty, &min, &safety, &warn, &critical, &lead)

		intensity := 0.0
		for _, p := range projects {
			if haversineKm(wlat, wlng, p.lat, p.lng) <= radiusKm {
				intensity += p.demand
			}
		}
		// Rough demand during lead time window.
		demandLead := intensity * (float64(lead) / 30.0)
		target := safety + demandLead
		recommended := math.Max(0, target-qty)

		recoStatus := "OK"
		urgency := "LOW"
		if recommended > 0 {
			recoStatus = "REORDER"
		}
		if qty <= critical || recommended >= 250 {
			urgency = "HIGH"
		} else if qty <= warn || recommended >= 120 {
			urgency = "MED"
		}

		out = append(out, map[string]any{
			"warehouseId":                        wid,
			"warehouseName":                      wname,
			"cementType":                         ct,
			"quantityTons":                       qty,
			"leadTimeDays":                       lead,
			"nearbyProjectIntensityTonsPerMonth": intensity,
			"targetStockTons":                    target,
			"recommendedQuantityTons":            recommended,
			"status":                             recoStatus,
			"urgency":                            urgency,
			"radiusKm":                           radiusKm,
			"thresholds": map[string]any{
				"minStock":      min,
				"safetyStock":   safety,
				"warningLevel":  warn,
				"criticalLevel": critical,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (a *App) handleOpsShipments(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 50 {
		pageSize = 50
	}
	offset := (page - 1) * pageSize

	rows, err := a.db.Query(r.Context(), `
		SELECT s.id, s.status, s.cement_type, s.quantity_tons,
					 s.depart_at, s.arrive_eta, s.eta_minutes, s.last_lat, s.last_lng, s.last_update,
					 w.id, w.name,
					 d.id, d.name,
					 t.id, t.code, t.name
		FROM shipments s
		JOIN warehouses w ON w.id = s.from_warehouse_id
		JOIN distributors d ON d.id = s.to_distributor_id
		LEFT JOIN trucks t ON t.id = s.truck_id
		ORDER BY s.id DESC
		LIMIT $1 OFFSET $2
	`, pageSize, offset)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var status string
		var cementType string
		var qtyTons float64
		var depart, eta *time.Time
		var etaMinutes int
		var lastLat, lastLng *float64
		var lastUpdate *time.Time
		var wid, did int64
		var wname, dname string
		var truckID *int64
		var truckCode, truckName *string
		_ = rows.Scan(&id, &status, &cementType, &qtyTons, &depart, &eta, &etaMinutes, &lastLat, &lastLng, &lastUpdate, &wid, &wname, &did, &dname, &truckID, &truckCode, &truckName)
		truck := map[string]any{"id": nil, "code": nil, "name": nil}
		if truckID != nil {
			truck["id"] = *truckID
			if truckCode != nil {
				truck["code"] = *truckCode
			}
			if truckName != nil {
				truck["name"] = *truckName
			}
		}
		items = append(items, map[string]any{
			"id":            id,
			"status":        status,
			"cementType":    cementType,
			"quantityTons":  qtyTons,
			"departAt":      depart,
			"arriveEta":     eta,
			"etaMinutes":    etaMinutes,
			"lastLat":       lastLat,
			"lastLng":       lastLng,
			"lastUpdate":    lastUpdate,
			"truck":         truck,
			"fromWarehouse": map[string]any{"id": wid, "name": wname},
			"toDistributor": map[string]any{"id": did, "name": dname},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "page": page, "pageSize": pageSize})
}

func (a *App) handleOpsShipmentDetail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}

	// Load shipment + endpoints.
	row := a.db.QueryRow(r.Context(), `
    SELECT s.id, s.status, s.cement_type, s.quantity_tons,
           s.depart_at, s.arrive_eta, s.eta_minutes, s.last_lat, s.last_lng, s.last_update,
           w.id, w.name, w.lat, w.lng,
           d.id, d.name, d.lat, d.lng,
           t.id, t.code, t.name
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
    LEFT JOIN trucks t ON t.id = s.truck_id
    WHERE s.id = $1
  `, id)
	var status string
	var cementType string
	var qtyTons float64
	var depart, eta *time.Time
	var etaMinutes int
	var lastLat, lastLng *float64
	var lastUpdate *time.Time
	var wid, did int64
	var wname, dname string
	var wlat, wlng, dlat, dlng float64
	var truckID *int64
	var truckCode, truckName *string
	if err := row.Scan(&id, &status, &cementType, &qtyTons, &depart, &eta, &etaMinutes, &lastLat, &lastLng, &lastUpdate, &wid, &wname, &wlat, &wlng, &did, &dname, &dlat, &dlng, &truckID, &truckCode, &truckName); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "shipment not found")
		return
	}
	truck := map[string]any{"id": nil, "code": nil, "name": nil}
	if truckID != nil {
		truck["id"] = *truckID
		if truckCode != nil {
			truck["code"] = *truckCode
		}
		if truckName != nil {
			truck["name"] = *truckName
		}
	}

	// Update truck position for in-transit shipments.
	if status == "ON_DELIVERY" && depart != nil && eta != nil {
		now := time.Now().UTC()
		frac := float64(now.Sub(depart.UTC())) / float64(eta.UTC().Sub(depart.UTC()))
		if frac < 0 {
			frac = 0
		}
		if frac > 1 {
			frac = 1
		}
		ll := wlat + (dlat-wlat)*frac
		lg := wlng + (dlng-wlng)*frac
		lastLat, lastLng = &ll, &lg
		u := now
		lastUpdate = &u
		etaMinutes = int(math.Max(0, eta.UTC().Sub(now).Minutes()))
		_, _ = a.db.Exec(r.Context(), `UPDATE shipments SET last_lat=$1, last_lng=$2, last_update=$3, eta_minutes=$4 WHERE id=$5`, ll, lg, u, etaMinutes, id)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":            id,
		"status":        status,
		"cementType":    cementType,
		"quantityTons":  qtyTons,
		"departAt":      depart,
		"arriveEta":     eta,
		"etaMinutes":    etaMinutes,
		"truck":         map[string]any{"id": truck["id"], "code": truck["code"], "name": truck["name"], "lastLat": lastLat, "lastLng": lastLng, "lastUpdate": lastUpdate},
		"fromWarehouse": map[string]any{"id": wid, "name": wname, "lat": wlat, "lng": wlng},
		"toDistributor": map[string]any{"id": did, "name": dname, "lat": dlat, "lng": dlng},
	})
}

// ---------- ops: issues ----------

func (a *App) handleOpsIssues(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("status")))
	issueType := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("type")))
	severity := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("severity")))

	whereParts := []string{}
	args := []any{}
	idx := 1
	if status != "" && status != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("i.status=$%d", idx))
		args = append(args, status)
		idx++
	}
	if issueType != "" && issueType != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("i.issue_type=$%d", idx))
		args = append(args, issueType)
		idx++
	}
	if severity != "" && severity != "ALL" {
		whereParts = append(whereParts, fmt.Sprintf("i.severity=$%d", idx))
		args = append(args, severity)
		idx++
	}

	where := ""
	if len(whereParts) > 0 {
		where = "WHERE " + strings.Join(whereParts, " AND ")
	}

	q := fmt.Sprintf(`
    SELECT i.id, i.issue_type, i.severity, i.status,
           i.title, i.description,
           i.shipment_id,
           i.warehouse_id, w.name,
           i.distributor_id, d.name,
           i.reported_by_user_id, ru.name,
           i.reported_at,
           i.resolved_by_user_id, su.name,
           i.resolved_at, i.resolution_notes,
           i.created_at, i.updated_at
    FROM ops_issues i
    LEFT JOIN warehouses w ON w.id = i.warehouse_id
    LEFT JOIN distributors d ON d.id = i.distributor_id
    LEFT JOIN users ru ON ru.id = i.reported_by_user_id
    LEFT JOIN users su ON su.id = i.resolved_by_user_id
    %s
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT 200
  `, where)

	rows, err := a.db.Query(r.Context(), q, args...)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var it, sev, st string
		var title, desc string
		var shipmentID *int64
		var warehouseID *int64
		var warehouseName *string
		var distributorID *int64
		var distributorName *string
		var reportedByID *int64
		var reportedByName *string
		var reportedAt time.Time
		var resolvedByID *int64
		var resolvedByName *string
		var resolvedAt *time.Time
		var resolutionNotes string
		var createdAt, updatedAt time.Time

		_ = rows.Scan(
			&id, &it, &sev, &st,
			&title, &desc,
			&shipmentID,
			&warehouseID, &warehouseName,
			&distributorID, &distributorName,
			&reportedByID, &reportedByName,
			&reportedAt,
			&resolvedByID, &resolvedByName,
			&resolvedAt, &resolutionNotes,
			&createdAt, &updatedAt,
		)

		wh := map[string]any{"id": nil, "name": nil}
		if warehouseID != nil {
			wh["id"] = *warehouseID
			if warehouseName != nil {
				wh["name"] = *warehouseName
			}
		}
		di := map[string]any{"id": nil, "name": nil}
		if distributorID != nil {
			di["id"] = *distributorID
			if distributorName != nil {
				di["name"] = *distributorName
			}
		}
		reportedBy := map[string]any{"id": nil, "name": nil}
		if reportedByID != nil {
			reportedBy["id"] = *reportedByID
			if reportedByName != nil {
				reportedBy["name"] = *reportedByName
			}
		}
		resolvedBy := map[string]any{"id": nil, "name": nil}
		if resolvedByID != nil {
			resolvedBy["id"] = *resolvedByID
			if resolvedByName != nil {
				resolvedBy["name"] = *resolvedByName
			}
		}

		items = append(items, map[string]any{
			"id":              id,
			"issueType":       it,
			"severity":        sev,
			"status":          st,
			"title":           title,
			"description":     desc,
			"shipmentId":      shipmentID,
			"warehouse":       wh,
			"distributor":     di,
			"reportedBy":      reportedBy,
			"reportedAt":      reportedAt,
			"resolvedBy":      resolvedBy,
			"resolvedAt":      resolvedAt,
			"resolutionNotes": resolutionNotes,
			"createdAt":       createdAt,
			"updatedAt":       updatedAt,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleOpsCreateIssue(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	var body struct {
		IssueType     string         `json:"issueType"`
		Severity      string         `json:"severity"`
		Title         string         `json:"title"`
		Description   string         `json:"description"`
		ShipmentID    *int64         `json:"shipmentId"`
		WarehouseID   *int64         `json:"warehouseId"`
		DistributorID *int64         `json:"distributorId"`
		Metadata      map[string]any `json:"metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	issueType := strings.TrimSpace(strings.ToUpper(body.IssueType))
	severity := strings.TrimSpace(strings.ToUpper(body.Severity))
	title := strings.TrimSpace(body.Title)
	desc := strings.TrimSpace(body.Description)

	allowedType := map[string]bool{"DELAY": true, "STOCK_SHORTAGE": true, "FLEET": true, "OTHER": true}
	if !allowedType[issueType] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "issueType must be DELAY|STOCK_SHORTAGE|FLEET|OTHER")
		return
	}
	if severity == "" {
		severity = "MED"
	}
	allowedSev := map[string]bool{"LOW": true, "MED": true, "HIGH": true}
	if !allowedSev[severity] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "severity must be LOW|MED|HIGH")
		return
	}
	if title == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "title required")
		return
	}
	if body.ShipmentID != nil && *body.ShipmentID <= 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "shipmentId must be positive")
		return
	}
	if body.WarehouseID != nil && *body.WarehouseID <= 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "warehouseId must be positive")
		return
	}
	if body.DistributorID != nil && *body.DistributorID <= 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "distributorId must be positive")
		return
	}
	if body.Metadata == nil {
		body.Metadata = map[string]any{}
	}
	metaBytes, _ := json.Marshal(body.Metadata)

	var id int64
	if err := a.db.QueryRow(r.Context(), `
    INSERT INTO ops_issues (
      issue_type, severity, status,
      title, description,
      shipment_id, warehouse_id, distributor_id,
      reported_by_user_id, reported_at,
      resolution_notes,
      metadata,
      created_at, updated_at
    )
    VALUES ($1,$2,'OPEN',$3,$4,$5,$6,$7,$8,now(),'',$9,now(),now())
    RETURNING id
  `, issueType, severity, title, desc, body.ShipmentID, body.WarehouseID, body.DistributorID, u.ID, metaBytes).Scan(&id); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	a.insertAuditLog(r, &u, "ISSUE_CREATED", "issue", fmt.Sprintf("%d", id), map[string]any{
		"issueType":     issueType,
		"severity":      severity,
		"shipmentId":    body.ShipmentID,
		"warehouseId":   body.WarehouseID,
		"distributorId": body.DistributorID,
	})

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func (a *App) handleOpsResolveIssue(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		ResolutionNotes string `json:"resolutionNotes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	notes := strings.TrimSpace(body.ResolutionNotes)
	if notes == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "resolutionNotes required")
		return
	}

	ct, err := a.db.Exec(r.Context(), `
    UPDATE ops_issues
    SET status='RESOLVED', resolved_by_user_id=$1, resolved_at=now(), resolution_notes=$2, updated_at=now()
    WHERE id=$3 AND status='OPEN'
  `, u.ID, notes, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if ct.RowsAffected() == 0 {
		var exists bool
		_ = a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM ops_issues WHERE id=$1)`, id).Scan(&exists)
		if !exists {
			writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "issue not found")
			return
		}
		writeAPIError(w, http.StatusConflict, "INVALID_STATE", "issue already resolved")
		return
	}

	a.insertAuditLog(r, &u, "ISSUE_RESOLVED", "issue", fmt.Sprintf("%d", id), map[string]any{"resolutionNotes": notes})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- executive ----------

func (a *App) handleExecTargetVsActual(w http.ResponseWriter, r *http.Request) {
	monthStr := strings.TrimSpace(r.URL.Query().Get("month"))
	if monthStr == "" {
		monthStr = time.Now().Format("2006-01")
	}
	t, err := time.Parse("2006-01", monthStr)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "month must be YYYY-MM")
		return
	}
	start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	daysInMonth := int(end.Sub(start).Hours() / 24)

	var target float64
	_ = a.db.QueryRow(r.Context(), `SELECT target_tons FROM sales_targets WHERE month = $1`, start.Format("2006-01-02")).Scan(&target)
	if target == 0 {
		target = 15000
	}

	// Actual per day
	rows, err := a.db.Query(r.Context(), `
    SELECT order_date, SUM(quantity_tons)
    FROM sales_orders
    WHERE order_date >= $1 AND order_date < $2
    GROUP BY order_date
    ORDER BY order_date
  `, start.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	actualByDay := map[string]float64{}
	for rows.Next() {
		var d time.Time
		var qty float64
		_ = rows.Scan(&d, &qty)
		actualByDay[d.Format("2006-01-02")] = qty
	}

	series := []map[string]any{}
	cumulativeActual := 0.0
	for i := 0; i < daysInMonth; i++ {
		day := start.AddDate(0, 0, i)
		key := day.Format("2006-01-02")
		cumulativeActual += actualByDay[key]
		cumulativeTarget := target * (float64(i+1) / float64(daysInMonth))
		series = append(series, map[string]any{
			"date":   key,
			"target": cumulativeTarget,
			"actual": cumulativeActual,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"month":         monthStr,
		"targetMonthly": target,
		"series":        series,
	})
}

func (a *App) handleExecCompetitorMap(w http.ResponseWriter, r *http.Request) {
	bboxStr := r.URL.Query().Get("bbox")
	minLat, minLng, maxLat, maxLng, ok := parseBBox(bboxStr)
	if !ok {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "bbox must be minLat,minLng,maxLat,maxLng")
		return
	}
	rows, err := a.db.Query(r.Context(), `
    SELECT s.id, s.name, s.lat, s.lng, c.our_share_pct, c.competitor_share_pct, c.updated_at
    FROM stores s
    JOIN competitor_presence c ON c.store_id = s.id
    WHERE s.lat BETWEEN $1 AND $2 AND s.lng BETWEEN $3 AND $4
    ORDER BY s.id
  `, minLat, maxLat, minLng, maxLng)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var lat, lng, our, comp float64
		var updated time.Time
		_ = rows.Scan(&id, &name, &lat, &lng, &our, &comp, &updated)
		items = append(items, map[string]any{
			"id":                 id,
			"name":               name,
			"lat":                lat,
			"lng":                lng,
			"ourSharePct":        our,
			"competitorSharePct": comp,
			"updatedAt":          updated,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleExecPartnersPerformance(w http.ResponseWriter, r *http.Request) {
	// Summary per distributor for last 90 days + trend vs previous 30 days.
	rows, err := a.db.Query(r.Context(), `
    WITH last30 AS (
      SELECT distributor_id, COALESCE(SUM(quantity_tons),0) AS qty
      FROM sales_orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY distributor_id
    ), prev30 AS (
      SELECT distributor_id, COALESCE(SUM(quantity_tons),0) AS qty
      FROM sales_orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '60 days'
        AND order_date < CURRENT_DATE - INTERVAL '30 days'
      GROUP BY distributor_id
    ), total90 AS (
      SELECT distributor_id,
             COALESCE(SUM(quantity_tons),0) AS qty,
             COALESCE(SUM(total_price),0) AS total_price,
             MAX(order_date) AS last_order
      FROM sales_orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY distributor_id
    )
    SELECT d.id, d.name,
           COALESCE(t.qty,0) AS qty90,
           COALESCE(t.total_price,0) AS price90,
           t.last_order,
           COALESCE(l.qty,0) AS qty_last30,
           COALESCE(p.qty,0) AS qty_prev30
    FROM distributors d
    LEFT JOIN total90 t ON t.distributor_id = d.id
    LEFT JOIN last30 l ON l.distributor_id = d.id
    LEFT JOIN prev30 p ON p.distributor_id = d.id
    ORDER BY d.id
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var qty90, price90, qLast30, qPrev30 float64
		var lastOrder *time.Time
		_ = rows.Scan(&id, &name, &qty90, &price90, &lastOrder, &qLast30, &qPrev30)
		trendPct := 0.0
		if qPrev30 > 0 {
			trendPct = ((qLast30 - qPrev30) / qPrev30) * 100
		} else if qLast30 > 0 {
			trendPct = 100
		}
		items = append(items, map[string]any{
			"distributorId":   id,
			"distributorName": name,
			"totalQtyTons90d": qty90,
			"totalPrice90d":   price90,
			"lastOrderDate":   lastOrder,
			"trendPct":        trendPct,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleExecShipmentsSummary(w http.ResponseWriter, r *http.Request) {
	daysStr := strings.TrimSpace(r.URL.Query().Get("days"))
	days := int64(0)
	if daysStr != "" {
		v, err := strconv.ParseInt(daysStr, 10, 64)
		if err != nil || v < 0 || v > 3650 {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "days must be a number between 0 and 3650")
			return
		}
		days = v
	}

	var total, delivered, planned, inTransit, cancelled, overdue int64
	err := a.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::bigint AS total,
			COUNT(*) FILTER (WHERE status = 'DELIVERED')::bigint AS delivered,
			COUNT(*) FILTER (WHERE status = 'PLANNED')::bigint AS planned,
			COUNT(*) FILTER (WHERE status = 'IN_TRANSIT')::bigint AS in_transit,
			COUNT(*) FILTER (WHERE status = 'CANCELLED')::bigint AS cancelled,
			COUNT(*) FILTER (
				WHERE status IN ('PLANNED','IN_TRANSIT')
				  AND arrive_eta IS NOT NULL
				  AND arrive_eta < NOW()
			)::bigint AS overdue
		FROM shipments
		WHERE ($1::bigint = 0)
		   OR (
				(depart_at IS NOT NULL AND depart_at >= NOW() - ($1::bigint * INTERVAL '1 day'))
			 OR (depart_at IS NULL AND arrive_eta IS NOT NULL AND arrive_eta >= NOW() - ($1::bigint * INTERVAL '1 day'))
		   )
	`, days).Scan(&total, &delivered, &planned, &inTransit, &cancelled, &overdue)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	overduePct := 0.0
	if total > 0 {
		overduePct = (float64(overdue) / float64(total)) * 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"days":       days,
		"total":      total,
		"delivered":  delivered,
		"overdue":    overdue,
		"overduePct": overduePct,
		"byStatus": map[string]any{
			"PLANNED":    planned,
			"IN_TRANSIT": inTransit,
			"DELIVERED":  delivered,
			"CANCELLED":  cancelled,
		},
	})
}

func (a *App) handleExecSalesSummary(w http.ResponseWriter, r *http.Request) {
	daysStr := strings.TrimSpace(r.URL.Query().Get("days"))
	days := int64(90)
	if daysStr != "" {
		v, err := strconv.ParseInt(daysStr, 10, 64)
		if err != nil || v <= 0 || v > 3650 {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "days must be a number between 1 and 3650")
			return
		}
		days = v
	}

	var orderCount int64
	var totalQty, totalRevenue, avgOrder float64
	err := a.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::bigint AS orders,
			COALESCE(SUM(quantity_tons),0) AS qty,
			COALESCE(SUM(total_price),0) AS revenue,
			COALESCE(AVG(total_price),0) AS avg_order
		FROM sales_orders
		WHERE order_date >= CURRENT_DATE - ($1::bigint * INTERVAL '1 day')
	`, days).Scan(&orderCount, &totalQty, &totalRevenue, &avgOrder)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT d.id, d.name,
		       COALESCE(SUM(o.quantity_tons),0) AS qty,
		       COALESCE(SUM(o.total_price),0) AS revenue
		FROM distributors d
		LEFT JOIN sales_orders o
		  ON o.distributor_id = d.id
		 AND o.order_date >= CURRENT_DATE - ($1::bigint * INTERVAL '1 day')
		GROUP BY d.id, d.name
		ORDER BY revenue DESC, qty DESC, d.id
	`, days)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var qty, revenue float64
		_ = rows.Scan(&id, &name, &qty, &revenue)
		items = append(items, map[string]any{
			"distributorId":   id,
			"distributorName": name,
			"qtyTons":         qty,
			"revenue":         revenue,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"days":            days,
		"orderCount":      orderCount,
		"totalQtyTons":    totalQty,
		"totalRevenue":    totalRevenue,
		"avgOrderValue":   avgOrder,
		"topDistributors": items,
		"approvedCount":   nil,
	})
}

func (a *App) handleExecSalesOverview(w http.ResponseWriter, r *http.Request) {
	monthStr := strings.TrimSpace(r.URL.Query().Get("month"))
	if monthStr == "" {
		monthStr = time.Now().Format("2006-01")
	}
	t, err := time.Parse("2006-01", monthStr)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "month must be YYYY-MM")
		return
	}
	start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	prevStart := start.AddDate(0, -1, 0)
	prevEnd := start

	var orders, prevOrders int64
	var qty, prevQty, revenue, prevRevenue float64
	err = a.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::bigint AS orders,
			COALESCE(SUM(quantity_tons),0) AS qty,
			COALESCE(SUM(total_price),0) AS revenue
		FROM sales_orders
		WHERE order_date >= $1 AND order_date < $2
	`, start.Format("2006-01-02"), end.Format("2006-01-02")).Scan(&orders, &qty, &revenue)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	err = a.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::bigint AS orders,
			COALESCE(SUM(quantity_tons),0) AS qty,
			COALESCE(SUM(total_price),0) AS revenue
		FROM sales_orders
		WHERE order_date >= $1 AND order_date < $2
	`, prevStart.Format("2006-01-02"), prevEnd.Format("2006-01-02")).Scan(&prevOrders, &prevQty, &prevRevenue)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	growthQtyPct := 0.0
	if prevQty > 0 {
		growthQtyPct = ((qty - prevQty) / prevQty) * 100
	} else if qty > 0 {
		growthQtyPct = 100
	}
	growthRevenuePct := 0.0
	if prevRevenue > 0 {
		growthRevenuePct = ((revenue - prevRevenue) / prevRevenue) * 100
	} else if revenue > 0 {
		growthRevenuePct = 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"month": monthStr,
		"current": map[string]any{
			"orderCount": orders,
			"qtyTons":    qty,
			"revenue":    revenue,
			"avgOrderValue": func() float64 {
				if orders > 0 {
					return revenue / float64(orders)
				}
				return 0
			}(),
		},
		"previous": map[string]any{
			"orderCount": prevOrders,
			"qtyTons":    prevQty,
			"revenue":    prevRevenue,
		},
		"growth": map[string]any{
			"qtyPct":     growthQtyPct,
			"revenuePct": growthRevenuePct,
		},
	})
}

func (a *App) handleExecRegionalPerformance(w http.ResponseWriter, r *http.Request) {
	daysStr := strings.TrimSpace(r.URL.Query().Get("days"))
	days := int64(30)
	if daysStr != "" {
		v, err := strconv.ParseInt(daysStr, 10, 64)
		if err != nil || v <= 0 || v > 3650 {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "days must be a number between 1 and 3650")
			return
		}
		days = v
	}

	rows, err := a.db.Query(r.Context(), `
		WITH sales_win AS (
			SELECT distributor_id,
				   COUNT(*)::bigint AS orders,
				   COALESCE(SUM(quantity_tons),0) AS qty,
				   COALESCE(SUM(total_price),0) AS revenue
			FROM sales_orders
			WHERE order_date >= CURRENT_DATE - ($1::bigint * INTERVAL '1 day')
			GROUP BY distributor_id
		), sales_prev AS (
			SELECT distributor_id,
				   COALESCE(SUM(quantity_tons),0) AS qty
			FROM sales_orders
			WHERE order_date >= CURRENT_DATE - (($1::bigint * 2) * INTERVAL '1 day')
			  AND order_date <  CURRENT_DATE - ($1::bigint * INTERVAL '1 day')
			GROUP BY distributor_id
		), ship_win AS (
			SELECT to_distributor_id AS distributor_id,
				   COUNT(*)::bigint AS total_shipments,
				   COUNT(*) FILTER (
					WHERE status IN ('PLANNED','IN_TRANSIT')
					  AND arrive_eta IS NOT NULL
					  AND arrive_eta < NOW()
				)::bigint AS overdue_shipments
			FROM shipments
			WHERE (
				(depart_at IS NOT NULL AND depart_at >= NOW() - ($1::bigint * INTERVAL '1 day'))
			 OR (depart_at IS NULL AND arrive_eta IS NOT NULL AND arrive_eta >= NOW() - ($1::bigint * INTERVAL '1 day'))
			)
			GROUP BY to_distributor_id
		)
		SELECT d.id, d.name,
		       COALESCE(sw.orders,0) AS orders,
		       COALESCE(sw.qty,0) AS qty,
		       COALESCE(sw.revenue,0) AS revenue,
		       COALESCE(sp.qty,0) AS prev_qty,
		       COALESCE(sh.total_shipments,0) AS ship_total,
		       COALESCE(sh.overdue_shipments,0) AS ship_overdue
		FROM distributors d
		LEFT JOIN sales_win sw ON sw.distributor_id = d.id
		LEFT JOIN sales_prev sp ON sp.distributor_id = d.id
		LEFT JOIN ship_win sh ON sh.distributor_id = d.id
		ORDER BY revenue DESC, qty DESC, d.id
	`, days)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var orders, shipTotal, shipOverdue int64
		var qty, revenue, prevQty float64
		_ = rows.Scan(&id, &name, &orders, &qty, &revenue, &prevQty, &shipTotal, &shipOverdue)
		growthPct := 0.0
		if prevQty > 0 {
			growthPct = ((qty - prevQty) / prevQty) * 100
		} else if qty > 0 {
			growthPct = 100
		}
		overduePct := 0.0
		if shipTotal > 0 {
			overduePct = (float64(shipOverdue) / float64(shipTotal)) * 100
		}
		avgOrderValue := 0.0
		if orders > 0 {
			avgOrderValue = revenue / float64(orders)
		}
		items = append(items, map[string]any{
			"distributorId":    id,
			"distributorName":  name,
			"orderCount":       orders,
			"qtyTons":          qty,
			"revenue":          revenue,
			"growthPct":        growthPct,
			"avgOrderValue":    avgOrderValue,
			"shipmentsTotal":   shipTotal,
			"shipmentsOverdue": shipOverdue,
			"overduePct":       overduePct,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"days":  days,
		"items": items,
		"note":  "Region tidak dimodelkan; agregasi menggunakan distributor sebagai proxy regional.",
	})
}

// ---------- ops: update shipment status ----------

func (a *App) handleOpsUpdateShipmentStatus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.Status = strings.TrimSpace(strings.ToUpper(body.Status))
	allowed := map[string]bool{"SCHEDULED": true, "ON_DELIVERY": true, "COMPLETED": true, "DELAYED": true}
	if !allowed[body.Status] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "status must be SCHEDULED|ON_DELIVERY|COMPLETED|DELAYED")
		return
	}

	u, _ := r.Context().Value(ctxUserKey).(User)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var fromID, toID int64
	var currentStatus string
	var orderReqID *int64
	var depart, eta *time.Time
	var wlat, wlng, dlat, dlng float64
	if err := tx.QueryRow(r.Context(), `
    SELECT s.from_warehouse_id, s.to_distributor_id, s.status, s.order_request_id, s.depart_at, s.arrive_eta,
           w.lat, w.lng, d.lat, d.lng
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
    WHERE s.id=$1
    FOR UPDATE
  `, id).Scan(&fromID, &toID, &currentStatus, &orderReqID, &depart, &eta, &wlat, &wlng, &dlat, &dlng); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "shipment not found")
		return
	}

	// Enforce a simple lifecycle to avoid impossible transitions.
	// SCHEDULED -> ON_DELIVERY|DELAYED|COMPLETED
	// ON_DELIVERY -> DELAYED|COMPLETED
	// DELAYED -> ON_DELIVERY|COMPLETED
	// COMPLETED -> terminal
	if body.Status != currentStatus {
		allowedNext := map[string]map[string]bool{
			"SCHEDULED":   {"ON_DELIVERY": true, "DELAYED": true, "COMPLETED": true},
			"ON_DELIVERY": {"DELAYED": true, "COMPLETED": true},
			"DELAYED":     {"ON_DELIVERY": true, "COMPLETED": true},
			"COMPLETED":   {},
		}
		if !allowedNext[currentStatus][body.Status] {
			writeAPIError(w, http.StatusConflict, "INVALID_STATE", fmt.Sprintf("invalid transition %s -> %s", currentStatus, body.Status))
			return
		}
	}

	now := time.Now().UTC()
	etaMinutes := 0
	var lastLat, lastLng *float64
	var lastUpdate *time.Time

	// Default ETA if missing.
	if eta == nil {
		mins := estimateTravelMinutes(wlat, wlng, dlat, dlng)
		e := now.Add(time.Duration(mins) * time.Minute)
		eta = &e
	}
	if depart == nil {
		d := now.Add(30 * time.Minute)
		depart = &d
	}

	switch body.Status {
	case "SCHEDULED":
		// Keep schedule/eta as-is.
		etaMinutes = int(math.Max(0, eta.UTC().Sub(now).Minutes()))
	case "ON_DELIVERY":
		// If starting delivery, set depart to now if it is in the future.
		if depart.UTC().After(now) {
			d := now
			depart = &d
		}
		etaMinutes = int(math.Max(0, eta.UTC().Sub(now).Minutes()))
		// initialize truck position at warehouse if missing
		ll, lg := wlat, wlng
		lastLat, lastLng = &ll, &lg
		u := now
		lastUpdate = &u
	case "DELAYED":
		// Push ETA forward by 60 minutes.
		e2 := eta.UTC().Add(60 * time.Minute)
		eta = &e2
		etaMinutes = int(math.Max(0, eta.UTC().Sub(now).Minutes()))
	case "COMPLETED":
		etaMinutes = 0
		ll, lg := dlat, dlng
		lastLat, lastLng = &ll, &lg
		u := now
		lastUpdate = &u
	}

	if _, err := tx.Exec(r.Context(), `
    UPDATE shipments
    SET status=$1, depart_at=$2, arrive_eta=$3, eta_minutes=$4,
        last_lat=COALESCE($5,last_lat), last_lng=COALESCE($6,last_lng), last_update=COALESCE($7,last_update),
        updated_at=now()
    WHERE id=$8
  `, body.Status, depart, eta, etaMinutes, lastLat, lastLng, lastUpdate, id); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	if orderReqID != nil && body.Status == "COMPLETED" {
		_, _ = tx.Exec(r.Context(), `UPDATE order_requests SET status='FULFILLED', updated_at=now() WHERE id=$1`, *orderReqID)
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	a.insertAuditLog(r, &u, "SHIPMENT_STATUS_UPDATED", "shipment", fmt.Sprintf("%d", id), map[string]any{"status": body.Status})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": body.Status})
}

// ---------- admin: distributors CRUD ----------

func (a *App) handleAdminListDistributors(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng, service_radius_km FROM distributors ORDER BY id`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var lat, lng, rad float64
		_ = rows.Scan(&id, &name, &lat, &lng, &rad)
		items = append(items, map[string]any{"id": id, "name": name, "lat": lat, "lng": lng, "serviceRadiusKm": rad})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreateDistributor(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name            string  `json:"name"`
		Lat             float64 `json:"lat"`
		Lng             float64 `json:"lng"`
		ServiceRadiusKm float64 `json:"serviceRadiusKm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	if body.ServiceRadiusKm <= 0 {
		body.ServiceRadiusKm = 10
	}
	var id int64
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO distributors (name, lat, lng, service_radius_km) VALUES ($1,$2,$3,$4) RETURNING id`,
		body.Name, body.Lat, body.Lng, body.ServiceRadiusKm).Scan(&id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (a *App) handleAdminUpdateDistributor(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name            string  `json:"name"`
		Lat             float64 `json:"lat"`
		Lng             float64 `json:"lng"`
		ServiceRadiusKm float64 `json:"serviceRadiusKm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	if body.ServiceRadiusKm <= 0 {
		body.ServiceRadiusKm = 10
	}
	tag, err := a.db.Exec(r.Context(),
		`UPDATE distributors SET name=$1, lat=$2, lng=$3, service_radius_km=$4 WHERE id=$5`,
		body.Name, body.Lat, body.Lng, body.ServiceRadiusKm, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "distributor not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeleteDistributor(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM distributors WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error: "+err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "distributor not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: stores CRUD ----------

func (a *App) handleAdminListStores(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng FROM stores ORDER BY id`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var lat, lng float64
		_ = rows.Scan(&id, &name, &lat, &lng)
		items = append(items, map[string]any{"id": id, "name": name, "lat": lat, "lng": lng})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreateStore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string  `json:"name"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	var id int64
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO stores (name, lat, lng) VALUES ($1,$2,$3) RETURNING id`,
		body.Name, body.Lat, body.Lng).Scan(&id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (a *App) handleAdminUpdateStore(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name string  `json:"name"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	tag, err := a.db.Exec(r.Context(),
		`UPDATE stores SET name=$1, lat=$2, lng=$3 WHERE id=$4`,
		body.Name, body.Lat, body.Lng, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "store not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeleteStore(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM stores WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error: "+err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "store not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: projects CRUD ----------

func (a *App) handleAdminListProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, type, lat, lng, start_date, end_date, demand_tons_month FROM projects ORDER BY id`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, ptype string
		var lat, lng, demand float64
		var startDate, endDate time.Time
		_ = rows.Scan(&id, &name, &ptype, &lat, &lng, &startDate, &endDate, &demand)
		items = append(items, map[string]any{
			"id": id, "name": name, "type": ptype,
			"lat": lat, "lng": lng,
			"startDate":       startDate.Format("2006-01-02"),
			"endDate":         endDate.Format("2006-01-02"),
			"demandTonsMonth": demand,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreateProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name            string  `json:"name"`
		Type            string  `json:"type"`
		Lat             float64 `json:"lat"`
		Lng             float64 `json:"lng"`
		StartDate       string  `json:"startDate"`
		EndDate         string  `json:"endDate"`
		DemandTonsMonth float64 `json:"demandTonsMonth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	if body.Type == "" {
		body.Type = "CONSTRUCTION"
	}
	if body.StartDate == "" {
		body.StartDate = time.Now().Format("2006-01-02")
	}
	if body.EndDate == "" {
		body.EndDate = time.Now().AddDate(0, 6, 0).Format("2006-01-02")
	}
	var id int64
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO projects (name, type, lat, lng, start_date, end_date, demand_tons_month) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		body.Name, body.Type, body.Lat, body.Lng, body.StartDate, body.EndDate, body.DemandTonsMonth).Scan(&id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (a *App) handleAdminUpdateProject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name            string  `json:"name"`
		Type            string  `json:"type"`
		Lat             float64 `json:"lat"`
		Lng             float64 `json:"lng"`
		StartDate       string  `json:"startDate"`
		EndDate         string  `json:"endDate"`
		DemandTonsMonth float64 `json:"demandTonsMonth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	tag, err := a.db.Exec(r.Context(),
		`UPDATE projects SET name=$1, type=$2, lat=$3, lng=$4, start_date=$5, end_date=$6, demand_tons_month=$7 WHERE id=$8`,
		body.Name, body.Type, body.Lat, body.Lng, body.StartDate, body.EndDate, body.DemandTonsMonth, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeleteProject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM projects WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "project not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: users ----------

func (a *App) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.distributor_id,
      u.disabled_at,
      COALESCE(MAX(s.created_at), NULL) AS last_login_at
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.id
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, email, role string
		var distributorID sql.NullInt64
		var disabledAt sql.NullTime
		var lastLoginAt sql.NullTime
		_ = rows.Scan(&id, &name, &email, &role, &distributorID, &disabledAt, &lastLoginAt)

		status := "ACTIVE"
		if disabledAt.Valid {
			status = "DISABLED"
		}
		last := ""
		if lastLoginAt.Valid {
			last = lastLoginAt.Time.Format("2006-01-02 15:04")
		}
		var dist any = nil
		if distributorID.Valid {
			dist = fmt.Sprintf("%d", distributorID.Int64)
		}
		items = append(items, map[string]any{
			"id":            fmt.Sprintf("%d", id),
			"name":          name,
			"email":         email,
			"role":          role,
			"distributorId": dist,
			"status":        status,
			"lastLoginAt":   last,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string `json:"name"`
		Email         string `json:"email"`
		Password      string `json:"password"`
		Role          string `json:"role"`
		DistributorID *int64 `json:"distributorId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	body.Role = strings.TrimSpace(body.Role)
	if body.Name == "" || body.Email == "" || !strings.Contains(body.Email, "@") {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name and valid email required")
		return
	}
	if strings.TrimSpace(body.Password) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "password required")
		return
	}
	allowedRole := map[string]bool{"SUPER_ADMIN": true, "MANAGEMENT": true, "OPERATOR": true, "DISTRIBUTOR": true}
	if !allowedRole[body.Role] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid role")
		return
	}
	if body.Role == "DISTRIBUTOR" && body.DistributorID == nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "distributorId required for DISTRIBUTOR")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "could not hash password")
		return
	}

	var id int64
	err = a.db.QueryRow(r.Context(), `
    INSERT INTO users (name, email, password_hash, role, distributor_id)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id
  `, body.Name, body.Email, string(hash), body.Role, body.DistributorID).Scan(&id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": fmt.Sprintf("%d", id)})
}

func (a *App) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name          string `json:"name"`
		Email         string `json:"email"`
		Role          string `json:"role"`
		DistributorID *int64 `json:"distributorId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	body.Role = strings.TrimSpace(body.Role)
	if body.Name == "" || body.Email == "" || !strings.Contains(body.Email, "@") {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name and valid email required")
		return
	}
	allowedRole := map[string]bool{"SUPER_ADMIN": true, "MANAGEMENT": true, "OPERATOR": true, "DISTRIBUTOR": true}
	if !allowedRole[body.Role] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid role")
		return
	}
	if body.Role == "DISTRIBUTOR" && body.DistributorID == nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "distributorId required for DISTRIBUTOR")
		return
	}
	if body.Role != "DISTRIBUTOR" {
		body.DistributorID = nil
	}

	tag, err := a.db.Exec(r.Context(), `UPDATE users SET name=$1, email=$2, role=$3, distributor_id=$4 WHERE id=$5`, body.Name, body.Email, body.Role, body.DistributorID, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM users WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminUpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.Status = strings.TrimSpace(body.Status)
	if body.Status != "ACTIVE" && body.Status != "DISABLED" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "status must be ACTIVE|DISABLED")
		return
	}
	var tag pgconn.CommandTag
	if body.Status == "DISABLED" {
		tag, err = a.db.Exec(r.Context(), `UPDATE users SET disabled_at = now() WHERE id=$1`, id)
	} else {
		tag, err = a.db.Exec(r.Context(), `UPDATE users SET disabled_at = NULL WHERE id=$1`, id)
	}
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminResetUserPassword(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	temp := strings.ReplaceAll(uuid.NewString(), "-", "")
	if len(temp) > 12 {
		temp = temp[:12]
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(temp), bcrypt.DefaultCost)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "could not hash password")
		return
	}
	if _, err := a.db.Exec(r.Context(), `UPDATE users SET password_hash=$1 WHERE id=$2`, string(hash), id); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tempPassword": temp})
}

// ---------- admin: rbac ----------

func (a *App) handleAdminGetRBAC(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT role, config, updated_at FROM rbac_config ORDER BY role`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var role string
		var config json.RawMessage
		var updated time.Time
		_ = rows.Scan(&role, &config, &updated)
		items = append(items, map[string]any{
			"role":      role,
			"config":    config,
			"updatedAt": updated.Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminPutRBAC(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(chi.URLParam(r, "role"))
	allowedRole := map[string]bool{"SUPER_ADMIN": true, "MANAGEMENT": true, "OPERATOR": true, "DISTRIBUTOR": true}
	if !allowedRole[role] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid role")
		return
	}
	var config json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if len(config) == 0 {
		config = json.RawMessage(`{}`)
	}
	if _, err := a.db.Exec(r.Context(), `
    INSERT INTO rbac_config (role, config, updated_at)
    VALUES ($1,$2,now())
    ON CONFLICT (role) DO UPDATE SET config=EXCLUDED.config, updated_at=now()
  `, role, config); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: thresholds ----------

func (a *App) handleAdminListThresholds(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT t.id, t.warehouse_id, w.name, t.cement_type, t.min_stock, t.safety_stock, t.warning_level, t.critical_level, t.lead_time_days, t.updated_at
    FROM threshold_settings t
    JOIN warehouses w ON w.id = t.warehouse_id
    ORDER BY w.id, t.cement_type
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, warehouseID int64
		var warehouseName, cementType string
		var minStock, safetyStock, warning, critical float64
		var lead int
		var updated time.Time
		_ = rows.Scan(&id, &warehouseID, &warehouseName, &cementType, &minStock, &safetyStock, &warning, &critical, &lead, &updated)
		items = append(items, map[string]any{
			"id":            fmt.Sprintf("%d", id),
			"warehouseId":   fmt.Sprintf("%d", warehouseID),
			"warehouseName": warehouseName,
			"product":       cementType,
			"minStock":      minStock,
			"safetyStock":   safetyStock,
			"warningLevel":  warning,
			"criticalLevel": critical,
			"leadTimeDays":  lead,
			"updatedAt":     updated.Format("2006-01-02 15:04"),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminUpdateThreshold(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	u, _ := r.Context().Value(ctxUserKey).(User)
	var body struct {
		MinStock      float64 `json:"minStock"`
		SafetyStock   float64 `json:"safetyStock"`
		WarningLevel  float64 `json:"warningLevel"`
		CriticalLevel float64 `json:"criticalLevel"`
		LeadTimeDays  int     `json:"leadTimeDays"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if body.MinStock < 0 || body.SafetyStock < 0 || body.WarningLevel < 0 || body.CriticalLevel < 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "threshold values must be >= 0")
		return
	}
	if body.CriticalLevel > body.WarningLevel || body.WarningLevel > body.MinStock || body.MinStock > body.SafetyStock {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid thresholds order: ensure Critical <= Warning <= Min <= Safety")
		return
	}
	if body.LeadTimeDays <= 0 {
		body.LeadTimeDays = 3
	}
	tag, err := a.db.Exec(r.Context(), `
    UPDATE threshold_settings
    SET min_stock=$1, safety_stock=$2, warning_level=$3, critical_level=$4, lead_time_days=$5, updated_at=now()
    WHERE id=$6
  `, body.MinStock, body.SafetyStock, body.WarningLevel, body.CriticalLevel, body.LeadTimeDays, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "threshold not found")
		return
	}

	a.insertAuditLog(r, &u, "THRESHOLD_UPDATED", "threshold_settings", fmt.Sprintf("%d", id), map[string]any{
		"minStock":      body.MinStock,
		"safetyStock":   body.SafetyStock,
		"warningLevel":  body.WarningLevel,
		"criticalLevel": body.CriticalLevel,
		"leadTimeDays":  body.LeadTimeDays,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: alerts ----------

func (a *App) handleAdminListAlerts(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT id, name, description, enabled, severity, recipients_roles, recipients_users, channels, params
    FROM alert_configs
    ORDER BY id
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, description, severity string
		var enabled bool
		var roles []string
		var users []int64
		var channels json.RawMessage
		var params json.RawMessage
		_ = rows.Scan(&id, &name, &description, &enabled, &severity, &roles, &users, &channels, &params)
		userIDs := make([]string, 0, len(users))
		for _, uid := range users {
			userIDs = append(userIDs, fmt.Sprintf("%d", uid))
		}
		items = append(items, map[string]any{
			"id":          fmt.Sprintf("%d", id),
			"name":        name,
			"description": description,
			"enabled":     enabled,
			"severity":    severity,
			"recipients": map[string]any{
				"roles": roles,
				"users": userIDs,
			},
			"channels": channels,
			"params":   params,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type adminAlertRecipients struct {
	Roles []string `json:"roles"`
	Users []string `json:"users"`
}

type adminAlertItem struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Enabled     bool                 `json:"enabled"`
	Severity    string               `json:"severity"`
	Recipients  adminAlertRecipients `json:"recipients"`
	Channels    map[string]bool      `json:"channels"`
	Params      map[string]any       `json:"params"`
}

func (a *App) handleAdminPutAlerts(w http.ResponseWriter, r *http.Request) {
	u, _ := r.Context().Value(ctxUserKey).(User)
	var body struct {
		Items []adminAlertItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	allowedRole := map[string]bool{"SUPER_ADMIN": true, "MANAGEMENT": true, "OPERATOR": true, "DISTRIBUTOR": true}
	allowedSeverity := map[string]bool{"Low": true, "Medium": true, "High": true}

	for _, item := range body.Items {
		id, err := strconv.ParseInt(item.ID, 10, 64)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid alert id")
			return
		}
		if id <= 0 {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid alert id")
			return
		}
		if strings.TrimSpace(item.Name) == "" {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "alert name is required")
			return
		}
		if !allowedSeverity[item.Severity] {
			writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid severity")
			return
		}
		for _, role := range item.Recipients.Roles {
			if !allowedRole[role] {
				writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid recipient role")
				return
			}
		}

		userIDs := make([]int64, 0, len(item.Recipients.Users))
		for _, s := range item.Recipients.Users {
			if v, err := strconv.ParseInt(s, 10, 64); err == nil {
				userIDs = append(userIDs, v)
			}
		}
		if len(userIDs) > 0 {
			var okCount int
			_ = a.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM users WHERE id = ANY($1::bigint[])`, userIDs).Scan(&okCount)
			if okCount != len(userIDs) {
				writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "one or more recipient users not found")
				return
			}
		}

		channels := map[string]bool{"inApp": true, "email": false}
		if item.Channels != nil {
			if v, ok := item.Channels["inApp"]; ok {
				channels["inApp"] = v
			}
			if v, ok := item.Channels["email"]; ok {
				channels["email"] = v
			}
		}
		chBytes, _ := json.Marshal(channels)
		paramBytes, _ := json.Marshal(item.Params)
		_, err = a.db.Exec(r.Context(), `
		INSERT INTO alert_configs (id, name, description, enabled, severity, recipients_roles, recipients_users, channels, params, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,now())
		ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name,
			description=EXCLUDED.description,
			enabled=EXCLUDED.enabled,
			severity=EXCLUDED.severity,
			recipients_roles=EXCLUDED.recipients_roles,
			recipients_users=EXCLUDED.recipients_users,
			channels=EXCLUDED.channels,
			params=EXCLUDED.params,
			updated_at=now()
	`, id, item.Name, item.Description, item.Enabled, item.Severity, item.Recipients.Roles, userIDs, chBytes, paramBytes)
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
			return
		}

		a.insertAuditLog(r, &u, "ALERT_CONFIG_UPDATED", "alert_configs", fmt.Sprintf("%d", id), map[string]any{
			"name":       item.Name,
			"enabled":    item.Enabled,
			"severity":   item.Severity,
			"rolesCount": len(item.Recipients.Roles),
			"usersCount": len(userIDs),
			"channels":   channels,
			"paramsKeys": func() []string {
				keys := []string{}
				for k := range item.Params {
					keys = append(keys, k)
				}
				return keys
			}(),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: audit logs ----------

func (a *App) handleAdminListAuditLogs(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
    SELECT l.id, l.ts, l.actor_user_id, COALESCE(u.name,''), l.action, l.entity_type, l.entity_id, l.metadata, l.ip
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.ts DESC
    LIMIT 200
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var ts time.Time
		var actorID sql.NullInt64
		var actorName, action, entityType, entityID, ip string
		var metadata json.RawMessage
		_ = rows.Scan(&id, &ts, &actorID, &actorName, &action, &entityType, &entityID, &metadata, &ip)
		actor := ""
		if actorID.Valid {
			actor = fmt.Sprintf("%d", actorID.Int64)
		}
		items = append(items, map[string]any{
			"id":         fmt.Sprintf("%d", id),
			"ts":         ts.Format(time.RFC3339),
			"actorId":    actor,
			"actorName":  actorName,
			"action":     action,
			"entityType": entityType,
			"entityId":   entityID,
			"metadata":   metadata,
			"ip":         ip,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// ---------- admin: plants CRUD ----------

func (a *App) handleAdminListPlants(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng FROM plants ORDER BY id`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var lat, lng float64
		_ = rows.Scan(&id, &name, &lat, &lng)
		items = append(items, map[string]any{"id": fmt.Sprintf("%d", id), "name": name, "lat": lat, "lng": lng})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreatePlant(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string  `json:"name"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	var id int64
	if err := a.db.QueryRow(r.Context(), `INSERT INTO plants (name, lat, lng) VALUES ($1,$2,$3) RETURNING id`, body.Name, body.Lat, body.Lng).Scan(&id); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": fmt.Sprintf("%d", id)})
}

func (a *App) handleAdminUpdatePlant(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name string  `json:"name"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	tag, err := a.db.Exec(r.Context(), `UPDATE plants SET name=$1, lat=$2, lng=$3 WHERE id=$4`, body.Name, body.Lat, body.Lng, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "plant not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeletePlant(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM plants WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "plant not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- admin: warehouses CRUD ----------

func (a *App) handleAdminListWarehouses(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, lat, lng, capacity_tons FROM warehouses ORDER BY id`)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var lat, lng, cap float64
		_ = rows.Scan(&id, &name, &lat, &lng, &cap)
		items = append(items, map[string]any{"id": fmt.Sprintf("%d", id), "name": name, "lat": lat, "lng": lng, "capacityTons": cap})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleAdminCreateWarehouse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string  `json:"name"`
		Lat          float64 `json:"lat"`
		Lng          float64 `json:"lng"`
		CapacityTons float64 `json:"capacityTons"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	var id int64
	if err := a.db.QueryRow(r.Context(), `INSERT INTO warehouses (name, lat, lng, capacity_tons) VALUES ($1,$2,$3,$4) RETURNING id`, body.Name, body.Lat, body.Lng, body.CapacityTons).Scan(&id); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": fmt.Sprintf("%d", id)})
}

func (a *App) handleAdminUpdateWarehouse(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	var body struct {
		Name         string  `json:"name"`
		Lat          float64 `json:"lat"`
		Lng          float64 `json:"lng"`
		CapacityTons float64 `json:"capacityTons"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "name required")
		return
	}
	tag, err := a.db.Exec(r.Context(), `UPDATE warehouses SET name=$1, lat=$2, lng=$3, capacity_tons=$4 WHERE id=$5`, body.Name, body.Lat, body.Lng, body.CapacityTons, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "warehouse not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *App) handleAdminDeleteWarehouse(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM warehouses WHERE id=$1`, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "warehouse not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- distributor portal ----------

func (a *App) requireDistributorID(w http.ResponseWriter, r *http.Request) (*User, int64, bool) {
	u, ok := r.Context().Value(ctxUserKey).(User)
	if !ok {
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return nil, 0, false
	}
	if u.DistributorID == nil || *u.DistributorID == 0 {
		writeAPIError(w, http.StatusForbidden, "FORBIDDEN", "distributorId not set for this user")
		return &u, 0, false
	}
	return &u, *u.DistributorID, true
}

func (a *App) handleDistributorInventory(w http.ResponseWriter, r *http.Request) {
	_, distributorID, ok := a.requireDistributorID(w, r)
	if !ok {
		return
	}

	var dname string
	if err := a.db.QueryRow(r.Context(), `SELECT name FROM distributors WHERE id=$1`, distributorID).Scan(&dname); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "distributor not found")
		return
	}

	byType := []map[string]any{}
	rows, err := a.db.Query(r.Context(), `
    SELECT cement_type, COALESCE(SUM(quantity_tons),0) AS delivered
    FROM shipments
    WHERE to_distributor_id=$1 AND status='COMPLETED'
    GROUP BY cement_type
    ORDER BY cement_type
  `, distributorID)
	if err == nil {
		for rows.Next() {
			var ct string
			var delivered float64
			_ = rows.Scan(&ct, &delivered)
			byType = append(byType, map[string]any{"cementType": ct, "deliveredTons": delivered})
		}
		rows.Close()
	}

	var deliveredTotal float64
	_ = a.db.QueryRow(r.Context(), `
    SELECT COALESCE(SUM(quantity_tons),0)
    FROM shipments
    WHERE to_distributor_id=$1 AND status='COMPLETED'
  `, distributorID).Scan(&deliveredTotal)

	var soldTotal float64
	_ = a.db.QueryRow(r.Context(), `
    SELECT COALESCE(SUM(quantity_tons),0)
    FROM sales_orders
    WHERE distributor_id=$1
  `, distributorID).Scan(&soldTotal)

	estimatedOnHand := deliveredTotal - soldTotal

	recentShipments := []map[string]any{}
	srows, err := a.db.Query(r.Context(), `
    SELECT s.id, s.status, s.cement_type, s.quantity_tons, s.depart_at, s.arrive_eta, s.eta_minutes,
           s.last_lat, s.last_lng, s.last_update,
           w.id, w.name
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    WHERE s.to_distributor_id=$1
    ORDER BY s.id DESC
    LIMIT 20
  `, distributorID)
	if err == nil {
		for srows.Next() {
			var id int64
			var status, ct string
			var qty float64
			var departAt, arriveEta *time.Time
			var etaMinutes int
			var lastLat, lastLng *float64
			var lastUpdate *time.Time
			var wid int64
			var wname string
			_ = srows.Scan(&id, &status, &ct, &qty, &departAt, &arriveEta, &etaMinutes, &lastLat, &lastLng, &lastUpdate, &wid, &wname)
			recentShipments = append(recentShipments, map[string]any{
				"id":            id,
				"status":        status,
				"cementType":    ct,
				"quantityTons":  qty,
				"departAt":      departAt,
				"arriveEta":     arriveEta,
				"etaMinutes":    etaMinutes,
				"truck":         map[string]any{"lastLat": lastLat, "lastLng": lastLng, "lastUpdate": lastUpdate},
				"fromWarehouse": map[string]any{"id": wid, "name": wname},
			})
		}
		srows.Close()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"distributor": map[string]any{"id": distributorID, "name": dname},
		"totals": map[string]any{
			"deliveredTons":       deliveredTotal,
			"soldTons":            soldTotal,
			"estimatedOnHandTons": estimatedOnHand,
			"note":                "Inventory distributor dihitung estimasi: total shipment COMPLETED - total sales_orders.",
		},
		"deliveredByCementType": byType,
		"recentShipments":       recentShipments,
	})
}

func (a *App) handleDistributorOrders(w http.ResponseWriter, r *http.Request) {
	_, distributorID, ok := a.requireDistributorID(w, r)
	if !ok {
		return
	}

	status := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("status")))
	where := "WHERE o.distributor_id=$1"
	args := []any{distributorID}
	if status != "" {
		where += " AND o.status=$2"
		args = append(args, status)
	}

	q := fmt.Sprintf(`
    SELECT o.id, o.cement_type, o.quantity_tons, o.status, o.requested_at,
           o.decided_at, o.decided_by_user_id, o.decision_reason, o.approved_shipment_id
    FROM order_requests o
    %s
    ORDER BY o.requested_at DESC, o.id DESC
    LIMIT 200
  `, where)

	rows, err := a.db.Query(r.Context(), q, args...)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var ct, st, reason string
		var qty float64
		var requested time.Time
		var decided *time.Time
		var decidedBy *int64
		var approvedShipment *int64
		_ = rows.Scan(&id, &ct, &qty, &st, &requested, &decided, &decidedBy, &reason, &approvedShipment)
		items = append(items, map[string]any{
			"id":                 id,
			"status":             st,
			"requestedAt":        requested,
			"decidedAt":          decided,
			"decidedBy":          decidedBy,
			"decisionReason":     reason,
			"approvedShipmentId": approvedShipment,
			"cementType":         ct,
			"quantityTons":       qty,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleDistributorCreateOrder(w http.ResponseWriter, r *http.Request) {
	u, distributorID, ok := a.requireDistributorID(w, r)
	if !ok {
		return
	}

	var body struct {
		CementType   string  `json:"cementType"`
		QuantityTons float64 `json:"quantityTons"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid json")
		return
	}
	body.CementType = strings.TrimSpace(body.CementType)
	if body.CementType == "" {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "cementType required")
		return
	}
	if body.QuantityTons <= 0 {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "quantityTons must be > 0")
		return
	}

	var id int64
	var requestedAt time.Time
	if err := a.db.QueryRow(r.Context(), `
    INSERT INTO order_requests (distributor_id, cement_type, quantity_tons, status, requested_at, updated_at)
    VALUES ($1,$2,$3,'PENDING', now(), now())
    RETURNING id, requested_at
  `, distributorID, body.CementType, body.QuantityTons).Scan(&id, &requestedAt); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	a.insertAuditLog(r, u, "DISTRIBUTOR_ORDER_CREATED", "order_requests", fmt.Sprintf("%d", id), map[string]any{"distributorId": distributorID, "cementType": body.CementType, "quantityTons": body.QuantityTons})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "requestedAt": requestedAt})
}

func (a *App) handleDistributorShipments(w http.ResponseWriter, r *http.Request) {
	_, distributorID, ok := a.requireDistributorID(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(strings.ToUpper(r.URL.Query().Get("status")))
	where := "WHERE s.to_distributor_id=$1"
	args := []any{distributorID}
	if status != "" {
		where += " AND s.status=$2"
		args = append(args, status)
	}
	q := fmt.Sprintf(`
    SELECT s.id, s.status, s.cement_type, s.quantity_tons, s.depart_at, s.arrive_eta, s.eta_minutes,
           s.last_lat, s.last_lng, s.last_update,
           w.id, w.name
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    %s
    ORDER BY s.id DESC
    LIMIT 200
  `, where)
	rows, err := a.db.Query(r.Context(), q, args...)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, wid int64
		var status, ct, wname string
		var qty float64
		var departAt, arriveEta *time.Time
		var etaMinutes int
		var lastLat, lastLng *float64
		var lastUpdate *time.Time
		_ = rows.Scan(&id, &status, &ct, &qty, &departAt, &arriveEta, &etaMinutes, &lastLat, &lastLng, &lastUpdate, &wid, &wname)
		items = append(items, map[string]any{
			"id":            id,
			"status":        status,
			"cementType":    ct,
			"quantityTons":  qty,
			"departAt":      departAt,
			"arriveEta":     arriveEta,
			"etaMinutes":    etaMinutes,
			"truck":         map[string]any{"lastLat": lastLat, "lastLng": lastLng, "lastUpdate": lastUpdate},
			"fromWarehouse": map[string]any{"id": wid, "name": wname},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *App) handleDistributorTransactions(w http.ResponseWriter, r *http.Request) {
	_, distributorID, ok := a.requireDistributorID(w, r)
	if !ok {
		return
	}
	rows, err := a.db.Query(r.Context(), `
    SELECT id, order_date, quantity_tons, total_price
    FROM sales_orders
    WHERE distributor_id=$1
    ORDER BY order_date DESC, id DESC
    LIMIT 200
  `, distributorID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var orderDate time.Time
		var qty, total float64
		_ = rows.Scan(&id, &orderDate, &qty, &total)
		items = append(items, map[string]any{"id": id, "orderDate": orderDate, "quantityTons": qty, "totalPrice": total})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// ---------- math utils ----------
func haversineKM(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := deg2rad(lat2 - lat1)
	dLng := deg2rad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(deg2rad(lat1))*math.Cos(deg2rad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func deg2rad(d float64) float64 { return d * 0.017453292519943295 }
func fmtFloat(v float64) string {
	s := strconv.FormatFloat(v, 'f', 1, 64)
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}
