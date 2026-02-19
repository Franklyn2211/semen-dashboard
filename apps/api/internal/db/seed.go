package db

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Seed(ctx context.Context, pool *pgxpool.Pool) error {
	// Idempotent: we use fixed IDs + ON CONFLICT DO NOTHING.
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Users
	adminHash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	opsHash, _ := bcrypt.GenerateFromPassword([]byte("ops123"), bcrypt.DefaultCost)
	execHash, _ := bcrypt.GenerateFromPassword([]byte("exec123"), bcrypt.DefaultCost)

	if _, err := tx.Exec(ctx, `
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      (1, 'Admin', 'admin@cementops.local', $1, 'ADMIN'),
      (2, 'Ops',   'ops@cementops.local',   $2, 'OPS'),
      (3, 'Exec',  'exec@cementops.local',  $3, 'EXEC')
    ON CONFLICT (id) DO NOTHING
  `, string(adminHash), string(opsHash), string(execHash)); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}

	// Plant
	if _, err := tx.Exec(ctx, `
    INSERT INTO plants (id, name, lat, lng)
    VALUES (1, 'CementOps Plant - Cikarang', -6.3145, 107.1425)
    ON CONFLICT (id) DO NOTHING
  `); err != nil {
		return fmt.Errorf("seed plant: %w", err)
	}

	// Warehouses
	type point struct{ lat, lng float64 }
	warehouses := []struct {
		id       int
		name     string
		p        point
		capacity float64
	}{
		{1, "WH Jakarta Timur", point{-6.2250, 106.9000}, 20000},
		{2, "WH Bekasi", point{-6.2600, 107.0000}, 15000},
		{3, "WH Karawang", point{-6.3050, 107.2800}, 18000},
	}
	for _, w := range warehouses {
		if _, err := tx.Exec(ctx, `
      INSERT INTO warehouses (id, name, lat, lng, capacity_tons)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO NOTHING
    `, w.id, w.name, w.p.lat, w.p.lng, w.capacity); err != nil {
			return fmt.Errorf("seed warehouses: %w", err)
		}
	}

	// Distributors
	distributors := []struct {
		id     int
		name   string
		p      point
		radius float64
	}{
		{1, "PT Makmur Jaya", point{-6.2100, 106.8200}, 12},
		{2, "CV Bangun Abadi", point{-6.1700, 106.8800}, 10},
		{3, "UD Sumber Rejeki", point{-6.2600, 106.7800}, 14},
		{4, "PT Beton Sentosa", point{-6.3000, 106.9500}, 11},
		{5, "CV Mitra Semen", point{-6.3200, 107.0500}, 13},
		{6, "PT Nusantara Logistik", point{-6.2200, 107.0600}, 15},
		{7, "UD Karya Mandiri", point{-6.3600, 107.1600}, 12},
		{8, "CV Roda Niaga", point{-6.1300, 106.7600}, 10},
	}
	for _, d := range distributors {
		if _, err := tx.Exec(ctx, `
      INSERT INTO distributors (id, name, lat, lng, service_radius_km)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO NOTHING
    `, d.id, d.name, d.p.lat, d.p.lng, d.radius); err != nil {
			return fmt.Errorf("seed distributors: %w", err)
		}
	}

	// Stores + competitor presence
	rng := rand.New(rand.NewSource(42))
	storeCenter := point{-6.2500, 106.9000}
	for i := 1; i <= 30; i++ {
		lat := storeCenter.lat + (rng.Float64()-0.5)*0.35
		lng := storeCenter.lng + (rng.Float64()-0.5)*0.45
		if _, err := tx.Exec(ctx, `
      INSERT INTO stores (id, name, lat, lng)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (id) DO NOTHING
    `, i, fmt.Sprintf("Toko Bangunan %02d", i), lat, lng); err != nil {
			return fmt.Errorf("seed stores: %w", err)
		}

		our := 30 + rng.Float64()*50
		comp := math.Max(0, 100-our+rng.Float64()*10-5)
		if _, err := tx.Exec(ctx, `
      INSERT INTO competitor_presence (store_id, our_share_pct, competitor_share_pct)
      VALUES ($1,$2,$3)
      ON CONFLICT (store_id) DO NOTHING
    `, i, our, comp); err != nil {
			return fmt.Errorf("seed competitor_presence: %w", err)
		}
	}

	// Projects
	now := time.Now()
	for i := 1; i <= 40; i++ {
		lat := storeCenter.lat + (rng.Float64()-0.5)*0.45
		lng := storeCenter.lng + (rng.Float64()-0.5)*0.55
		demand := 50 + rng.Float64()*450
		start := now.AddDate(0, -rng.Intn(3), -rng.Intn(20))
		end := start.AddDate(0, 2+rng.Intn(4), rng.Intn(20))
		typ := []string{"Residential", "Commercial", "Infrastructure"}[rng.Intn(3)]
		if _, err := tx.Exec(ctx, `
      INSERT INTO projects (id, name, type, lat, lng, start_date, end_date, demand_tons_month)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
    `,
			i,
			fmt.Sprintf("Project %02d", i),
			typ,
			lat,
			lng,
			start.Format("2006-01-02"),
			end.Format("2006-01-02"),
			demand,
		); err != nil {
			return fmt.Errorf("seed projects: %w", err)
		}
	}

	// Stock levels
	cementTypes := []string{"OPC", "PPC", "SRC"}
	stockID := 1
	for _, w := range warehouses {
		for _, ct := range cementTypes {
			qty := 3000 + rng.Float64()*5000
			if _, err := tx.Exec(ctx, `
        INSERT INTO stock_levels (id, warehouse_id, cement_type, quantity_tons)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (warehouse_id, cement_type) DO NOTHING
      `, stockID, w.id, ct, qty); err != nil {
				return fmt.Errorf("seed stock_levels: %w", err)
			}
			stockID++
		}
	}

	// Road segments (as points)
	for i := 1; i <= 24; i++ {
		lat := storeCenter.lat + (rng.Float64()-0.5)*0.50
		lng := storeCenter.lng + (rng.Float64()-0.5)*0.60
		width := 3.5 + rng.Float64()*5.5
		kind := []string{"arterial", "collector", "local"}[rng.Intn(3)]
		if _, err := tx.Exec(ctx, `
      INSERT INTO road_segments (id, name, kind, width_m, lat, lng)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING
    `, i, fmt.Sprintf("Road %02d", i), kind, width, lat, lng); err != nil {
			return fmt.Errorf("seed road_segments: %w", err)
		}
	}

	// Shipments
	shipNow := time.Now().UTC()
	for i := 1; i <= 14; i++ {
		wh := warehouses[rng.Intn(len(warehouses))]
		dist := distributors[rng.Intn(len(distributors))]
		status := "PLANNED"
		var depart *time.Time
		var eta *time.Time
		var lastLat *float64
		var lastLng *float64
		var lastUpdate *time.Time

		switch {
		case i <= 8:
			status = "IN_TRANSIT"
			d := shipNow.Add(-time.Duration(30+rng.Intn(180)) * time.Minute)
			e := shipNow.Add(time.Duration(60+rng.Intn(240)) * time.Minute)
			depart, eta = &d, &e
			// Interpolated position between WH and distributor.
			frac := float64(shipNow.Sub(d)) / float64(e.Sub(d))
			frac = math.Max(0, math.Min(1, frac))
			ll := wh.p.lat + (dist.p.lat-wh.p.lat)*frac
			lg := wh.p.lng + (dist.p.lng-wh.p.lng)*frac
			lastLat, lastLng = &ll, &lg
			u := shipNow
			lastUpdate = &u
		case i <= 12:
			status = "DELIVERED"
			d := shipNow.Add(-time.Duration(24+rng.Intn(48)) * time.Hour)
			e := d.Add(time.Duration(3+rng.Intn(7)) * time.Hour)
			depart, eta = &d, &e
			ll, lg := dist.p.lat, dist.p.lng
			lastLat, lastLng = &ll, &lg
			u := e
			lastUpdate = &u
		default:
			status = "PLANNED"
			d := shipNow.Add(time.Duration(2+rng.Intn(10)) * time.Hour)
			e := d.Add(time.Duration(3+rng.Intn(8)) * time.Hour)
			depart, eta = &d, &e
		}

		if _, err := tx.Exec(ctx, `
      INSERT INTO shipments (id, from_warehouse_id, to_distributor_id, status, depart_at, arrive_eta, last_lat, last_lng, last_update)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, i, wh.id, dist.id, status, depart, eta, lastLat, lastLng, lastUpdate); err != nil {
			return fmt.Errorf("seed shipments: %w", err)
		}
	}

	// Sales targets: last 3 months incl current.
	month0 := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		m := month0.AddDate(0, -i, 0)
		target := 12000 + rng.Float64()*6000
		if _, err := tx.Exec(ctx, `
      INSERT INTO sales_targets (month, target_tons)
      VALUES ($1,$2)
      ON CONFLICT (month) DO NOTHING
    `, m.Format("2006-01-02"), target); err != nil {
			return fmt.Errorf("seed sales_targets: %w", err)
		}
	}

	// Sales orders: last 90 days
	orderID := 1
	for _, d := range distributors {
		orders := 10 + rng.Intn(18)
		for j := 0; j < orders; j++ {
			dayAgo := rng.Intn(90)
			od := now.AddDate(0, 0, -dayAgo)
			qty := 20 + rng.Float64()*180
			price := qty * (950000 + rng.Float64()*250000)
			if _, err := tx.Exec(ctx, `
        INSERT INTO sales_orders (id, distributor_id, order_date, quantity_tons, total_price)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING
      `, orderID, d.id, od.Format("2006-01-02"), qty, price); err != nil {
				return fmt.Errorf("seed sales_orders: %w", err)
			}
			orderID++
		}
	}

	// Reset sequences to max(id)
	seqTables := []string{"users", "plants", "warehouses", "distributors", "stores", "projects", "stock_levels", "shipments", "sales_orders", "sales_targets", "competitor_presence", "road_segments"}
	for _, t := range seqTables {
		_, _ = tx.Exec(ctx, fmt.Sprintf(`SELECT setval(pg_get_serial_sequence('%s','id'), (SELECT COALESCE(MAX(id),1) FROM %s))`, t, t))
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}
