"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
    Circle,
    CircleMarker,
    MapContainer,
    Polyline,
    Polygon,
    Rectangle,
    TileLayer,
    Tooltip,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type RiskLevel = "Low" | "Medium" | "High";

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function opportunityColor(score0to100: number) {
    const t = clamp(score0to100 / 100, 0, 1);
    const fillOpacity = 0.12 + 0.55 * t;
    const strokeOpacity = 0.25 + 0.55 * t;
    return {
        fillColor: `rgba(37, 99, 235, ${fillOpacity})`,
        strokeColor: `rgba(37, 99, 235, ${strokeOpacity})`,
    };
}

function conflictColor(overlapPct: number) {
    const t = clamp(overlapPct, 0, 1);
    const fillOpacity = 0.08 + 0.55 * t;
    const strokeOpacity = 0.2 + 0.55 * t;
    return {
        fillColor: `rgba(220, 38, 38, ${fillOpacity})`,
        strokeColor: `rgba(220, 38, 38, ${strokeOpacity})`,
    };
}

function hexPolygon(centerLat: number, centerLng: number, radiusDeg: number) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i;
        pts.push([
            centerLat + radiusDeg * Math.sin(angle),
            centerLng + radiusDeg * Math.cos(angle),
        ]);
    }
    return pts;
}

function ScaleControl({ enabled }: { enabled: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (!enabled) return;
        const c = L.control.scale({ position: "bottomleft", metric: true, imperial: false });
        c.addTo(map);
        return () => {
            c.remove();
        };
    }, [enabled, map]);
    return null;
}

