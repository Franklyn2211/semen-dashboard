"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { LatLng } from "./expansion-scoring";
import {
    computeCannibalizationPct,
    computeConflicts,
    computeCoverageAreaKm2,
    computeHotspots,
    computeOpportunityScore,
    directionSummary,
    haversineKm,
    inferRegionFromName,
    nearestWarehouseDistanceKm,
    severityFromOverlapPct,
} from "./expansion-scoring";

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
    roadWidthM: number;
};

function TogglePill({
    label,
    pressed,
    onPressedChange,
}: {
    label: string;
    pressed: boolean;
    onPressedChange: (next: boolean) => void;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant={pressed ? "default" : "outline"}
            onClick={() => onPressedChange(!pressed)}
        >
            {label}
        </Button>
    );
}

function formatKm(km: number | null) {
    if (km == null) return "—";
    if (!Number.isFinite(km)) return "—";
    return `${km.toFixed(1)} km`;
}

function formatPct(p: number) {
    if (!Number.isFinite(p)) return "—";
    return `${Math.round(p)}%`;
}

function badgeVariantForRisk(risk: "Low" | "Medium" | "High") {
    if (risk === "Low") return "success";
    if (risk === "High") return "danger";
    return "warning";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
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

export function ExpansionAnalysisDashboard({
    bbox,
    setBbox,
    cells,
    cellsLoading,
    whitespace,
    whitespaceLoading,
    setWhitespaceOn,
    warehouses,
    distributors,
}: {
    bbox: string;
    setBbox: (bbox: string) => void;
    cells: HeatCell[];
    cellsLoading: boolean;
    whitespace: WhitespaceArea[];
    whitespaceLoading: boolean;
    setWhitespaceOn: (next: boolean) => void;
    warehouses: LogisticsEntity[];
    distributors: LogisticsEntity[];
}) {
    const [selectedDistributorId, setSelectedDistributorId] = useState<number | null>(null);
    const [radiusKm, setRadiusKm] = useState<number>(15);

    const [showDemand, setShowDemand] = useState(true);
    const [showWhitespace, setShowWhitespace] = useState(false);
    const [showConflicts, setShowConflicts] = useState(true);
    const [showWarehouses, setShowWarehouses] = useState(true);

    const [mode, setMode] = useState<"analyze" | "simulate">("analyze");
    const [candidate, setCandidate] = useState<LatLng | null>(null);

    const [selectedRoadWidthM, setSelectedRoadWidthM] = useState<number | null>(null);
    const [candidateRoadWidthM, setCandidateRoadWidthM] = useState<number | null>(null);

    const [profileLoading, setProfileLoading] = useState(false);

    const distributorOptions = useMemo(() => {
        return distributors.map((d) => ({ value: String(d.id), label: d.name }));
    }, [distributors]);

    const selectedDistributor = useMemo(() => {
        if (selectedDistributorId == null) return null;
        return distributors.find((d) => d.id === selectedDistributorId) ?? null;
    }, [distributors, selectedDistributorId]);

    useEffect(() => {
        if (selectedDistributorId == null && distributors.length) {
            setSelectedDistributorId(distributors[0]?.id ?? null);
        }
    }, [distributors, selectedDistributorId]);

    useEffect(() => {
        if (mode === "analyze") {
            setCandidate(null);
        }
    }, [mode]);

    useEffect(() => {
        const want = showWhitespace;
        setWhitespaceOn(want);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showWhitespace]);

    const analysisPoint = useMemo(() => {
        if (mode === "simulate") return candidate;
        return selectedDistributor ? { lat: selectedDistributor.lat, lng: selectedDistributor.lng } : null;
    }, [mode, candidate, selectedDistributor]);

    const selectedPoint = useMemo(() => {
        return selectedDistributor ? ({ lat: selectedDistributor.lat, lng: selectedDistributor.lng } satisfies LatLng) : null;
    }, [selectedDistributor]);

    // Fetch road accessibility for selected distributor + candidate (if any)
    useEffect(() => {
        let cancelled = false;
        async function loadProfile(point: LatLng, setter: (v: number | null) => void) {
            setProfileLoading(true);
            try {
                const res = await fetch(`/api/planning/site-profile?lat=${point.lat}&lng=${point.lng}`);
                if (!res.ok) {
                    if (!cancelled) setter(null);
                    return;
                }
                const data = (await res.json()) as Partial<SiteProfile>;
                if (!cancelled) setter(typeof data.roadWidthM === "number" ? data.roadWidthM : null);
            } catch {
                if (!cancelled) setter(null);
            } finally {
                if (!cancelled) setProfileLoading(false);
            }
        }

        if (selectedPoint) void loadProfile(selectedPoint, setSelectedRoadWidthM);
        else setSelectedRoadWidthM(null);

        if (candidate) void loadProfile(candidate, setCandidateRoadWidthM);
        else setCandidateRoadWidthM(null);

        return () => {
            cancelled = true;
        };
    }, [selectedPoint, candidate]);

    const conflicts = useMemo(() => {
        if (!analysisPoint || selectedDistributorId == null) return [];
        return computeConflicts({
            selectedDistributorId,
            selectedCenter: analysisPoint,
            selectedRadiusKm: radiusKm,
            distributors,
        });
    }, [analysisPoint, radiusKm, distributors, selectedDistributorId]);

    const cannibalizationPct = useMemo(() => computeCannibalizationPct(conflicts), [conflicts]);

    const topCompetitor = conflicts[0] ?? null;

    const hotspots = useMemo(() => {
        return computeHotspots({ whitespace, reference: analysisPoint ?? undefined });
    }, [whitespace, analysisPoint]);

    const bestHotspotScore = hotspots[0]?.score ?? 0;

    const suggestedDirection = useMemo(() => directionSummary(hotspots), [hotspots]);

    const nearestWarehouse = useMemo(() => {
        if (!analysisPoint) return null;
        return nearestWarehouseDistanceKm({ center: analysisPoint, warehouses });
    }, [analysisPoint, warehouses]);

    const warehouseLine = useMemo(() => {
        if (!analysisPoint || !nearestWarehouse) return null;
        return {
            from: analysisPoint,
            to: { lat: nearestWarehouse.warehouse.lat, lng: nearestWarehouse.warehouse.lng },
        };
    }, [analysisPoint, nearestWarehouse]);

    const conflictOverlays = useMemo(() => {
        if (!analysisPoint || selectedDistributorId == null) return [];
        return conflicts
            .map((c) => {
                const other = distributors.find((d) => d.id === c.otherDistributorId);
                if (!other) return null;
                return {
                    id: c.otherDistributorId,
                    name: c.otherDistributorName,
                    lat: other.lat,
                    lng: other.lng,
                    radiusKm: Number(other.serviceRadiusKm ?? 15),
                    distanceKm: c.distanceKm,
                    overlapPct: c.overlapPct,
                    severity: c.severity,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
    }, [analysisPoint, selectedDistributorId, conflicts, distributors]);

    const opportunityTiles = useMemo(() => {
        if (!showWhitespace) return [];
        return whitespace.map((w, idx) => ({
            id: `ws:${idx}:${w.cellLat}:${w.cellLng}`,
            centerLat: w.centerLat,
            centerLng: w.centerLng,
            size: w.size,
            score: w.score,
        }));
    }, [showWhitespace, whitespace]);

    const selectedScore = useMemo(() => {
        if (!selectedPoint || selectedDistributorId == null) return null;
        return computeOpportunityScore({
            center: selectedPoint,
            radiusKm,
            selectedDistributorId,
            distributors,
            warehouses,
            cells,
            roadWidthM: selectedRoadWidthM,
        });
    }, [selectedPoint, selectedDistributorId, radiusKm, distributors, warehouses, cells, selectedRoadWidthM]);

    const candidateScore = useMemo(() => {
        if (!candidate || selectedDistributorId == null) return null;
        return computeOpportunityScore({
            center: candidate,
            radiusKm,
            selectedDistributorId,
            distributors,
            warehouses,
            cells,
            roadWidthM: candidateRoadWidthM,
        });
    }, [candidate, selectedDistributorId, radiusKm, distributors, warehouses, cells, candidateRoadWidthM]);

    const activeScore = mode === "simulate" ? candidateScore : selectedScore;

    const selectedRegion = selectedDistributor ? inferRegionFromName(selectedDistributor.name) : "—";

    const coverageAreaKm2 = useMemo(() => computeCoverageAreaKm2(radiusKm), [radiusKm]);

    const demandIndex = useMemo(() => {
        if (!analysisPoint) return 0;
        // Use the same demand computation used by scoring (average heat cell score inside radius).
        let sum = 0;
        let count = 0;
        for (const c of cells) {
            if (haversineKm(analysisPoint, { lat: c.centerLat, lng: c.centerLng }) <= radiusKm) {
                sum += c.score;
                count += 1;
            }
        }
        return count ? sum / count : 0;
    }, [analysisPoint, cells, radiusKm]);

    const recommendation = useMemo(() => {
        if (!activeScore) return null;
        const score = activeScore.score;
        const verdict = score >= 75 ? "Recommended" : score >= 55 ? "Consider with caution" : "Not recommended";

        const reasons: string[] = [];
        if (activeScore.breakdown.demandDensityScore >= 70) reasons.push("Strong demand density within selected radius");
        else if (activeScore.breakdown.demandDensityScore < 55) reasons.push("Demand within radius looks limited");

        if (activeScore.breakdown.warehouseProximityScore >= 70) reasons.push("Supply chain distance is within a practical range");
        else if (activeScore.guardrails.tooFarFromWarehouse) reasons.push("Too far from nearest warehouse (delivery risk)");

        if (activeScore.breakdown.overlapPenaltyScore >= 70) reasons.push("Low cannibalization pressure from nearby distributors");
        else if (activeScore.guardrails.highConflict) reasons.push("High overlap with existing distributor catchments");

        if (activeScore.breakdown.roadAccessibilityScore >= 62) reasons.push("Road access supports truck operations");
        else if (activeScore.guardrails.lowRoadAccess) reasons.push("Road accessibility may constrain heavy transport");

        const warning = activeScore.guardrails.highConflict
            ? "Risk: High conflict severity may cause cannibalization."
            : activeScore.guardrails.tooFarFromWarehouse
                ? "Risk: Warehouse distance may increase fulfillment cost."
                : activeScore.guardrails.lowDemand
                    ? "Risk: Demand may be insufficient to justify expansion."
                    : null;

        return {
            verdict,
            reasons: reasons.slice(0, 3),
            warning,
        };
    }, [activeScore]);

    function exportSummaryCsv() {
        const rows: string[][] = [];
        rows.push(["Metric", "Value"]);
        rows.push(["Distributor", selectedDistributor?.name ?? "—"]);
        rows.push(["Mode", mode === "simulate" ? "Simulate new distributor" : "Analyze existing distributor"]);
        rows.push(["RadiusKm", String(radiusKm)]);
        rows.push(["OpportunityScore", activeScore ? String(Math.round(activeScore.score)) : "—"]);
        rows.push(["RiskLevel", activeScore ? activeScore.riskLevel : "—"]);
        rows.push(["DemandIndexWithinRadius", String(Math.round(demandIndex))]);
        rows.push(["NearestWarehouseDistanceKm", formatKm(nearestWarehouse?.km ?? null)]);
        rows.push(["CannibalizationPct", formatPct(cannibalizationPct)]);
        rows.push(["HotspotCount", String(hotspots.length)]);

        rows.push([]);
        rows.push(["Hotspot", "Lat", "Lng", "Score", "Quadrant"]);
        for (const h of hotspots) {
            rows.push([h.label, h.center.lat.toFixed(5), h.center.lng.toFixed(5), String(Math.round(h.score)), h.quadrant]);
        }

        rows.push([]);
        rows.push(["Conflict", "Competitor", "OverlapPct", "Severity", "DistanceKm"]);
        for (const c of conflicts.slice(0, 10)) {
            rows.push([
                `D-${c.otherDistributorId}`,
                c.otherDistributorName,
                `${Math.round(c.overlapPct * 100)}%`,
                c.severity,
                c.distanceKm.toFixed(1),
            ]);
        }

        const csv = rows
            .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `expansion-summary-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const panelBusy = cellsLoading || whitespaceLoading || profileLoading;

    return (
        <div className="space-y-5">
            {/* Top Controls */}
            <Card className="rounded-2xl">
                <CardContent className="py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">Distributor</div>
                                <Select
                                    value={selectedDistributorId != null ? String(selectedDistributorId) : ""}
                                    onValueChange={(v) => setSelectedDistributorId(v ? Number(v) : null)}
                                    options={
                                        distributorOptions.length
                                            ? distributorOptions
                                            : [{ value: "", label: "No distributors available", disabled: true }]
                                    }
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">Radius</div>
                                <Select
                                    value={String(radiusKm)}
                                    onValueChange={(v) => setRadiusKm(Number(v))}
                                    options={[5, 10, 15, 20].map((r) => ({ value: String(r), label: `${r} km` }))}
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">Mode</div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant={mode === "analyze" ? "default" : "outline"}
                                        onClick={() => setMode("analyze")}
                                    >
                                        Analyze existing
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={mode === "simulate" ? "default" : "outline"}
                                        onClick={() => setMode("simulate")}
                                    >
                                        Simulate new
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <TogglePill label="Show Demand" pressed={showDemand} onPressedChange={setShowDemand} />
                            <TogglePill
                                label="Show Whitespace"
                                pressed={showWhitespace}
                                onPressedChange={setShowWhitespace}
                            />
                            <TogglePill
                                label="Show Conflicts"
                                pressed={showConflicts}
                                onPressedChange={setShowConflicts}
                            />
                            <TogglePill
                                label="Show Warehouses"
                                pressed={showWarehouses}
                                onPressedChange={setShowWarehouses}
                            />
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="text-xs text-muted-foreground">Bounding Box</div>
                        <input
                            className="h-8 w-[260px] rounded-lg border border-input bg-white px-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                            value={bbox}
                            onChange={(e) => setBbox(e.target.value)}
                        />
                        <div className="flex-1" />
                        <div className="text-xs text-muted-foreground">
                            {mode === "simulate"
                                ? candidate
                                    ? "Click map again to move candidate"
                                    : "Click map to place a candidate point"
                                : "Pan/zoom map to update analysis area"}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Main: Map + Decision Panel */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card className="rounded-2xl">
                    <CardHeader>
                        <div className="space-y-1">
                            <CardTitle>Expansion Smart Map</CardTitle>
                            <div className="text-xs text-muted-foreground">
                                Opportunity (whitespace), conflict overlaps, and supply-chain context.
                            </div>
                        </div>
                        <Badge variant="secondary">Decision layers</Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="relative h-[560px] overflow-hidden rounded-xl border border-border">
                            <PlanningMap
                                cells={cells}
                                whitespace={[]}
                                opportunities={opportunityTiles}
                                conflictOverlays={showConflicts ? conflictOverlays : []}
                                showDemandSurface={showDemand}
                                showOpportunities={showWhitespace}
                                showConflicts={showConflicts}
                                showWarehouses={showWarehouses}
                                highlightDistributorId={selectedDistributorId}
                                onBBoxChange={setBbox}
                                onMapClick={(lat: number, lng: number) => {
                                    if (mode !== "simulate") return;
                                    setCandidate({ lat, lng });
                                }}
                                catchment={null}
                                candidate={analysisPoint}
                                candidateRadiusKm={radiusKm}
                                candidateColor={mode === "simulate" ? "purple" : "blue"}
                                warehouses={showWarehouses ? warehouses : []}
                                distributors={distributors}
                                warehouseLine={warehouseLine}
                                legendVariant="expansion"
                                legendState={{
                                    showOpportunities: showWhitespace,
                                    showConflicts: showConflicts,
                                }}
                                showResetControl
                                showScaleControl
                            />
                            {cellsLoading || whitespaceLoading ? (
                                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/35">
                                    <div className="rounded-lg border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                                        Loading map layers…
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card className="rounded-2xl">
                        <CardContent className="py-5">
                            {!selectedDistributor ? (
                                <div className="text-sm text-muted-foreground">No distributor selected.</div>
                            ) : (
                                <div className={cn(panelBusy ? "animate-pulse" : "")}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                Opportunity Score
                                            </div>
                                            <div className="text-3xl font-semibold leading-none text-foreground">
                                                {activeScore ? Math.round(activeScore.score) : "—"}
                                            </div>
                                            <div className="text-xs text-muted-foreground">0–100 composite</div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <Badge variant={activeScore ? badgeVariantForRisk(activeScore.riskLevel) : "secondary"}>
                                                {activeScore ? `${activeScore.riskLevel} Risk` : "—"}
                                            </Badge>
                                            <Badge variant={activeScore ? badgeVariantForRisk(activeScore.confidence) : "secondary"}>
                                                {activeScore ? `${activeScore.confidence} Confidence` : "—"}
                                            </Badge>
                                        </div>
                                    </div>

                                    {activeScore ? (
                                        <div className="mt-4 space-y-2">
                                            <ScoreBar label="Nearby demand density" value={activeScore.breakdown.demandDensityScore} />
                                            <ScoreBar label="Road accessibility" value={activeScore.breakdown.roadAccessibilityScore} />
                                            <ScoreBar label="Warehouse proximity" value={activeScore.breakdown.warehouseProximityScore} />
                                            <ScoreBar label="Overlap / cannibalization" value={activeScore.breakdown.overlapPenaltyScore} />
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* A) Selected Distributor Card */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Selected Distributor</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("space-y-3", panelBusy ? "animate-pulse" : "")}>
                            {selectedDistributor ? (
                                <>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold">{selectedDistributor.name}</div>
                                            <div className="text-xs text-muted-foreground">Region: {selectedRegion}</div>
                                        </div>
                                        <Badge variant="secondary">{radiusKm} km</Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-md bg-muted/60 px-2 py-2">
                                            <div className="text-muted-foreground">Coverage area</div>
                                            <div className="font-semibold">{coverageAreaKm2.toFixed(0)} km²</div>
                                        </div>
                                        <div className="rounded-md bg-muted/60 px-2 py-2">
                                            <div className="text-muted-foreground">Demand within radius</div>
                                            <div className="font-semibold">Index {Math.round(demandIndex)} / 100</div>
                                        </div>
                                        <div className="col-span-2 rounded-md bg-muted/60 px-2 py-2">
                                            <div className="text-muted-foreground">Nearest warehouse</div>
                                            <div className="flex items-center justify-between">
                                                <div className="font-semibold">
                                                    {nearestWarehouse ? nearestWarehouse.warehouse.name : "—"}
                                                </div>
                                                <div className="text-muted-foreground">{formatKm(nearestWarehouse?.km ?? null)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-muted-foreground">Select a distributor to begin.</div>
                            )}
                        </CardContent>
                    </Card>

                    {/* B) Conflict Summary Card */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Conflict Summary</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("space-y-3", panelBusy ? "animate-pulse" : "")}>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                    <div className="text-muted-foreground">Overlap count</div>
                                    <div className="font-semibold">{conflicts.length}</div>
                                </div>
                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                    <div className="text-muted-foreground">Estimated cannibalization</div>
                                    <div className="font-semibold">{formatPct(cannibalizationPct)}</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                                <div className="text-muted-foreground">Risk level</div>
                                <Badge
                                    variant={badgeVariantForRisk(severityFromOverlapPct(cannibalizationPct / 100))}
                                >
                                    {severityFromOverlapPct(cannibalizationPct / 100)}
                                </Badge>
                            </div>

                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                                <div className="text-muted-foreground">Top competing distributor</div>
                                <div className="mt-0.5 flex items-center justify-between">
                                    <div className="font-medium">{topCompetitor ? topCompetitor.otherDistributorName : "—"}</div>
                                    <div className="text-muted-foreground">
                                        {topCompetitor ? `${Math.round(topCompetitor.overlapPct * 100)}% overlap` : ""}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* C) Whitespace / Opportunity Card */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Whitespace Opportunity</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("space-y-3", panelBusy ? "animate-pulse" : "")}>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                    <div className="text-muted-foreground">Hotspot count</div>
                                    <div className="font-semibold">{hotspots.length}</div>
                                </div>
                                <div className="rounded-md bg-muted/60 px-2 py-2">
                                    <div className="text-muted-foreground">Best hotspot score</div>
                                    <div className="font-semibold">{Math.round(bestHotspotScore)}</div>
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                                <div className="text-muted-foreground">Suggested expansion direction</div>
                                <div className="mt-0.5 font-medium text-foreground">{suggestedDirection}</div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* D) Recommendation Card */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Recommendation</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("space-y-3", panelBusy ? "animate-pulse" : "")}>
                            {recommendation ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold">{recommendation.verdict}</div>
                                        {activeScore ? (
                                            <Badge variant={badgeVariantForRisk(activeScore.riskLevel)}>
                                                {activeScore.riskLevel} Risk
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <ul className="list-disc space-y-1 pl-4 text-sm">
                                        {recommendation.reasons.map((r) => (
                                            <li key={r}>{r}</li>
                                        ))}
                                    </ul>
                                    {recommendation.warning ? (
                                        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                            {recommendation.warning}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <div className="text-sm text-muted-foreground">Select a distributor to generate recommendations.</div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Decision Checklist */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Decision Checklist</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("space-y-2", panelBusy ? "animate-pulse" : "")}>
                            {activeScore ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                                        <span>Supply reachable?</span>
                                        <Badge variant={activeScore.checklist.supplyReachable ? "success" : "danger"}>
                                            {activeScore.checklist.supplyReachable ? "Yes" : "No"}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                                        <span>Conflict acceptable?</span>
                                        <Badge variant={activeScore.checklist.conflictAcceptable ? "success" : "danger"}>
                                            {activeScore.checklist.conflictAcceptable ? "Yes" : "No"}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                                        <span>Demand sufficient?</span>
                                        <Badge variant={activeScore.checklist.demandSufficient ? "success" : "danger"}>
                                            {activeScore.checklist.demandSufficient ? "Yes" : "No"}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                                        <span>Road access OK?</span>
                                        <Badge variant={activeScore.checklist.roadAccessOk ? "success" : "danger"}>
                                            {activeScore.checklist.roadAccessOk ? "Yes" : "No"}
                                        </Badge>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">Checklist will appear once a point is analyzed.</div>
                            )}
                        </CardContent>
                    </Card>

                    {mode === "simulate" ? (
                        <Card className="rounded-2xl">
                            <CardHeader>
                                <CardTitle>Compare vs Selected</CardTitle>
                            </CardHeader>
                            <CardContent className={cn("space-y-2", panelBusy ? "animate-pulse" : "")}>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-md bg-muted/60 px-2 py-2">
                                        <div className="text-muted-foreground">Selected score</div>
                                        <div className="font-semibold">{selectedScore ? Math.round(selectedScore.score) : "—"}</div>
                                    </div>
                                    <div className="rounded-md bg-muted/60 px-2 py-2">
                                        <div className="text-muted-foreground">Candidate score</div>
                                        <div className="font-semibold">{candidateScore ? Math.round(candidateScore.score) : "—"}</div>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Candidate updates when you click the map.
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>

            {/* Bottom: Ranking + Conflicts + Export */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Opportunity Hotspots</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {hotspots.length ? (
                            hotspots.map((h) => (
                                <div key={h.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                                    <div>
                                        <div className="font-medium">{h.label}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {h.center.lat.toFixed(4)}, {h.center.lng.toFixed(4)} · {h.quadrant}
                                        </div>
                                    </div>
                                    <Badge variant="secondary">{Math.round(h.score)}</Badge>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                Enable Show Whitespace to load opportunities.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Top Conflicts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {conflicts.length ? (
                            conflicts.slice(0, 5).map((c) => (
                                <div key={c.otherDistributorId} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 truncate font-medium">{c.otherDistributorName}</div>
                                        <Badge variant={badgeVariantForRisk(c.severity)}>{c.severity}</Badge>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{Math.round(c.overlapPct * 100)}% overlap</span>
                                        <span>{c.distanceKm.toFixed(1)} km</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-muted-foreground">No overlaps detected for the selected radius.</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Export / Share</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                            <Button variant="outline" onClick={exportSummaryCsv}>
                                Export Summary (CSV)
                            </Button>
                            <Button variant="outline" disabled>
                                Download Snapshot (PNG)
                                <Badge variant="secondary" className="ml-1">Soon</Badge>
                            </Button>
                            <Button variant="outline" disabled>
                                Generate Report (PDF)
                                <Badge variant="secondary" className="ml-1">Soon</Badge>
                            </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Exports are client-side and contain only summary metrics (no raw JSON).
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
