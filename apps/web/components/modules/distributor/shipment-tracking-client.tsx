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
    if (s === "RECEIVED") return <Badge variant="success">RECEIVED</Badge>;
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
                                <TH>Action</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((s) => (
                                <TR key={s.id}>
                                    <TD className="font-medium">#{s.id}</TD>
                                    <TD>{statusBadge(s.status)}</TD>
                                    <TD>
                                        <Badge variant="secondary">{s.cementType}</Badge>
                                    </TD>
                                    <TD className="text-right font-mono font-semibold">{Number(s.quantityTons).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{s.fromWarehouse?.name ?? "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">{s.departAt ? new Date(s.departAt).toLocaleString("id-ID") : "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">
                                        {s.arriveEta ? new Date(s.arriveEta).toLocaleString("id-ID") : s.etaMinutes ? `${s.etaMinutes} min` : "—"}
                                    </TD>
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada shipment.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
