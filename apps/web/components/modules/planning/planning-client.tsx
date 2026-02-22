"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { MarketAnalysisDashboard } from "./market-analysis-dashboard";
import { ExpansionAnalysisDashboard } from "./expansion-analysis-dashboard";

const PlanningMap = dynamic(() => import("./planning-map"), { ssr: false });

type HeatCell = {
    cellLat: number;
    cellLng: number;
    centerLat: number;
    centerLng: number;
    size: number;
    score: number;
};

type WhitespaceArea = {
    cellLat: number;
    cellLng: number;
    centerLat: number;
    centerLng: number;
    size: number;
    score: number;
    nearestStoreKm: number;
    nearestDistributorKm: number;
};

type LogisticsEntity = {
    id: number;
    name: string;
    lat: number;
    lng: number;
    capacityTons?: number;
    serviceRadiusKm?: number;
};

type SiteProfile = {
    score: number;
    reasons: string[];
    roadWidthM: number;
    demandWithin3km: number;
    distanceToWarehouseKm: number;
};

type SiteStatus = "High Potential" | "Moderate" | "Not Recommended";

type ScoreBreakdown = {
    demandScore: number;
    roadAccessibilityScore: number;
    warehouseProximityScore: number;
    competitionPressureScore: number;
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const aa =
        s1 * s1 +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        s2 * s2;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
}

function statusFromScore(score: number): SiteStatus {
    if (score >= 75) return "High Potential";
    if (score >= 55) return "Moderate";
    return "Not Recommended";
}

function badgeVariantFromStatus(status: SiteStatus): "success" | "warning" | "danger" {
    if (status === "High Potential") return "success";
    if (status === "Moderate") return "warning";
    return "danger";
}

function scoreFromDemandWithin3km(demand3km: number) {
    // API threshold: >600 high, >250 moderate.
    if (demand3km >= 800) return 95;
    if (demand3km >= 600) return 85;
    if (demand3km >= 450) return 72;
    if (demand3km >= 250) return 60;
    if (demand3km >= 150) return 48;
    return 35;
}

function scoreFromRoadWidthM(widthM: number) {
    if (widthM >= 7) return 90;
    if (widthM >= 6) return 78;
    if (widthM >= 5) return 62;
    if (widthM > 0) return 42;
    return 35;
}

function scoreFromWarehouseDistanceKm(distanceKm: number) {
    // Favor <20km strongly, decay afterwards.
    if (distanceKm <= 10) return 92;
    if (distanceKm <= 20) return 80;
    if (distanceKm <= 35) return 65;
    if (distanceKm <= 50) return 52;
    return 40;
}

function scoreFromCompetition(input: {
    nearestDistributorKm: number | null;
    distributorsWithin6Km: number;
}) {
    // Higher score = lower competitive pressure.
    const nearestPenalty =
        input.nearestDistributorKm == null
            ? 10
            : input.nearestDistributorKm <= 2
                ? 35
                : input.nearestDistributorKm <= 4
                    ? 22
                    : input.nearestDistributorKm <= 6
                        ? 12
                        : 6;
    const countPenalty = clamp(input.distributorsWithin6Km, 0, 10) * 7;
    return clamp(100 - nearestPenalty - countPenalty, 0, 100);
}

function demandLabelFromDemandWithin3km(demand3km: number) {
    if (demand3km >= 600) return "High";
    if (demand3km >= 250) return "Moderate";
    return "Low";
}

function buildRecommendation(input: {
    status: SiteStatus;
    breakdown: ScoreBreakdown;
    demandWithin3km: number;
    roadWidthM: number;
    distanceToWarehouseKm: number;
    nearestDistributorKm: number | null;
    distributorsWithin6Km: number;
}) {
    const positives: string[] = [];
    const risks: string[] = [];

    if (input.breakdown.demandScore >= 75) positives.push("Strong nearby demand");
    else if (input.breakdown.demandScore <= 48) risks.push("Limited demand in a 3km radius");

    if (input.breakdown.roadAccessibilityScore >= 75) positives.push("Good truck access via wider roads");
    else if (input.breakdown.roadAccessibilityScore <= 45) risks.push("Road access may constrain heavy truck operations");

    if (input.breakdown.warehouseProximityScore >= 75) positives.push("Warehouse is within a practical delivery range");
    else if (input.breakdown.warehouseProximityScore <= 52) risks.push("Long distance to warehouse may increase delivery cost");

    if (input.breakdown.competitionPressureScore >= 75) positives.push("Competitive pressure looks manageable");
    else if (input.breakdown.competitionPressureScore <= 55)
        risks.push("High competitive pressure from nearby distributors");

    const verdict =
        input.status === "High Potential"
            ? "This location is a strong candidate for expansion."
            : input.status === "Moderate"
                ? "This location can work, but needs careful execution."
                : "This location is not recommended as-is.";

    return {
        verdict,
        positives: positives.slice(0, 3),
        risks: risks.slice(0, 3),
    };
}

