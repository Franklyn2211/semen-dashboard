"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { MapContainer } from "@/components/planning/map-container";
import { Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

export type DistributorShipmentItem = {
    id: number;
    status: string;
    cementType: string;
    quantityTons: number;
    departAt: string | null;
    arriveEta: string | null;
    etaMinutes: number;
    fromWarehouse: { id: number; name: string };

    // Optional tracking fields (may not exist in backend yet)
    originLatLng?: { lat: number; lng: number };
    destLatLng?: { lat: number; lng: number };
    routeLatLngs?: Array<{ lat: number; lng: number }>;
    truckLatLng?: { lat: number; lng: number };
    lastUpdatedAt?: string | null;

    // Optional labels
    destinationName?: string | null;
    currentLocationText?: string | null;
};

type LatLng = { lat: number; lng: number };

const STATUS_LABEL: Record<string, string> = {
    COMPLETED: "Completed",
    ON_DELIVERY: "On Delivery",
    DELAYED: "Delayed",
    SCHEDULED: "Scheduled",
};

function statusBadge(s: string) {
    if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    return <Badge variant="secondary">{s || "UNKNOWN"}</Badge>;
}

function formatDateTime(value?: string | null) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("id-ID");
}

function toLatLngTuple(p: LatLng): [number, number] {
    return [p.lat, p.lng];
}

function haversineKm(a: LatLng, b: LatLng) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
}

function routeDistanceKm(route: LatLng[]) {
    if (route.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < route.length; i++) sum += haversineKm(route[i - 1], route[i]);
    return sum;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
    return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
}

function buildFallbackTracking(s: DistributorShipmentItem) {
    // Jakarta / Bekasi corridor (deterministic but varied by shipment id)
    const seed = (s.id % 997) / 997;
    const origin: LatLng = s.originLatLng ?? {
        lat: -6.170 + seed * 0.06,
        lng: 106.830 + seed * 0.08,
    };
    const dest: LatLng = s.destLatLng ?? {
        lat: -6.260 + seed * 0.05,
        lng: 106.950 + seed * 0.08,
    };

    const route: LatLng[] = (s.routeLatLngs?.length ? s.routeLatLngs : undefined)?.map((p) => ({ lat: p.lat, lng: p.lng })) ?? [
        origin,
        { lat: lerp(origin.lat, dest.lat, 0.33) + 0.01, lng: lerp(origin.lng, dest.lng, 0.33) - 0.01 },
        { lat: lerp(origin.lat, dest.lat, 0.66) - 0.008, lng: lerp(origin.lng, dest.lng, 0.66) + 0.012 },
        dest,
    ];

    // Truck position default: near origin for scheduled, mid-route otherwise
    const baseProgress =
        s.status === "SCHEDULED" ? 0.05 : s.status === "COMPLETED" ? 1 : s.status === "DELAYED" ? 0.55 : 0.45;

    const truck: LatLng = s.truckLatLng ?? lerpLatLng(route[0], route[route.length - 1], baseProgress);

    const destinationName = s.destinationName ?? "Distributor";
    const currentLocationText = s.currentLocationText ?? "—";

    return { origin, dest, route, truck, destinationName, currentLocationText };
}