function ResetViewControl({
    enabled,
    center,
    zoom,
}: {
    enabled: boolean;
    center: [number, number];
    zoom: number;
}) {
    const map = useMap();
    useEffect(() => {
        if (!enabled) return;
        const ResetControl = L.Control.extend({
            onAdd: () => {
                const container = L.DomUtil.create("div", "leaflet-bar");
                const link = L.DomUtil.create("a", "", container);
                link.href = "#";
                link.title = "Reset view";
                link.setAttribute("role", "button");
                link.setAttribute("aria-label", "Reset view");
                link.innerHTML = "⟲";
                (link as HTMLElement).style.width = "30px";
                (link as HTMLElement).style.height = "30px";
                (link as HTMLElement).style.display = "grid";
                (link as HTMLElement).style.placeItems = "center";

                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(link, "click", (e) => {
                    L.DomEvent.preventDefault(e);
                    map.setView(center, zoom, { animate: true });
                });

                return container;
            },
        });

        const control = new (ResetControl as unknown as new (options: L.ControlOptions) => L.Control)({
            position: "topleft",
        });

        control.addTo(map);
        return () => {
            control.remove();
        };
    }, [enabled, map, center, zoom]);
    return null;
}

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function BBoxWatcher({ onBBoxChange }: { onBBoxChange: (bbox: string) => void }) {
    const map = useMap();
    useEffect(() => {
        const emit = () => {
            const b = map.getBounds();
            onBBoxChange(
                `${b.getSouthWest().lat.toFixed(5)},${b.getSouthWest().lng.toFixed(
                    5,
                )},${b.getNorthEast().lat.toFixed(5)},${b.getNorthEast().lng.toFixed(5)}`,
            );
        };
        emit();
        map.on("moveend", emit);
        return () => {
            map.off("moveend", emit);
        };
    }, [map, onBBoxChange]);
    return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export default function PlanningMap({
    cells,
    whitespace,
    opportunities,
    conflictOverlays,
    showDemandSurface = true,
    showOpportunities = true,
    showConflicts = true,
    showWarehouses = true,
    showDistributors = true,
    highlightDistributorId = null,
    onBBoxChange,
    onMapClick,
    catchment,
    candidate,
    candidateRadiusKm = 3,
    candidateColor = "blue",
    warehouses,
    distributors,
    warehouseLine,
    legendVariant = "full",
    legendState,
    showResetControl = false,
    showScaleControl = false,
    defaultView,
}: {
    cells: {
        cellLat: number;
        cellLng: number;
        centerLat: number;
        centerLng: number;
        size: number;
        score: number;
    }[];
    whitespace?: {
        cellLat: number;
        cellLng: number;
        centerLat?: number;
        centerLng?: number;
        size: number;
        score: number;
    }[];
    opportunities?: {
        id?: string;
        centerLat: number;
        centerLng: number;
        size: number;
        score: number;
    }[];
    conflictOverlays?: {
        id: number;
        name: string;
        lat: number;
        lng: number;
        radiusKm: number;
        distanceKm: number;
        overlapPct: number;
        severity: RiskLevel;
    }[];
    showDemandSurface?: boolean;
    showOpportunities?: boolean;
    showConflicts?: boolean;
    showWarehouses?: boolean;
    showDistributors?: boolean;
    highlightDistributorId?: number | null;
    onBBoxChange: (bbox: string) => void;
    onMapClick: (lat: number, lng: number) => void;
    catchment:
    | {
        entity: { lat: number; lng: number; radiusKm: number };
        conflicts: unknown[];
    }
    | null;
    candidate: { lat: number; lng: number } | null;
    candidateRadiusKm?: number;
    candidateColor?: "blue" | "purple";
    warehouses: { id: number; name: string; lat: number; lng: number }[];
    distributors: { id: number; name: string; lat: number; lng: number }[];
    warehouseLine: { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
    legendVariant?: "full" | "demand-intensity" | "expansion";
    legendState?: { showOpportunities: boolean; showConflicts: boolean };
    showResetControl?: boolean;
    showScaleControl?: boolean;
    defaultView?: { center: [number, number]; zoom: number };
}) {
    const center: [number, number] = defaultView?.center ?? [-6.25, 106.9];
    const zoom = defaultView?.zoom ?? 10;
    const maxScore = useMemo(() => Math.max(1, ...cells.map((c) => c.score)), [cells]);
    const ws = whitespace ?? [];
    const opps = opportunities ?? [];
    const conflicts = conflictOverlays ?? [];

    const [hoveredCell, setHoveredCell] = useState<string | null>(null);
    const showGlow = cells.length <= 1200;

    const [radiusM, setRadiusM] = useState(0);
    const rafRef = useRef<number | null>(null);
    const animKey = useMemo(() => (candidate ? `${candidate.lat.toFixed(5)},${candidate.lng.toFixed(5)}` : "none"), [candidate]);

    useEffect(() => {
        let cancelled = false;

        if (!candidate) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            const t = setTimeout(() => {
                if (!cancelled) setRadiusM(0);
            }, 0);
            return () => {
                cancelled = true;
                clearTimeout(t);
            };
        }

        const target = Number(candidateRadiusKm) * 1000;
        const durationMs = 420;
        const start = performance.now();
        const from = 0;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        const tick = (now: number) => {
            if (cancelled) return;
            const t = Math.min(1, (now - start) / durationMs);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - t, 3);
            setRadiusM(from + (target - from) * eased);
            if (t < 1) rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [candidate, candidateRadiusKm]);

    const catchmentCircle = catchment?.entity
        ? {
            center: [catchment.entity.lat, catchment.entity.lng] as [number, number],
            radiusM: Number(catchment.entity.radiusKm) * 1000,
        }
        : null;

    const candidateHex = candidateColor === "purple" ? "#a855f7" : "#0ea5e9";

    const selectedCircle = candidate
        ? {
            center: [candidate.lat, candidate.lng] as [number, number],
            radiusM: Number(candidateRadiusKm) * 1000,
        }
        : null;

    return (
        <div className="relative h-full w-full">
            <MapContainer
                center={center}
                zoom={zoom}
                zoomSnap={0.5}
                scrollWheelZoom
                preferCanvas
                className="z-0"
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <BBoxWatcher onBBoxChange={onBBoxChange} />
                <ClickHandler onClick={onMapClick} />

                <ResetViewControl enabled={showResetControl} center={center} zoom={zoom} />
                <ScaleControl enabled={showScaleControl} />

                {showDemandSurface
                    ? cells.map((c) => {
                        const t = Math.min(1, c.score / maxScore);
                        const key = `${c.cellLat}:${c.cellLng}`;
                        const isHovered = hoveredCell === key;

                        // Heat-like styling: a soft orange core + (optional) outer glow.
                        const baseOpacity = 0.18 + 0.62 * t;
                        const fill = `rgba(249, 115, 22, ${baseOpacity})`;
                        const stroke = `rgba(234, 88, 12, ${0.25 + 0.55 * t})`;
                        const radius = 5 + t * 13;
                        return (
                            <Fragment key={key}>
                                {showGlow ? (
                                    <CircleMarker
                                        key={`glow:${key}`}
                                        center={[c.centerLat, c.centerLng]}
                                        radius={radius + 7}
                                        pathOptions={{
                                            color: "transparent",
                                            fillColor: `rgba(253, 186, 116, ${0.08 + 0.16 * t})`,
                                            fillOpacity: 1,
                                        }}
                                    />
                                ) : null}

                                <CircleMarker
                                    key={key}
                                    center={[c.centerLat, c.centerLng]}
                                    radius={radius}
                                    eventHandlers={{
                                        mouseover: () => setHoveredCell(key),
                                        mouseout: () =>
                                            setHoveredCell((prev) => (prev === key ? null : prev)),
                                    }}
                                    pathOptions={{
                                        color: stroke,
                                        weight: isHovered ? 2 : 1,
                                        fillColor: fill,
                                        fillOpacity: 1,
                                    }}
                                >
                                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                        <div className="space-y-0.5">
                                            <div className="text-xs font-medium">Demand Index</div>
                                            <div className="text-xs text-muted-foreground">
                                                {Math.round(c.score)} / 100
                                            </div>
                                        </div>
                                    </Tooltip>
                                </CircleMarker>
                            </Fragment>
                        );
                    })
                    : null}

                {showOpportunities
                    ? opps.map((a) => {
                        const size = a.size ?? 0.02;
                        const radiusDeg = Math.max(0.001, size * 0.55);
                        const pts = hexPolygon(a.centerLat, a.centerLng, radiusDeg);
                        const colors = opportunityColor(a.score);
                        return (
                            <Polygon
                                key={a.id ?? `opp:${a.centerLat}:${a.centerLng}`}
                                positions={pts}
                                pathOptions={{
                                    color: colors.strokeColor,
                                    weight: 1,
                                    fillColor: colors.fillColor,
                                    fillOpacity: 1,
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                    <div className="space-y-0.5">
                                        <div className="text-xs font-medium">Whitespace Opportunity</div>
                                        <div className="text-xs text-muted-foreground">Score: {Math.round(a.score)} / 100</div>
                                    </div>
                                </Tooltip>
                            </Polygon>
                        );
                    })
                    : null}

                {showConflicts
                    ? conflicts.map((c) => {
                        const colors = conflictColor(c.overlapPct);
                        const severityStroke =
                            c.severity === "High" ? 3 : c.severity === "Medium" ? 2 : 1;
                        return (
                            <Circle
                                key={`conf:${c.id}`}
                                center={[c.lat, c.lng]}
                                radius={Number(c.radiusKm) * 1000}
                                pathOptions={{
                                    color: colors.strokeColor,
                                    weight: severityStroke,
                                    fillColor: colors.fillColor,
                                    fillOpacity: 1,
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                    <div className="space-y-0.5">
                                        <div className="text-xs font-medium">Conflict Overlap</div>
                                        <div className="text-xs text-muted-foreground">{c.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {c.severity} · {Math.round(c.overlapPct * 100)}% overlap · {c.distanceKm.toFixed(1)} km
                                        </div>
                                    </div>
                                </Tooltip>
                            </Circle>
                        );
                    })
                    : null}

                {showWarehouses
                    ? warehouses.map((w) => (
                        <CircleMarker
                            key={`wh:${w.id}`}
                            center={[w.lat, w.lng]}
                            radius={6}
                            pathOptions={{
                                color: "#16a34a",
                                fillColor: "#16a34a",
                                fillOpacity: 0.9,
                                weight: 1,
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                <div className="space-y-0.5">
                                    <div className="text-xs font-medium">Warehouse</div>
                                    <div className="text-xs text-muted-foreground">{w.name}</div>
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    ))
                    : null}

                {showDistributors
                    ? distributors.map((d) => (
                        <CircleMarker
                            key={`dist:${d.id}`}
                            center={[d.lat, d.lng]}
                            radius={highlightDistributorId === d.id ? 7 : 5}
                            pathOptions={{
                                color: "#2563eb",
                                fillColor: "#2563eb",
                                fillOpacity: highlightDistributorId === d.id ? 0.95 : 0.85,
                                weight: 1,
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                <div className="space-y-0.5">
                                    <div className="text-xs font-medium">Distributor</div>
                                    <div className="text-xs text-muted-foreground">{d.name}</div>
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    ))
                    : null}

                {candidate ? (
                    <>
                        <CircleMarker
                            key={`cand:${animKey}`}
                            center={[candidate.lat, candidate.lng]}
                            radius={8}
                            pathOptions={{
                                color: candidateHex,
                                fillColor: candidateHex,
                                fillOpacity: 0.95,
                                weight: 1,
                            }}
                        />
                        <Circle
                            center={[candidate.lat, candidate.lng]}
                            radius={radiusM}
                            pathOptions={{
                                color: candidateHex,
                                weight: 2,
                                fillColor: candidateHex,
                                fillOpacity: legendVariant === "expansion" ? 0.08 : 0.06,
                            }}
                        />
                    </>
                ) : null}

                {warehouseLine ? (
                    <Polyline
                        positions={[
                            [warehouseLine.from.lat, warehouseLine.from.lng],
                            [warehouseLine.to.lat, warehouseLine.to.lng],
                        ]}
                        pathOptions={{
                            color: candidateHex,
                            weight: 2,
                            dashArray: "6 6",
                        }}
                    />
                ) : null}

                {/* Legacy whitespace rectangles (kept for compatibility) */}
                {showOpportunities && opps.length === 0
                    ? ws.map((a) => {
                        const size = a.size ?? 0.02;
                        const bounds: [[number, number], [number, number]] = [
                            [a.cellLat, a.cellLng],
                            [a.cellLat + size, a.cellLng + size],
                        ];
                        return (
                            <Rectangle
                                key={`ws:${a.cellLat}:${a.cellLng}`}
                                bounds={bounds}
                                pathOptions={{ color: "#2563eb", weight: 1, fillOpacity: 0.08 }}
                            />
                        );
                    })
                    : null}

                {catchmentCircle ? (
                    <Circle
                        center={catchmentCircle.center}
                        radius={catchmentCircle.radiusM}
                        pathOptions={{ color: "#2563eb", weight: 2 }}
                    />
                ) : null}

                {selectedCircle && legendVariant === "expansion" ? (
                    <Circle
                        center={selectedCircle.center}
                        radius={selectedCircle.radiusM}
                        pathOptions={{
                            color: candidateHex,
                            weight: 2,
                            fillColor: candidateHex,
                            fillOpacity: 0.04,
                        }}
                    />
                ) : null}
            </MapContainer>

            {legendVariant === "demand-intensity" ? (
                <div className="pointer-events-none absolute bottom-3 right-3 z-20 w-[220px] rounded-lg border border-border bg-background/90 p-3 shadow-sm">
                    <div className="text-xs font-semibold text-foreground">Demand Intensity</div>
                    <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: "#ea580c" }}
                                    aria-hidden
                                />
                                <span>High demand</span>
                            </div>
                            <span className="text-[10px]">Top tier</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: "#f97316" }}
                                    aria-hidden
                                />
                                <span>Medium demand</span>
                            </div>
                            <span className="text-[10px]">Core markets</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className="h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: "#fdba74" }}
                                    aria-hidden
                                />
                                <span>Low demand</span>
                            </div>
                            <span className="text-[10px]">Emerging</span>
                        </div>
                    </div>
                </div>
            ) : legendVariant === "expansion" ? (
                <div className="pointer-events-none absolute bottom-3 right-3 z-20 w-[260px] rounded-lg border border-border bg-background/90 p-3 shadow-sm">
                    <div className="text-xs font-semibold text-foreground">Expansion Legend</div>
                    <div className="mt-2 space-y-3 text-[11px] text-muted-foreground">
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-foreground">Opportunity (whitespace)</div>
                                {legendState && !legendState.showOpportunities ? (
                                    <span className="text-[10px]">Hidden</span>
                                ) : null}
                            </div>
                            <div className="mt-1 flex items-center gap-1">
                                {[25, 55, 85].map((s) => {
                                    const c = opportunityColor(s);
                                    return (
                                        <span
                                            key={s}
                                            className="h-2.5 w-2.5 rounded-sm"
                                            style={{ backgroundColor: c.fillColor }}
                                            aria-hidden
                                        />
                                    );
                                })}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                                <span>Low</span>
                                <span>High</span>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-foreground">Conflict overlap</div>
                                {legendState && !legendState.showConflicts ? (
                                    <span className="text-[10px]">Hidden</span>
                                ) : null}
                            </div>
                            <div className="mt-1 flex items-center gap-1">
                                {[0.1, 0.25, 0.45].map((pct) => {
                                    const c = conflictColor(pct);
                                    return (
                                        <span
                                            key={pct}
                                            className="h-2.5 w-2.5 rounded-sm"
                                            style={{ backgroundColor: c.fillColor }}
                                            aria-hidden
                                        />
                                    );
                                })}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                                <span>Lower</span>
                                <span>Higher</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                                <span>Warehouse</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2563eb" }} />
                                <span>Distributor</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: candidateHex }} />
                                <span>{candidateColor === "purple" ? "Candidate" : "Selected"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#dc2626" }} />
                                <span>Conflict area</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pointer-events-none absolute right-3 top-3 z-20 w-[220px] rounded-lg border border-border bg-background/90 p-3 shadow-sm">
                    <div className="text-xs font-medium">Legend</div>
                    <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
                        <div>
                            <div className="font-medium text-foreground">Demand intensity</div>
                            <div className="mt-1 flex items-center gap-1">
                                {[0.2, 0.35, 0.5, 0.65, 0.8].map((op) => (
                                    <span
                                        key={op}
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: `rgba(249, 115, 22, ${op})` }}
                                        aria-hidden
                                    />
                                ))}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                                <span>Lower</span>
                                <span>Higher</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                                <span>Warehouse</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2563eb" }} />
                                <span>Distributor</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: candidateHex }} />
                                <span>Candidate</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2563eb" }} />
                                <span>Opportunity</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
