package db

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Seed(ctx context.Context, pool *pgxpool.Pool) error {
	// Idempotent: we use fixed IDs. For some tables we DO NOTHING, for default users we UPSERT
	// to keep dev credentials in sync even if older seeds already inserted rows.
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Users (4-role model)
	// NOTE: use upsert so dev DBs created with older seed emails/passwords can still login.
	superHash, _ := bcrypt.GenerateFromPassword([]byte("super123"), bcrypt.DefaultCost)
	mgmtHash, _ := bcrypt.GenerateFromPassword([]byte("management123"), bcrypt.DefaultCost)
	opHash, _ := bcrypt.GenerateFromPassword([]byte("operator123"), bcrypt.DefaultCost)
	distHash, _ := bcrypt.GenerateFromPassword([]byte("distributor123"), bcrypt.DefaultCost)

	// Insert/update the 4 default accounts. We set distributor_id NULL first to avoid FK issues
	// on a fresh DB before distributors are seeded; we link it after seeding distributors.
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, name, email, password_hash, role, distributor_id)
		VALUES
			(1, 'SuperAdmin',  'superadmin@cementops.local',  $1, 'SUPER_ADMIN', NULL),
			(2, 'Management',  'management@cementops.local',  $2, 'MANAGEMENT',  NULL),
			(3, 'Operator',    'operator@cementops.local',    $3, 'OPERATOR',    NULL),
			(4, 'Distributor', 'distributor@cementops.local', $4, 'DISTRIBUTOR', NULL)
		ON CONFLICT (id) DO UPDATE
		SET
			name = EXCLUDED.name,
			email = EXCLUDED.email,
			password_hash = EXCLUDED.password_hash,
			role = EXCLUDED.role,
			distributor_id = EXCLUDED.distributor_id,
			disabled_at = NULL
	`, string(superHash), string(mgmtHash), string(opHash), string(distHash)); err != nil {
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

	// Link the distributor user to distributor id=1 (created above).
	if _, err := tx.Exec(ctx, `UPDATE users SET distributor_id=1 WHERE id=4`); err != nil {
		return fmt.Errorf("seed distributor user link: %w", err)
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

	// Trucks
	// Simple demo fleet for assignments.
	for i := 1; i <= 6; i++ {
		home := warehouses[(i-1)%len(warehouses)].id
		code := fmt.Sprintf("TRK-%03d", i)
		name := fmt.Sprintf("Truck %03d", i)
		cap := 180.0
		if i%3 == 0 {
			cap = 220
		}
		if _, err := tx.Exec(ctx, `
      INSERT INTO trucks (id, code, name, capacity_tons, active, home_warehouse_id)
      VALUES ($1,$2,$3,$4,true,$5)
      ON CONFLICT (id) DO NOTHING
    `, i, code, name, cap, home); err != nil {
			return fmt.Errorf("seed trucks: %w", err)
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
		status := "SCHEDULED"
		cementType := cementTypes[rng.Intn(len(cementTypes))]
		qtyTons := 40.0 + rng.Float64()*160
		var depart *time.Time
		var eta *time.Time
		var lastLat *float64
		var lastLng *float64
		var lastUpdate *time.Time
		etaMinutes := 0
		var truckID *int

		switch {
		case i <= 8:
			status = "ON_DELIVERY"
			tid := 1 + rng.Intn(6)
			truckID = &tid
			d := shipNow.Add(-time.Duration(30+rng.Intn(180)) * time.Minute)
			e := shipNow.Add(time.Duration(60+rng.Intn(240)) * time.Minute)
			depart, eta = &d, &e
			etaMinutes = int(math.Max(0, e.Sub(shipNow).Minutes()))
			// Interpolated position between WH and distributor.
			frac := float64(shipNow.Sub(d)) / float64(e.Sub(d))
			frac = math.Max(0, math.Min(1, frac))
			ll := wh.p.lat + (dist.p.lat-wh.p.lat)*frac
			lg := wh.p.lng + (dist.p.lng-wh.p.lng)*frac
			lastLat, lastLng = &ll, &lg
			u := shipNow
			lastUpdate = &u
		case i <= 12:
			status = "COMPLETED"
			tid := 1 + rng.Intn(6)
			truckID = &tid
			d := shipNow.Add(-time.Duration(24+rng.Intn(48)) * time.Hour)
			e := d.Add(time.Duration(3+rng.Intn(7)) * time.Hour)
			depart, eta = &d, &e
			etaMinutes = 0
			ll, lg := dist.p.lat, dist.p.lng
			lastLat, lastLng = &ll, &lg
			u := e
			lastUpdate = &u
		default:
			status = "SCHEDULED"
			tid := 1 + rng.Intn(6)
			truckID = &tid
			d := shipNow.Add(time.Duration(2+rng.Intn(10)) * time.Hour)
			e := d.Add(time.Duration(3+rng.Intn(8)) * time.Hour)
			depart, eta = &d, &e
			etaMinutes = int(math.Max(0, e.Sub(shipNow).Minutes()))
		}

		if _, err := tx.Exec(ctx, `
      INSERT INTO shipments (id, from_warehouse_id, to_distributor_id, status, cement_type, quantity_tons, truck_id, depart_at, arrive_eta, eta_minutes, last_lat, last_lng, last_update)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING
		`, i, wh.id, dist.id, status, cementType, qtyTons, truckID, depart, eta, etaMinutes, lastLat, lastLng, lastUpdate); err != nil {
			return fmt.Errorf("seed shipments: %w", err)
		}
	}

	// Order requests (distributor requests)
	// Create a mix of pending/approved/fulfilled requests that tie into seeded shipments.
	// We link:
	// - Approved -> one SCHEDULED shipment
	// - Fulfilled -> one COMPLETED shipment
	approvedShipments := []int{13, 14}
	fulfilledShipments := []int{9, 10}
	orderReqID := 1
	for i, sid := range approvedShipments {
		d := distributors[i%len(distributors)]
		ct := cementTypes[rng.Intn(len(cementTypes))]
		qty := 60.0 + rng.Float64()*120
		decidedBy := int64(3) // operator
		if _, err := tx.Exec(ctx, `
      INSERT INTO order_requests (id, distributor_id, cement_type, quantity_tons, status, requested_at, decided_at, decided_by_user_id, decision_reason, approved_shipment_id)
      VALUES ($1,$2,$3,$4,'APPROVED', now() - INTERVAL '6 hours', now() - INTERVAL '5 hours', $5, 'Auto-approved from seed', $6)
      ON CONFLICT (id) DO NOTHING
    `, orderReqID, d.id, ct, qty, decidedBy, sid); err != nil {
			return fmt.Errorf("seed order_requests approved: %w", err)
		}
		_, _ = tx.Exec(ctx, `UPDATE shipments SET order_request_id=$1 WHERE id=$2`, orderReqID, sid)
		orderReqID++
	}
	for i, sid := range fulfilledShipments {
		d := distributors[(i+2)%len(distributors)]
		ct := cementTypes[rng.Intn(len(cementTypes))]
		qty := 80.0 + rng.Float64()*140
		decidedBy := int64(3) // operator
		if _, err := tx.Exec(ctx, `
      INSERT INTO order_requests (id, distributor_id, cement_type, quantity_tons, status, requested_at, decided_at, decided_by_user_id, decision_reason, approved_shipment_id)
      VALUES ($1,$2,$3,$4,'FULFILLED', now() - INTERVAL '4 days', now() - INTERVAL '4 days' + INTERVAL '1 hour', $5, 'Delivered', $6)
      ON CONFLICT (id) DO NOTHING
    `, orderReqID, d.id, ct, qty, decidedBy, sid); err != nil {
			return fmt.Errorf("seed order_requests fulfilled: %w", err)
		}
		_, _ = tx.Exec(ctx, `UPDATE shipments SET order_request_id=$1 WHERE id=$2`, orderReqID, sid)
		orderReqID++
	}
	// Pending requests
	for i := 0; i < 6; i++ {
		d := distributors[(i+1)%len(distributors)]
		ct := cementTypes[rng.Intn(len(cementTypes))]
		qty := 50.0 + rng.Float64()*180
		if _, err := tx.Exec(ctx, `
      INSERT INTO order_requests (id, distributor_id, cement_type, quantity_tons, status, requested_at)
      VALUES ($1,$2,$3,$4,'PENDING', now() - (($5::text) || ' hours')::interval)
      ON CONFLICT (id) DO NOTHING
    `, orderReqID, d.id, ct, qty, fmt.Sprintf("%d", 2+i)); err != nil {
			return fmt.Errorf("seed order_requests pending: %w", err)
		}
		orderReqID++
	}

	// Inventory movements (simple history)
	moveID := 1
	for _, w := range warehouses {
		for _, ct := range cementTypes {
			// Inbound
			inQty := 300.0 + rng.Float64()*800
			if _, err := tx.Exec(ctx, `
			INSERT INTO inventory_movements (id, ts, actor_user_id, warehouse_id, cement_type, movement_type, quantity_tons, reason, ref_type, ref_id, metadata)
			VALUES ($1, now() - INTERVAL '3 days', 3, $2, $3, 'IN', $4, 'Weekly replenishment', 'system', '', '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
      `, moveID, w.id, ct, inQty); err != nil {
				return fmt.Errorf("seed inventory_movements in: %w", err)
			}
			moveID++
			// Adjustment
			adj := -10.0 + rng.Float64()*20
			if _, err := tx.Exec(ctx, `
			INSERT INTO inventory_movements (id, ts, actor_user_id, warehouse_id, cement_type, movement_type, quantity_tons, reason, ref_type, ref_id, metadata)
			VALUES ($1, now() - INTERVAL '1 days', 3, $2, $3, 'ADJUST', $4, 'Cycle count', 'stock_levels', '', '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
      `, moveID, w.id, ct, adj); err != nil {
				return fmt.Errorf("seed inventory_movements adjust: %w", err)
			}
			moveID++
		}
	}

	// Audit logs (activity + order audit)
	for i := 1; i <= 30; i++ {
		actions := []string{"ORDER_REQUEST_CREATED", "ORDER_APPROVED", "ORDER_REJECTED", "SHIPMENT_STATUS_UPDATED", "STOCK_ADJUSTMENT"}
		action := actions[rng.Intn(len(actions))]
		actor := int64([]int{1, 2, 3}[rng.Intn(3)])
		entityType := "system"
		entityID := fmt.Sprintf("%d", i)
		if strings.HasPrefix(action, "ORDER_") {
			entityType = "order_request"
			entityID = fmt.Sprintf("%d", 1+rng.Intn(orderReqID-1))
		} else if strings.HasPrefix(action, "SHIPMENT_") {
			entityType = "shipment"
			entityID = fmt.Sprintf("%d", 1+rng.Intn(14))
		}
		if _, err := tx.Exec(ctx, `
      INSERT INTO audit_logs (id, ts, actor_user_id, action, entity_type, entity_id, metadata, ip)
		VALUES ($1, now() - (($2::text) || ' hours')::interval, $3, $4, $5, $6, '{}'::jsonb, '')
      ON CONFLICT (id) DO NOTHING
		`, i, fmt.Sprintf("%d", 2+rng.Intn(240)), actor, action, entityType, entityID); err != nil {
			return fmt.Errorf("seed audit_logs: %w", err)
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

	// RBAC config (stored in DB, used by Administration UI)
	// Keep JSON compact; UI can render/edit it.
	if _, err := tx.Exec(ctx, `
    INSERT INTO rbac_config (role, config)
    VALUES
      ('SUPER_ADMIN', '{"permissions":{"Planning":{"view":true,"create":true,"edit":true,"delete":true},"Operations":{"view":true,"create":true,"edit":true,"delete":true},"Executive":{"view":true,"create":true,"edit":true,"delete":true},"Administration":{"view":true,"create":true,"edit":true,"delete":true}},"sidebar":["Dashboard","Planning","Operations","Executive","Administration"]}'::jsonb),
	  ('MANAGEMENT',  '{"permissions":{"Planning":{"view":true,"create":false,"edit":false,"delete":false},"Operations":{"view":true,"create":false,"edit":false,"delete":false},"Executive":{"view":true,"create":false,"edit":false,"delete":false},"Administration":{"view":false,"create":false,"edit":false,"delete":false}},"sidebar":["Dashboard","Planning","Operations","Executive"]}'::jsonb),
	  ('OPERATOR',    '{"permissions":{"Planning":{"view":false,"create":false,"edit":false,"delete":false},"Operations":{"view":true,"create":true,"edit":true,"delete":false},"Executive":{"view":false,"create":false,"edit":false,"delete":false},"Administration":{"view":false,"create":false,"edit":false,"delete":false}},"sidebar":["Dashboard","Operations"]}'::jsonb),
	  ('DISTRIBUTOR', '{"permissions":{"Planning":{"view":false,"create":false,"edit":false,"delete":false},"Operations":{"view":false,"create":false,"edit":false,"delete":false},"Executive":{"view":false,"create":false,"edit":false,"delete":false},"Administration":{"view":false,"create":false,"edit":false,"delete":false}},"sidebar":["Dashboard","Distributor"]}'::jsonb)
	  ON CONFLICT (role) DO UPDATE SET config = EXCLUDED.config
  `); err != nil {
		return fmt.Errorf("seed rbac_config: %w", err)
	}

	// Threshold settings defaults
	for _, w := range warehouses {
		for _, ct := range cementTypes {
			min := 500.0
			safety := 800.0
			warning := 400.0
			critical := 250.0
			lead := 3
			if _, err := tx.Exec(ctx, `
        INSERT INTO threshold_settings (warehouse_id, cement_type, min_stock, safety_stock, warning_level, critical_level, lead_time_days)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (warehouse_id, cement_type) DO NOTHING
      `, w.id, ct, min, safety, warning, critical, lead); err != nil {
				return fmt.Errorf("seed threshold_settings: %w", err)
			}
		}
	}

	// Alert configs defaults
	if _, err := tx.Exec(ctx, `
    INSERT INTO alert_configs (id, name, description, enabled, severity, recipients_roles, recipients_users, channels, params)
    VALUES
      (1, 'Stock Critical', 'Trigger when stock drops below critical threshold.', true, 'High', ARRAY['SUPER_ADMIN','MANAGEMENT']::text[], ARRAY[1]::bigint[], '{"inApp":true,"email":true}'::jsonb, '{"threshold":20,"unit":"%"}'::jsonb),
      (2, 'Shipment Delay', 'Notify if delivery is delayed beyond SLA.', true, 'Medium', ARRAY['OPERATOR']::text[], ARRAY[3]::bigint[], '{"inApp":true,"email":false}'::jsonb, '{"threshold":180,"unit":"minutes"}'::jsonb),
      (3, 'Demand Spike', 'Detect sudden demand increases.', false, 'Low', ARRAY['MANAGEMENT']::text[], ARRAY[]::bigint[], '{"inApp":true,"email":true}'::jsonb, '{"threshold":25,"unit":"%"}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `); err != nil {
		return fmt.Errorf("seed alert_configs: %w", err)
	}

	// Reset sequences to max(id)
	seqTables := []string{"users", "plants", "warehouses", "distributors", "stores", "projects", "stock_levels", "shipments", "sales_orders", "sales_targets", "competitor_presence", "road_segments", "trucks", "inventory_movements", "order_requests", "audit_logs"}
	for _, t := range seqTables {
		_, _ = tx.Exec(ctx, fmt.Sprintf(`SELECT setval(pg_get_serial_sequence('%s','id'), (SELECT COALESCE(MAX(id),1) FROM %s))`, t, t))
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}