function createDivIcon(kind: "warehouse" | "distributor" | "truck") {
    const cfg: Record<typeof kind, { label: string; bg: string; border: string }> = {
        warehouse: { label: "W", bg: "#ecfeff", border: "#0891b2" },
        distributor: { label: "D", bg: "#eff6ff", border: "#2563eb" },
        truck: { label: "T", bg: "#fff7ed", border: "#ea580c" },
    };

    const c = cfg[kind];
    return L.divIcon({
        className: "",
        html: `
          <div style="
            width: 30px;
            height: 30px;
            border-radius: 9999px;
            background: ${c.bg};
            border: 2px solid ${c.border};
            box-shadow: 0 6px 14px rgba(0,0,0,0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            color: #0f172a;
          ">
            ${c.label}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

function FitToRoute({ route }: { route: LatLng[] }) {
    const map = useMap();

    useEffect(() => {
        if (!route?.length) return;
        const bounds = L.latLngBounds(route.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.18), { animate: true });
    }, [map, route]);

    return null;
}

function SimulationBadge({ live }: { live: boolean }) {
    return live ? <Badge variant="success">LIVE</Badge> : <Badge variant="secondary">STATIC</Badge>;
}

function calculateExpectedMinutesRemaining(status: string, etaMinutes: number) {
    if (status === "COMPLETED") return 0;
    if (etaMinutes && etaMinutes > 0) return etaMinutes;
    if (status === "SCHEDULED") return 120;
    if (status === "DELAYED") return 160;
    return 90;
}

function useLiveTruckSimulation(params: {
    enabled: boolean;
    status: string;
    route: LatLng[];
    initialTruck: LatLng;
    initialExpectedMinsRemaining: number;
}) {
    const { enabled, status, route, initialTruck, initialExpectedMinsRemaining } = params;

    // Key used to remount/reset via hook consumer when shipment changes; but also safe-guard here.
    const [truck, setTruck] = useState<LatLng>(initialTruck);
    const [progressKm, setProgressKm] = useState<number>(0);
    const [remainingKm, setRemainingKm] = useState<number>(0);
    const [etaMinutesRemaining, setEtaMinutesRemaining] = useState<number>(initialExpectedMinsRemaining);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() => new Date().toISOString());

    const totalKm = useMemo(() => routeDistanceKm(route), [route]);

    const progressRef = useRef(0);
    const timerRef = useRef<number | null>(null);

    // Initialize refs when route/truck changes (avoid setState in effect; compute-only)
    useEffect(() => {
        progressRef.current = 0;
        if (route.length >= 2) {
            const origin = route[0];
            const distFromOrigin = haversineKm(origin, initialTruck);
            const approx = totalKm > 0 ? clamp(distFromOrigin / totalKm, 0, 1) : 0;
            progressRef.current = approx;
        }
        // keep metrics consistent
        const t = progressRef.current;
        setProgressKm(totalKm * t);
        setRemainingKm(Math.max(0, totalKm - totalKm * t));
        setLastUpdatedAt(new Date().toISOString());
        // Note: truck/eta are managed by interval; initial values come from useState initializers.
    }, [route, totalKm, initialTruck]);

    useEffect(() => {
        if (!enabled || status !== "ON_DELIVERY" || route.length < 2) {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        // Move 1–3% progress every 2.5s
        const intervalMs = 2500;
        timerRef.current = window.setInterval(() => {
            const step = 0.01 + ((Date.now() / 1000) % 2) * 0.01; // deterministic-ish
            const next = clamp(progressRef.current + step, 0, 1);
            progressRef.current = next;

            const origin = route[0];
            const dest = route[route.length - 1];
            const nextPos = lerpLatLng(origin, dest, next);

            setTruck((prev) => {
                // simple smoothing interpolation
                return lerpLatLng(prev, nextPos, 0.6);
            });

            const progKm = totalKm * next;
            const remKm = Math.max(0, totalKm - progKm);
            setProgressKm(progKm);
            setRemainingKm(remKm);

            setEtaMinutesRemaining((m) => Math.max(0, Math.round(m - (intervalMs / 60000) * 2)));
            setLastUpdatedAt(new Date().toISOString());
        }, intervalMs);

        return () => {
            if (timerRef.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [enabled, route, status, totalKm]);

    return {
        truck,
        progressKm,
        remainingKm,
        etaMinutesRemaining,
        lastUpdatedAt,
        totalKm,
        progressRatio: totalKm > 0 ? clamp(progressKm / totalKm, 0, 1) : 0,
    };
}

function ShipmentsTable({
    items,
    selectedId,
    onSelect,
    isLoading,
}: {
    items: DistributorShipmentItem[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    isLoading: boolean;
}) {
    return (
        <Card className="h-full">
            <CardHeader className="space-y-1">
                <CardTitle className="flex items-center justify-between gap-3">
                    <span>Shipments</span>
                    {isLoading ? <Badge variant="secondary">Loading</Badge> : <Badge variant="outline">{items.length} items</Badge>}
                </CardTitle>
                <div className="text-xs text-muted-foreground">Klik baris untuk melihat tracking.</div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="max-h-[420px] overflow-auto border-t">
                    <Table>
                        <THead className="sticky top-0 bg-background">
                            <TR>
                                <TH>ID</TH>
                                <TH>Status</TH>
                                <TH>Cement</TH>
                                <TH className="text-right">Qty (ton)</TH>
                                <TH>From</TH>
                                <TH>Depart</TH>
                                <TH>ETA</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TR key={`sk-${i}`}>
                                        <TD colSpan={7} className="py-4">
                                            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                                        </TD>
                                    </TR>
                                ))
                            ) : (
                                items.map((s) => {
                                    const selected = selectedId === s.id;
                                    return (
                                        <TR
                                            key={s.id}
                                            onClick={() => onSelect(s.id)}
                                            className={
                                                "cursor-pointer transition-colors " +
                                                (selected ? "bg-slate-50" : "hover:bg-slate-50/60")
                                            }
                                        >
                                            <TD className="font-medium">#{s.id}</TD>
                                            <TD>{statusBadge(s.status)}</TD>
                                            <TD>
                                                <Badge variant="secondary">{s.cementType}</Badge>
                                            </TD>
                                            <TD className="text-right font-mono font-semibold">
                                                {Number(s.quantityTons).toLocaleString("id-ID")}
                                            </TD>
                                            <TD className="text-xs">{s.fromWarehouse?.name ?? "—"}</TD>
                                            <TD className="text-xs text-muted-foreground">{formatDateTime(s.departAt)}</TD>
                                            <TD className="text-xs text-muted-foreground">
                                                {s.arriveEta
                                                    ? formatDateTime(s.arriveEta)
                                                    : s.etaMinutes
                                                      ? `${s.etaMinutes} min`
                                                      : "—"}
                                            </TD>
                                        </TR>
                                    );
                                })
                            )}

                            {!isLoading && items.length === 0 ? (
                                <TR>
                                    <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada shipment.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function ShipmentDetailsCard({
    shipment,
    tracking,
    liveMode,
    onToggleLive,
}: {
    shipment: DistributorShipmentItem;
    tracking: {
        origin: LatLng;
        dest: LatLng;
        truck: LatLng;
        route: LatLng[];
        destinationName: string;
        currentLocationText: string;
    };
    liveMode: boolean;
    onToggleLive: () => void;
}) {
    const expectedMins = calculateExpectedMinutesRemaining(shipment.status, shipment.etaMinutes);

    // clock to avoid calling Date.now() during render
    const [nowTs, setNowTs] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNowTs(Date.now()), 30_000);
        return () => window.clearInterval(id);
    }, []);

    const sim = useLiveTruckSimulation({
        enabled: liveMode,
        status: shipment.status,
        route: tracking.route,
        initialTruck: tracking.truck,
        initialExpectedMinsRemaining: expectedMins,
    });

    const remainingKm = sim.remainingKm;

    const etaText = shipment.arriveEta ? formatDateTime(shipment.arriveEta) : `${sim.etaMinutesRemaining} min`;

    const minutesLate = useMemo(() => {
        if (!shipment.arriveEta) return 0;
        const target = new Date(shipment.arriveEta).getTime();
        if (Number.isNaN(target)) return 0;
        const projected = nowTs + sim.etaMinutesRemaining * 60_000;
        const diffMin = Math.round((projected - target) / 60_000);
        return diffMin;
    }, [nowTs, shipment.arriveEta, sim.etaMinutesRemaining]);

    const onTimeIndicator =
        shipment.status === "COMPLETED"
            ? { label: "Delivered", variant: "success" as const }
            : minutesLate > 5
              ? { label: `Late by ${minutesLate} min`, variant: "danger" as const }
              : { label: "On time", variant: "success" as const };

    const lastUpdate = shipment.lastUpdatedAt ? formatDateTime(shipment.lastUpdatedAt) : formatDateTime(sim.lastUpdatedAt);

    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">Shipment #{shipment.id}</span>
                            {statusBadge(shipment.status)}
                        </CardTitle>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {shipment.fromWarehouse?.name ?? "Warehouse"} {tracking.destinationName}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <SimulationBadge live={liveMode} />
                        <Button size="sm" variant="outline" onClick={onToggleLive}>
                            Live mode: {liveMode ? "On" : "Off"}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border bg-background p-3">
                        <div className="text-[11px] text-muted-foreground">Current location</div>
                        <div className="mt-1 text-sm font-medium">
                            {shipment.currentLocationText || tracking.currentLocationText !== "—"
                                ? shipment.currentLocationText ?? tracking.currentLocationText
                                : `${sim.truck.lat.toFixed(4)}, ${sim.truck.lng.toFixed(4)}`}
                        </div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                        <div className="text-[11px] text-muted-foreground">Distance remaining</div>
                        <div className="mt-1 text-sm font-semibold font-mono">{remainingKm.toFixed(1)} km</div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                        <div className="text-[11px] text-muted-foreground">ETA</div>
                        <div className="mt-1 text-sm font-medium">{etaText}</div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                        <div className="text-[11px] text-muted-foreground">Schedule</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant={onTimeIndicator.variant}>{onTimeIndicator.label}</Badge>
                            <span className="text-xs text-muted-foreground">Last update: {lastUpdate}</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border p-3">
                        <div className="text-[11px] text-muted-foreground">Cargo</div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <Badge variant="secondary">{shipment.cementType}</Badge>
                            <span className="font-mono text-sm font-semibold">{Number(shipment.quantityTons).toLocaleString("id-ID")} ton</span>
                        </div>
                    </div>
                    <div className="rounded-md border p-3">
                        <div className="text-[11px] text-muted-foreground">Depart</div>
                        <div className="mt-1 text-sm font-medium">{formatDateTime(shipment.departAt)}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ShipmentMap({
    shipment,
    tracking,
    liveMode,
}: {
    shipment: DistributorShipmentItem;
    tracking: { origin: LatLng; dest: LatLng; route: LatLng[]; truck: LatLng; destinationName: string };
    liveMode: boolean;
}) {
    const expectedMins = calculateExpectedMinutesRemaining(shipment.status, shipment.etaMinutes);
    const sim = useLiveTruckSimulation({
        enabled: liveMode,
        status: shipment.status,
        route: tracking.route,
        initialTruck: tracking.truck,
        initialExpectedMinsRemaining: expectedMins,
    });

    const progressRoute = useMemo(() => {
        // simple progress overlay: origin -> interpolated point
        if (tracking.route.length < 2) return [] as LatLng[];
        const origin = tracking.route[0];
        const dest = tracking.route[tracking.route.length - 1];
        const p = lerpLatLng(origin, dest, sim.progressRatio);
        return [origin, p];
    }, [tracking.route, sim.progressRatio]);

    return (
        <Card className="overflow-hidden">
            <CardHeader className="space-y-2">
                <CardTitle className="flex items-center justify-between gap-3">
                    <span>Map</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full border" style={{ background: "#ecfeff", borderColor: "#0891b2" }} />
                            Warehouse
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full border" style={{ background: "#eff6ff", borderColor: "#2563eb" }} />
                            Distributor
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full border" style={{ background: "#fff7ed", borderColor: "#ea580c" }} />
                            Truck
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-0.5 w-6 rounded" style={{ background: "#64748b" }} />
                            Route
                        </span>
                    </div>
                </CardTitle>
                <div className="text-xs text-muted-foreground">{STATUS_LABEL[shipment.status] ?? shipment.status}</div>
            </CardHeader>
            <CardContent className="p-0">
                <MapContainer
                    className="h-[420px] rounded-none border-x-0 border-b-0"
                    center={toLatLngTuple(tracking.origin)}
                    zoom={11}
                >
                    <FitToRoute route={tracking.route} />

                    <Polyline
                        positions={tracking.route.map(toLatLngTuple)}
                        pathOptions={{ color: "#64748b", weight: 4, opacity: 0.8 }}
                    />
                    {progressRoute.length >= 2 ? (
                        <Polyline
                            positions={progressRoute.map(toLatLngTuple)}
                            pathOptions={{ color: "#16a34a", weight: 5, opacity: 0.9 }}
                        />
                    ) : null}

                    <Marker position={toLatLngTuple(tracking.origin)} icon={createDivIcon("warehouse")}>
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            Origin: {shipment.fromWarehouse?.name ?? "Warehouse"}
                        </Tooltip>
                    </Marker>
                    <Marker position={toLatLngTuple(tracking.dest)} icon={createDivIcon("distributor")}>
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            Destination: {tracking.destinationName}
                        </Tooltip>
                    </Marker>
                    <Marker position={toLatLngTuple(sim.truck)} icon={createDivIcon("truck")}>
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                            Truck: {sim.truck.lat.toFixed(4)}, {sim.truck.lng.toFixed(4)}
                        </Tooltip>
                    </Marker>
                </MapContainer>
            </CardContent>
        </Card>
    );
}

export function DistributorShipmentTrackingClient({ initial }: { initial: DistributorShipmentItem[] }) {
    const [items, setItems] = useState<DistributorShipmentItem[]>(initial);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(() => (initial?.[0]?.id ? initial[0].id : null));
    const [liveMode, setLiveMode] = useState(true);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const r = await fetch("/api/distributor/shipments");
            const d = await r.json();
            const next = (d.items ?? []) as DistributorShipmentItem[];
            setItems(next);
            setSelectedId((prev) => {
                if (prev && next.some((x) => x.id === prev)) return prev;
                return next?.[0]?.id ?? null;
            });
        } catch {
            setItems([]);
            setSelectedId(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

    const tracking = useMemo(() => {
        if (!selected) return null;
        return buildFallbackTracking(selected);
    }, [selected]);

    // Key to force simulation hook reset when selecting a new shipment
    const simKey = `${selected?.id ?? "none"}-${liveMode ? "live" : "static"}`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Shipment Tracking"
                description="Tracking shipment menuju distributor ini. Pilih shipment untuk melihat posisi truk dan rute."
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setLiveMode((v) => !v)}>
                            Live mode: {liveMode ? "On" : "Off"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={refresh}>
                            Refresh
                        </Button>
                    </div>
                }
            />

            <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-5">
                    <ShipmentsTable
                        items={items}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        isLoading={isLoading}
                    />
                </div>

                <div className="space-y-4 lg:col-span-7">
                    {selected && tracking ? (
                        <>
                            <div key={`details-${simKey}`}>
                                <ShipmentDetailsCard
                                    shipment={selected}
                                    tracking={tracking}
                                    liveMode={liveMode}
                                    onToggleLive={() => setLiveMode((v) => !v)}
                                />
                            </div>
                            <div key={`map-${simKey}`}>
                                <ShipmentMap shipment={selected} tracking={tracking} liveMode={liveMode} />
                            </div>
                        </>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Tracking</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-muted-foreground">
                                    Pilih shipment untuk menampilkan peta dan detail tracking.
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
