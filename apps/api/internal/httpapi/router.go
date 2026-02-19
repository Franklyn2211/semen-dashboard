package httpapi

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cementops/api/internal/config"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
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

			pr.With(app.requireRole("ADMIN", "OPS", "EXEC")).Route("/planning", func(pl chi.Router) {
				pl.Get("/heatmap", app.handlePlanningHeatmap)
				pl.Get("/site-profile", app.handlePlanningSiteProfile)
				pl.Get("/whitespace", app.handlePlanningWhitespace)
				pl.Get("/catchment", app.handlePlanningCatchment)
			})

			pr.With(app.requireRole("ADMIN", "OPS")).Route("/ops", func(op chi.Router) {
				op.Get("/logistics/map", app.handleOpsLogisticsMap)
				op.Get("/stock", app.handleOpsStock)
				op.Get("/prediction/reorder", app.handleOpsPredictionReorder)
				op.Get("/shipments", app.handleOpsShipments)
				op.Get("/shipments/{id}", app.handleOpsShipmentDetail)
				op.Patch("/shipments/{id}/status", app.handleOpsUpdateShipmentStatus)
			})

			pr.With(app.requireRole("ADMIN")).Route("/admin", func(ad chi.Router) {
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

			pr.With(app.requireRole("ADMIN", "EXEC")).Route("/exec", func(ex chi.Router) {
				ex.Get("/target-vs-actual", app.handleExecTargetVsActual)
				ex.Get("/competitor/map", app.handleExecCompetitorMap)
				ex.Get("/partners/performance", app.handleExecPartnersPerformance)
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
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
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
		var expiresAt time.Time
		row := a.db.QueryRow(r.Context(), `
      SELECT u.id, u.name, u.email, u.role, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
    `, sid)
		if err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &expiresAt); err != nil {
			writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "session not found")
			return
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

	writeJSON(w, http.StatusOK, map[string]any{
		"plant":        plant,
		"warehouses":   warehouses,
		"distributors": distributors,
		"routes":       routes,
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

func (a *App) handleOpsPredictionReorder(w http.ResponseWriter, r *http.Request) {
	// Simple demo heuristic based on last 30 days orders.
	rows, err := a.db.Query(r.Context(), `
    SELECT d.id, d.name,
      COALESCE(SUM(o.quantity_tons) FILTER (WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS qty_30d,
      MAX(o.order_date) AS last_order
    FROM distributors d
    LEFT JOIN sales_orders o ON o.distributor_id = d.id
    GROUP BY d.id, d.name
    ORDER BY d.id
  `)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	now := time.Now()
	for rows.Next() {
		var id int64
		var name string
		var qty30 float64
		var lastOrder *time.Time
		_ = rows.Scan(&id, &name, &qty30, &lastOrder)
		days := 999.0
		if lastOrder != nil {
			days = now.Sub(lastOrder.UTC()).Hours() / 24
		}

		urgency := "LOW"
		if qty30 > 1200 || days > 25 {
			urgency = "HIGH"
		} else if qty30 > 700 || days > 14 {
			urgency = "MED"
		}

		recommended := 80.0
		if urgency == "HIGH" {
			recommended = 180
		} else if urgency == "MED" {
			recommended = 120
		}

		out = append(out, map[string]any{
			"distributorId":           id,
			"distributorName":         name,
			"qtyLast30Days":           qty30,
			"lastOrderDate":           lastOrder,
			"urgency":                 urgency,
			"recommendedQuantityTons": recommended,
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
    SELECT s.id, s.status, s.depart_at, s.arrive_eta, s.last_lat, s.last_lng, s.last_update,
           w.id, w.name, d.id, d.name
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
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
		var depart, eta *time.Time
		var lastLat, lastLng *float64
		var lastUpdate *time.Time
		var wid, did int64
		var wname, dname string
		_ = rows.Scan(&id, &status, &depart, &eta, &lastLat, &lastLng, &lastUpdate, &wid, &wname, &did, &dname)
		items = append(items, map[string]any{
			"id":            id,
			"status":        status,
			"departAt":      depart,
			"arriveEta":     eta,
			"lastLat":       lastLat,
			"lastLng":       lastLng,
			"lastUpdate":    lastUpdate,
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
    SELECT s.id, s.status, s.depart_at, s.arrive_eta, s.last_lat, s.last_lng, s.last_update,
           w.id, w.name, w.lat, w.lng,
           d.id, d.name, d.lat, d.lng
    FROM shipments s
    JOIN warehouses w ON w.id = s.from_warehouse_id
    JOIN distributors d ON d.id = s.to_distributor_id
    WHERE s.id = $1
  `, id)
	var status string
	var depart, eta *time.Time
	var lastLat, lastLng *float64
	var lastUpdate *time.Time
	var wid, did int64
	var wname, dname string
	var wlat, wlng, dlat, dlng float64
	if err := row.Scan(&id, &status, &depart, &eta, &lastLat, &lastLng, &lastUpdate, &wid, &wname, &wlat, &wlng, &did, &dname, &dlat, &dlng); err != nil {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "shipment not found")
		return
	}

	// Update truck position for in-transit shipments.
	if status == "IN_TRANSIT" && depart != nil && eta != nil {
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
		_, _ = a.db.Exec(r.Context(), `UPDATE shipments SET last_lat=$1, last_lng=$2, last_update=$3 WHERE id=$4`, ll, lg, u, id)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":            id,
		"status":        status,
		"departAt":      depart,
		"arriveEta":     eta,
		"truck":         map[string]any{"lastLat": lastLat, "lastLng": lastLng, "lastUpdate": lastUpdate},
		"fromWarehouse": map[string]any{"id": wid, "name": wname, "lat": wlat, "lng": wlng},
		"toDistributor": map[string]any{"id": did, "name": dname, "lat": dlat, "lng": dlng},
	})
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
	allowed := map[string]bool{"PLANNED": true, "IN_TRANSIT": true, "DELIVERED": true, "CANCELLED": true}
	if !allowed[body.Status] {
		writeAPIError(w, http.StatusBadRequest, "BAD_REQUEST", "status must be PLANNED|IN_TRANSIT|DELIVERED|CANCELLED")
		return
	}
	tag, err := a.db.Exec(r.Context(), `UPDATE shipments SET status=$1 WHERE id=$2`, body.Status, id)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "INTERNAL", "db error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "NOT_FOUND", "shipment not found")
		return
	}
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