function ScoreBar({ label, value }: { label: string; value: number }) {
    const pct = clamp(Math.round(value), 0, 100);
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
                <div
                    className="h-2 rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export type PlanningMode = "site" | "expansion" | "market";

export function PlanningClient({ mode }: { mode: PlanningMode }) {
    const [bbox, setBbox] = useState<string>("-6.55,106.65,-6.00,107.35");
    const [cells, setCells] = useState<HeatCell[]>([]);
    const [cellsLoading, setCellsLoading] = useState(false);
    const [whitespaceOn, setWhitespaceOn] = useState(false);
    const [whitespace, setWhitespace] = useState<WhitespaceArea[]>([]);
    const [whitespaceLoading, setWhitespaceLoading] = useState(false);
    const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
    const [profile, setProfile] = useState<SiteProfile | null>(null);
    const [entities, setEntities] = useState<{
        warehouses: LogisticsEntity[];
        distributors: LogisticsEntity[];
    }>({ warehouses: [], distributors: [] });

    const nearestWarehouse = useMemo(() => {
        if (!clicked || entities.warehouses.length === 0) return null;
        let best: LogisticsEntity | null = null;
        let bestKm = Infinity;
        for (const wh of entities.warehouses) {
            const km = haversineKm(clicked, wh);
            if (km < bestKm) {
                bestKm = km;
                best = wh;
            }
        }
        return best ? { ...best, distanceKm: bestKm } : null;
    }, [clicked, entities.warehouses]);

    const nearestDistributor = useMemo(() => {
        if (!clicked || entities.distributors.length === 0) return null;
        let best: LogisticsEntity | null = null;
        let bestKm = Infinity;
        for (const d of entities.distributors) {
            const km = haversineKm(clicked, d);
            if (km < bestKm) {
                bestKm = km;
                best = d;
            }
        }
        return best ? { ...best, distanceKm: bestKm } : null;
    }, [clicked, entities.distributors]);

    const distributorsWithin6Km = useMemo(() => {
        if (!clicked) return 0;
        let count = 0;
        for (const d of entities.distributors) {
            if (haversineKm(clicked, d) <= 6) count++;
        }
        return count;
    }, [clicked, entities.distributors]);

    const localDemandIntensity = useMemo(() => {
        if (!clicked || cells.length === 0) return null;
        let best = cells[0];
        let bestDist = Infinity;
        for (const c of cells) {
            const dLat = c.centerLat - clicked.lat;
            const dLng = c.centerLng - clicked.lng;
            const d = dLat * dLat + dLng * dLng;
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        return best.score;
    }, [clicked, cells]);

    const siteStatus = useMemo(() => {
        if (!profile) return null;
        return statusFromScore(profile.score);
    }, [profile]);

    const breakdown = useMemo<ScoreBreakdown | null>(() => {
        if (!profile) return null;
        const demandScore = scoreFromDemandWithin3km(profile.demandWithin3km);
        const roadAccessibilityScore = scoreFromRoadWidthM(profile.roadWidthM);
        const warehouseProximityScore = scoreFromWarehouseDistanceKm(profile.distanceToWarehouseKm);
        const competitionPressureScore = scoreFromCompetition({
            nearestDistributorKm: nearestDistributor ? nearestDistributor.distanceKm : null,
            distributorsWithin6Km,
        });
        return {
            demandScore,
            roadAccessibilityScore,
            warehouseProximityScore,
            competitionPressureScore,
        };
    }, [profile, nearestDistributor, distributorsWithin6Km]);

    const recommendation = useMemo(() => {
        if (!profile || !siteStatus || !breakdown) return null;
        return buildRecommendation({
            status: siteStatus,
            breakdown,
            demandWithin3km: profile.demandWithin3km,
            roadWidthM: profile.roadWidthM,
            distanceToWarehouseKm: profile.distanceToWarehouseKm,
            nearestDistributorKm: nearestDistributor ? nearestDistributor.distanceKm : null,
            distributorsWithin6Km,
        });
    }, [profile, siteStatus, breakdown, nearestDistributor, distributorsWithin6Km]);

    useEffect(() => {
        // Reset irrelevant state when switching focus.
        // Schedule the updates to avoid synchronous setState in an effect body (eslint).
        const t = setTimeout(() => {
            if (mode !== "expansion") {
                setWhitespaceOn(false);
                setWhitespace([]);
            }
            if (mode !== "site") {
                setClicked(null);
                setProfile(null);
            }
        }, 0);
        return () => clearTimeout(t);
    }, [mode]);

    useEffect(() => {
        let cancelled = false;
        const t = setTimeout(() => {
            if (!cancelled) setCellsLoading(true);
        }, 0);

        fetch(`/api/planning/heatmap?bbox=${encodeURIComponent(bbox)}`)
            .then((r) => r.json())
            .then((d) => {
                if (!cancelled) setCells(d.cells ?? []);
            })
            .catch(() => {
                if (!cancelled) setCells([]);
            })
            .finally(() => {
                if (!cancelled) setCellsLoading(false);
            });

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [bbox]);

    useEffect(() => {
        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) =>
                setEntities({
                    warehouses: (d.warehouses ?? []) as LogisticsEntity[],
                    distributors: (d.distributors ?? []) as LogisticsEntity[],
                }),
            )
            .catch(() => setEntities({ warehouses: [], distributors: [] }));
    }, []);

    useEffect(() => {
        if (!whitespaceOn) return;
        let cancelled = false;
        const t = setTimeout(() => {
            if (!cancelled) setWhitespaceLoading(true);
        }, 0);

        fetch(`/api/planning/whitespace?bbox=${encodeURIComponent(bbox)}`)
            .then((r) => r.json())
            .then((d) => {
                if (!cancelled) setWhitespace((d.areas ?? []) as WhitespaceArea[]);
            })
            .catch(() => {
                if (!cancelled) setWhitespace([]);
            })
            .finally(() => {
                if (!cancelled) setWhitespaceLoading(false);
            });

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [bbox, whitespaceOn]);

    async function loadProfile(lat: number, lng: number) {
        setClicked({ lat, lng });
        setProfile(null);
        const res = await fetch(
            `/api/planning/site-profile?lat=${lat}&lng=${lng}`,
        ).catch(() => null);
        if (!res || !res.ok) return;
        const data = (await res.json()) as SiteProfile;
        setProfile(data);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={
                    mode === "site"
                        ? "Site Selection"
                        : mode === "expansion"
                            ? "Expansion Analysis"
                            : "Market Analysis"
                }
                description={
                    mode === "site"
                        ? "Evaluasi lokasi: Heatmap + Site Profiling"
                        : mode === "expansion"
                            ? "Decision-support expansion: whitespace, overlaps, and what-if simulation."
                            : "Executive market intelligence: demand surface, trend, and regional benchmarks."
                }
            />

            {mode === "market" ? (
                <MarketAnalysisDashboard
                    mapLoading={cellsLoading}
                    map={
                        <PlanningMap
                            cells={cells}
                            whitespace={[]}
                            onBBoxChange={setBbox}
                            onMapClick={() => { }}
                            catchment={null}
                            candidate={null}
                            warehouses={[]}
                            distributors={[]}
                            warehouseLine={null}
                            legendVariant="demand-intensity"
                        />
                    }
                />
            ) : mode === "expansion" ? (
                <ExpansionAnalysisDashboard
                    bbox={bbox}
                    setBbox={setBbox}
                    cells={cells}
                    cellsLoading={cellsLoading}
                    whitespace={whitespace}
                    whitespaceLoading={whitespaceLoading}
                    setWhitespaceOn={(next) => {
                        setWhitespaceOn(next);
                        if (!next) setWhitespace([]);
                    }}
                    warehouses={entities.warehouses}
                    distributors={entities.distributors}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Site Selection Map</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">Klik peta untuk profiling</Badge>
                                    <div className="flex-1" />
                                    <div className="text-xs text-muted-foreground">Bounding Box</div>
                                    <Input
                                        className="h-8 w-[220px] font-mono text-xs"
                                        value={bbox}
                                        onChange={(e) => setBbox(e.target.value)}
                                    />
                                </div>
                                <div className="h-[520px] overflow-hidden rounded-md border border-border">
                                    <PlanningMap
                                        cells={cells}
                                        whitespace={[]}
                                        onBBoxChange={setBbox}
                                        onMapClick={loadProfile}
                                        catchment={null}
                                        candidate={clicked}
                                        warehouses={entities.warehouses}
                                        distributors={entities.distributors}
                                        warehouseLine={
                                            clicked && nearestWarehouse
                                                ? {
                                                    from: clicked,
                                                    to: { lat: nearestWarehouse.lat, lng: nearestWarehouse.lng },
                                                }
                                                : null
                                        }
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Site Profiling</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {!clicked ? (
                                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                                        Klik peta untuk menilai kelayakan lokasi.
                                    </div>
                                ) : null}

                                {clicked ? (
                                    <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs font-mono text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {clicked.lat.toFixed(5)}, {clicked.lng.toFixed(5)}
                                    </div>
                                ) : null}

                                {!profile && clicked ? (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        Menyusun analisis lokasi...
                                    </div>
                                ) : null}

                                {profile && siteStatus && breakdown && recommendation ? (
                                    <>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl font-semibold"
                                                >
                                                    {Math.round(profile.score)}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-xs text-muted-foreground">Location score</div>
                                                    <Badge variant={badgeVariantFromStatus(siteStatus)}>
                                                        {siteStatus}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="text-right text-xs text-muted-foreground">
                                                Demand radius: <span className="font-medium text-foreground">3 km</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-sm font-medium">Key metrics</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                                    <div className="text-muted-foreground">Demand (3km)</div>
                                                    <div className="font-semibold">
                                                        {Number(profile.demandWithin3km).toFixed(0)}
                                                        <span className="text-muted-foreground"> / month</span>
                                                    </div>
                                                    <div className="mt-0.5 text-muted-foreground">
                                                        Intensity: {demandLabelFromDemandWithin3km(profile.demandWithin3km)}
                                                    </div>
                                                </div>

                                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                                    <div className="text-muted-foreground">Road access</div>
                                                    <div className="font-semibold">
                                                        {profile.roadWidthM > 0
                                                            ? `${Number(profile.roadWidthM).toFixed(1)} m`
                                                            : "No nearby road"}
                                                    </div>
                                                    <div className="mt-0.5 text-muted-foreground">
                                                        Target: 6–7m for trucks
                                                    </div>
                                                </div>

                                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                                    <div className="text-muted-foreground">Nearest warehouse</div>
                                                    <div className="font-semibold">
                                                        {Number(profile.distanceToWarehouseKm).toFixed(1)} km
                                                    </div>
                                                    <div className="mt-0.5 text-muted-foreground">
                                                        {nearestWarehouse ? nearestWarehouse.name : "—"}
                                                    </div>
                                                </div>

                                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                                    <div className="text-muted-foreground">Competition</div>
                                                    <div className="font-semibold">
                                                        {distributorsWithin6Km} distributor(s)
                                                        <span className="text-muted-foreground"> / 6km</span>
                                                    </div>
                                                    <div className="mt-0.5 text-muted-foreground">
                                                        Nearest: {nearestDistributor ? `${nearestDistributor.distanceKm.toFixed(1)} km` : "—"}
                                                    </div>
                                                </div>
                                            </div>

                                            {localDemandIntensity != null ? (
                                                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                                    Local demand intensity (map cell): <span className="font-medium text-foreground">{Math.round(localDemandIntensity)}</span>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-sm font-medium">Score breakdown</div>
                                            <div className="space-y-2">
                                                <ScoreBar label="Demand score" value={breakdown.demandScore} />
                                                <ScoreBar
                                                    label="Road accessibility"
                                                    value={breakdown.roadAccessibilityScore}
                                                />
                                                <ScoreBar
                                                    label="Warehouse proximity"
                                                    value={breakdown.warehouseProximityScore}
                                                />
                                                <ScoreBar
                                                    label="Competition pressure"
                                                    value={breakdown.competitionPressureScore}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-sm font-medium">System recommendation</div>
                                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                                <div className="text-sm font-medium">{recommendation.verdict}</div>
                                                <div className="mt-2 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-muted-foreground">
                                                            Key positives
                                                        </div>
                                                        {recommendation.positives.length ? (
                                                            <ul className="list-disc space-y-0.5 pl-4">
                                                                {recommendation.positives.map((t) => (
                                                                    <li key={t}>{t}</li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <div className="text-muted-foreground">
                                                                No strong positives detected.
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-muted-foreground">
                                                            Key risks
                                                        </div>
                                                        {recommendation.risks.length ? (
                                                            <ul className="list-disc space-y-0.5 pl-4">
                                                                {recommendation.risks.map((t) => (
                                                                    <li key={t}>{t}</li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <div className="text-muted-foreground">
                                                                No major risks detected.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
