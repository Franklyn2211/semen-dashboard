import type {
    DemandPoint,
    Distributor,
    LatLng,
    MonthlyDemand,
    Project,
    ProjectDensity,
    RegionComparison,
    RiskLevel,
    SalesCorrelation,
    SiteScore,
    Warehouse,
} from "./types";

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
    return (value * Math.PI) / 180;
}

export function distanceKm(a: LatLng, b: LatLng) {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const hav =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
    return 6371 * c;
}

export function nearestDistanceKm(point: LatLng, list: LatLng[]): number {
    if (!list.length) return Number.POSITIVE_INFINITY;
    return Math.min(...list.map((item) => distanceKm(point, item)));
}

export function averageNearestDistance(points: LatLng[], targets: LatLng[]): number {
    if (!points.length || !targets.length) return 0;
    const total = points.reduce((sum, point) => sum + nearestDistanceKm(point, targets), 0);
    return total / points.length;
}

export function sumDemandWithinKm(point: LatLng, demandPoints: DemandPoint[], radiusKm: number): number {
    return demandPoints.reduce((sum, p) => {
        if (distanceKm(point, p) <= radiusKm) return sum + p.intensity;
        return sum;
    }, 0);
}

function averageDemandWithinKm(point: LatLng, demandPoints: DemandPoint[], radiusKm: number): number {
    const local = demandPoints.filter((p) => distanceKm(point, p) <= radiusKm);
    if (!local.length) return 0;
    const total = local.reduce((sum, p) => sum + p.intensity, 0);
    return total / local.length;
}

function riskFromDistance(distance: number, high: number, medium: number): RiskLevel {
    if (distance <= high) return "high";
    if (distance <= medium) return "medium";
    return "low";
}

export function isCoveredByDistributors(point: LatLng, distributors: Distributor[]): boolean {
    return distributors.some((d) => distanceKm(point, d) <= d.coverageKm);
}

type ScoreInput = {
    demandPoints: DemandPoint[];
    distributors: Distributor[];
    warehouses: Warehouse[];
    projects: Project[];
    majorRoads: LatLng[];
};

export function scoreSiteCandidate(point: LatLng, input: ScoreInput): SiteScore {
    const demandScore = clamp(
        Math.round(averageDemandWithinKm(point, input.demandPoints, 6)),
        0,
        100,
    );
    const demandWithin3 = sumDemandWithinKm(point, input.demandPoints, 3);

    const distanceToProjectKm = nearestDistanceKm(point, input.projects);
    const distanceToDistributorKm = nearestDistanceKm(point, input.distributors);
    const distanceToWarehouseKm = nearestDistanceKm(point, input.warehouses);
    const distanceToRoadKm = nearestDistanceKm(point, input.majorRoads);

    const bonusNearProject = distanceToProjectKm <= 3 ? 12 : distanceToProjectKm <= 6 ? 6 : 0;
    const bonusRoad = distanceToRoadKm <= 1.5 ? 6 : 0;
    const penaltyOverlap =
        distanceToDistributorKm <= 4 ? 18 : distanceToDistributorKm <= 7 ? 8 : 0;
    const penaltyRoad = distanceToRoadKm >= 3 ? 10 : distanceToRoadKm >= 2 ? 6 : 0;

    const score = clamp(
        Math.round(45 + demandScore * 0.55 + bonusNearProject + bonusRoad - penaltyOverlap - penaltyRoad),
        0,
        100,
    );

    const overlapDistributor = riskFromDistance(distanceToDistributorKm, 4, 7);
    const nearWarehouse = riskFromDistance(distanceToWarehouseKm, 5, 8);

    let cannibalization: RiskLevel = "low";
    if (overlapDistributor === "high" && demandScore < 60) cannibalization = "high";
    else if (overlapDistributor !== "low" || demandScore < 50) cannibalization = "medium";

    const highRisk =
        overlapDistributor === "high" || nearWarehouse === "high" || cannibalization === "high";

    let recommendation: SiteScore["recommendation"] = "Not Recommended";
    if (score >= 75 && !highRisk) recommendation = "Highly Recommended";
    else if (score >= 55) recommendation = "Moderate";

    const potentialSales = Math.round(demandWithin3 * 12 + demandScore * 8);

    const residentialDensity =
        demandScore >= 70 ? "High" : demandScore >= 50 ? "Medium" : "Low";

    const truckAccess = distanceToRoadKm <= 1.5 ? "Yes" : "No";

    return {
        score,
        recommendation,
        demandScore,
        metrics: {
            distanceToRoadKm,
            distanceToProjectKm,
            distanceToDistributorKm,
            distanceToWarehouseKm,
            potentialSales,
            truckAccess,
            residentialDensity,
        },
        risks: {
            overlapDistributor,
            nearWarehouse,
            cannibalization,
        },
    };
}

type InsightInput = {
    demandTrend: MonthlyDemand[];
    regionalComparison: RegionComparison[];
    projectDensity: ProjectDensity[];
    salesCorrelation: SalesCorrelation[];
};

export function buildInsights(input: InsightInput): string[] {
    const insights: string[] = [];

    if (input.demandTrend.length >= 2) {
        const last = input.demandTrend[input.demandTrend.length - 1];
        const sixAgo = input.demandTrend[input.demandTrend.length - 7] ?? input.demandTrend[0];
        const change =
            sixAgo && sixAgo.demand
                ? Math.round(((last.demand - sixAgo.demand) / sixAgo.demand) * 100)
                : 0;
        const trend = change >= 0 ? "up" : "down";
        insights.push(`Demand is ${trend} ${Math.abs(change)}% over the last 6 months.`);
    }

    if (input.regionalComparison.length) {
        const topRegion = input.regionalComparison.reduce((best, current) =>
            current.demand > best.demand ? current : best,
        );
        insights.push(`${topRegion.region} leads demand with score ${topRegion.demand}.`);
    }

    if (input.projectDensity.length) {
        const topType = input.projectDensity.reduce((best, current) =>
            current.value > best.value ? current : best,
        );
        insights.push(`${topType.name} projects make up ${topType.value}% of the active pipeline.`);
    }

    if (input.salesCorrelation.length) {
        const averageSales =
            input.salesCorrelation.reduce((sum, item) => sum + item.sales, 0) /
            input.salesCorrelation.length;
        const highDemand = input.salesCorrelation.filter((item) => item.demand >= 70);
        if (highDemand.length) {
            const highAvg = highDemand.reduce((sum, item) => sum + item.sales, 0) / highDemand.length;
            const delta = Math.round(((highAvg - averageSales) / averageSales) * 100);
            insights.push(
                `High demand regions sell ${delta >= 0 ? "about" : "around"} ${Math.abs(
                    delta,
                )}% more than average.`,
            );
        }
    }

    return insights.slice(0, 4);
}
