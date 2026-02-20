export type LatLng = { lat: number; lng: number };

export type RiskLevel = "Low" | "Medium" | "High";

export type ConflictItem = {
    otherDistributorId: number;
    otherDistributorName: string;
    distanceKm: number;
    overlapAreaKm2: number;
    overlapPct: number;
    severity: RiskLevel;
};

export type ScoreBreakdown = {
    demandDensityScore: number;
    roadAccessibilityScore: number;
    warehouseProximityScore: number;
    overlapPenaltyScore: number;
};

export type OpportunityScoreResult = {
    score: number;
    riskLevel: RiskLevel;
    confidence: RiskLevel;
    breakdown: ScoreBreakdown;
    checklist: {
        supplyReachable: boolean;
        conflictAcceptable: boolean;
        demandSufficient: boolean;
        roadAccessOk: boolean;
    };
    guardrails: {
        tooFarFromWarehouse: boolean;
        highConflict: boolean;
        lowRoadAccess: boolean;
        lowDemand: boolean;
    };
    notes: {
        demandIndexWithinRadius: number;
        warehouseDistanceKm: number | null;
        roadWidthM: number | null;
        cannibalizationPct: number;
        overlapCount: number;
    };
};

export type OpportunityHotspot = {
    id: string;
    center: LatLng;
    score: number;
    sizeDeg: number;
    label: string;
    quadrant: "NE" | "NW" | "SE" | "SW" | "—";
};

export function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function haversineKm(a: LatLng, b: LatLng) {
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

function circleIntersectionAreaKm2(r1: number, r2: number, d: number): number {
    if (r1 <= 0 || r2 <= 0) return 0;
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) {
        const r = Math.min(r1, r2);
        return Math.PI * r * r;
    }

    // Standard circle-circle intersection area.
    const alpha = 2 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
    const beta = 2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    const area1 = 0.5 * r1 * r1 * (alpha - Math.sin(alpha));
    const area2 = 0.5 * r2 * r2 * (beta - Math.sin(beta));
    return area1 + area2;
}

export function severityFromOverlapPct(overlapPct: number): RiskLevel {
    if (overlapPct >= 0.35) return "High";
    if (overlapPct >= 0.15) return "Medium";
    return "Low";
}

export function inferRegionFromName(name: string): string {
    const n = name.toLowerCase();
    const known = [
        "jakarta",
        "bekasi",
        "tangerang",
        "depok",
        "bogor",
        "karawang",
        "cikarang",
        "priok",
        "bandung",
        "surabaya",
    ];
    for (const k of known) {
        if (n.includes(k)) return k[0].toUpperCase() + k.slice(1);
    }
    return "Unknown";
}

export function opportunityColor(score0to100: number) {
    const t = clamp(score0to100 / 100, 0, 1);
    const fillOpacity = 0.12 + 0.55 * t;
    const strokeOpacity = 0.25 + 0.55 * t;
    return {
        fillColor: `rgba(37, 99, 235, ${fillOpacity})`,
        strokeColor: `rgba(37, 99, 235, ${strokeOpacity})`,
    };
}

export function conflictColor(overlapPct: number) {
    const t = clamp(overlapPct, 0, 1);
    const fillOpacity = 0.08 + 0.55 * t;
    const strokeOpacity = 0.2 + 0.55 * t;
    return {
        fillColor: `rgba(220, 38, 38, ${fillOpacity})`,
        strokeColor: `rgba(220, 38, 38, ${strokeOpacity})`,
    };
}

export function computeCoverageAreaKm2(radiusKm: number) {
    return Math.PI * radiusKm * radiusKm;
}

export function nearestWarehouseDistanceKm(input: {
    center: LatLng;
    warehouses: Array<{ lat: number; lng: number; name: string }>;
}) {
    if (input.warehouses.length === 0) return null;
    let bestKm = Infinity;
    let best: { lat: number; lng: number; name: string } | null = null;
    for (const wh of input.warehouses) {
        const km = haversineKm(input.center, { lat: wh.lat, lng: wh.lng });
        if (km < bestKm) {
            bestKm = km;
            best = wh;
        }
    }
    return best ? { km: bestKm, warehouse: best } : null;
}

export function demandIndexWithinRadius(input: {
    center: LatLng;
    radiusKm: number;
    cells: Array<{ centerLat: number; centerLng: number; score: number }>;
}) {
    if (!input.cells.length || input.radiusKm <= 0) return 0;
    let sum = 0;
    let count = 0;
    for (const c of input.cells) {
        const km = haversineKm(input.center, { lat: c.centerLat, lng: c.centerLng });
        if (km <= input.radiusKm) {
            sum += c.score;
            count += 1;
        }
    }
    if (count === 0) return 0;
    return sum / count;
}

export function scoreFromRoadWidthM(widthM: number | null): number {
    if (widthM == null) return 45;
    if (widthM >= 7) return 90;
    if (widthM >= 6) return 78;
    if (widthM >= 5) return 62;
    if (widthM > 0) return 42;
    return 35;
}

export function scoreFromWarehouseDistanceKm(distanceKm: number | null): number {
    if (distanceKm == null) return 55;
    if (distanceKm <= 10) return 92;
    if (distanceKm <= 20) return 80;
    if (distanceKm <= 35) return 65;
    if (distanceKm <= 50) return 52;
    return 40;
}

export function computeConflicts(input: {
    selectedDistributorId: number;
    selectedCenter: LatLng;
    selectedRadiusKm: number;
    distributors: Array<{
        id: number;
        name: string;
        lat: number;
        lng: number;
        serviceRadiusKm?: number;
    }>;
}) {
    const conflicts: ConflictItem[] = [];
    const selectedArea = computeCoverageAreaKm2(input.selectedRadiusKm);
    for (const d of input.distributors) {
        if (d.id === input.selectedDistributorId) continue;
        const otherRadius = Number(d.serviceRadiusKm ?? 15);
        const distanceKm = haversineKm(input.selectedCenter, { lat: d.lat, lng: d.lng });
        const overlapAreaKm2 = circleIntersectionAreaKm2(input.selectedRadiusKm, otherRadius, distanceKm);
        if (overlapAreaKm2 <= 0) continue;
        const overlapPct = selectedArea > 0 ? overlapAreaKm2 / selectedArea : 0;
        conflicts.push({
            otherDistributorId: d.id,
            otherDistributorName: d.name,
            distanceKm,
            overlapAreaKm2,
            overlapPct,
            severity: severityFromOverlapPct(overlapPct),
        });
    }

    conflicts.sort((a, b) => b.overlapPct - a.overlapPct);
    return conflicts;
}

export function computeCannibalizationPct(conflicts: ConflictItem[]): number {
    // Sum overlap % is an approximation (overlaps can stack).
    const total = conflicts.reduce((acc, c) => acc + c.overlapPct, 0);
    return clamp(total, 0, 1) * 100;
}

export function computeOpportunityScore(input: {
    center: LatLng;
    radiusKm: number;
    selectedDistributorId: number;
    distributors: Array<{ id: number; name: string; lat: number; lng: number; serviceRadiusKm?: number }>;
    warehouses: Array<{ name: string; lat: number; lng: number }>;
    cells: Array<{ centerLat: number; centerLng: number; score: number }>;
    roadWidthM: number | null;
}) {
    const demandIndex = demandIndexWithinRadius({
        center: input.center,
        radiusKm: input.radiusKm,
        cells: input.cells,
    });

    const demandDensityScore = clamp(demandIndex, 0, 100);

    const nearestWh = nearestWarehouseDistanceKm({ center: input.center, warehouses: input.warehouses });
    const warehouseDistanceKm = nearestWh?.km ?? null;
    const warehouseProximityScore = scoreFromWarehouseDistanceKm(warehouseDistanceKm);

    const roadAccessibilityScore = scoreFromRoadWidthM(input.roadWidthM);

    const conflicts = computeConflicts({
        selectedDistributorId: input.selectedDistributorId,
        selectedCenter: input.center,
        selectedRadiusKm: input.radiusKm,
        distributors: input.distributors,
    });

    const cannibalizationPct = computeCannibalizationPct(conflicts);

    // Convert penalty to a 0..100 score where higher is better.
    // 0% overlap -> 100 score, 60% overlap -> 40 score.
    const overlapPenaltyScore = clamp(100 - cannibalizationPct, 0, 100);

    // Weighted composite.
    const score = clamp(
        0.4 * demandDensityScore +
        0.2 * roadAccessibilityScore +
        0.2 * warehouseProximityScore +
        0.2 * overlapPenaltyScore,
        0,
        100,
    );

    const riskLevel: RiskLevel =
        score >= 75 ? "Low" : score >= 55 ? "Medium" : "High";

    const confidenceFactors = [
        input.cells.length > 0,
        input.warehouses.length > 0,
        input.roadWidthM != null,
        input.distributors.length > 0,
    ].filter(Boolean).length;
    const confidence: RiskLevel =
        confidenceFactors >= 4 ? "Low" : confidenceFactors >= 3 ? "Medium" : "High";

    const tooFarFromWarehouse = warehouseDistanceKm != null && warehouseDistanceKm > 40;
    const highConflict = cannibalizationPct >= 35;
    const lowRoadAccess = roadAccessibilityScore < 50;
    const lowDemand = demandDensityScore < 55;

    const checklist = {
        supplyReachable: !tooFarFromWarehouse,
        conflictAcceptable: !highConflict,
        demandSufficient: !lowDemand,
        roadAccessOk: !lowRoadAccess,
    };

    return {
        score,
        riskLevel,
        confidence,
        breakdown: {
            demandDensityScore,
            roadAccessibilityScore,
            warehouseProximityScore,
            overlapPenaltyScore,
        },
        checklist,
        guardrails: {
            tooFarFromWarehouse,
            highConflict,
            lowRoadAccess,
            lowDemand,
        },
        notes: {
            demandIndexWithinRadius: demandIndex,
            warehouseDistanceKm,
            roadWidthM: input.roadWidthM,
            cannibalizationPct,
            overlapCount: conflicts.length,
        },
    } satisfies OpportunityScoreResult;
}

export function computeHotspots(input: {
    whitespace: Array<{ centerLat: number; centerLng: number; size: number; score: number }>;
    reference?: LatLng;
}) {
    const top = [...input.whitespace]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((h, idx) => {
            const center = { lat: h.centerLat, lng: h.centerLng };
            let quadrant: OpportunityHotspot["quadrant"] = "—";
            if (input.reference) {
                const dLat = center.lat - input.reference.lat;
                const dLng = center.lng - input.reference.lng;
                quadrant = dLat >= 0 && dLng >= 0 ? "NE" : dLat >= 0 ? "NW" : dLng >= 0 ? "SE" : "SW";
            }
            return {
                id: `${idx}:${h.centerLat.toFixed(4)}:${h.centerLng.toFixed(4)}`,
                center,
                score: clamp(h.score, 0, 100),
                sizeDeg: h.size,
                label: `Hotspot ${idx + 1}`,
                quadrant,
            } satisfies OpportunityHotspot;
        });

    return top;
}

export function directionSummary(hotspots: OpportunityHotspot[]): string {
    const counts: Record<string, number> = {};
    for (const h of hotspots) {
        if (h.quadrant === "—") continue;
        counts[h.quadrant] = (counts[h.quadrant] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) return "No clear directional signal from hotspots.";

    const label =
        best === "NE"
            ? "North-East"
            : best === "NW"
                ? "North-West"
                : best === "SE"
                    ? "South-East"
                    : "South-West";

    return `${label} quadrant shows the strongest unmet demand concentration.`;
}
