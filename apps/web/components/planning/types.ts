export type LatLng = {
    lat: number;
    lng: number;
};

export type Distributor = LatLng & {
    id: string;
    name: string;
    coverageKm: number;
    capacityTons: number;
};

export type Warehouse = LatLng & {
    id: string;
    name: string;
    capacityTons: number;
};

export type ProjectType = "Residential" | "Industrial" | "Infrastructure";

export type Project = LatLng & {
    id: string;
    name: string;
    type: ProjectType;
    demandScore: number;
};

export type DemandPoint = LatLng & {
    id: string;
    intensity: number;
    region: string;
    month: string;
};

export type RegionMetric = {
    id: string;
    name: string;
    demandScore: number;
    distributorCount: number;
    coveragePct: number;
    recommendation: "Expand" | "Monitor" | "Hold";
    projectedVolume: number;
};

export type MonthlyDemand = {
    month: string;
    demand: number;
    projects: number;
};

export type RegionComparison = {
    region: string;
    demand: number;
    sales: number;
};

export type ProjectDensity = {
    name: string;
    value: number;
};

export type SalesCorrelation = {
    demand: number;
    sales: number;
    region: string;
};

export type RiskLevel = "low" | "medium" | "high";

export type Recommendation = "Highly Recommended" | "Moderate" | "Not Recommended";

export type SiteScore = {
    score: number;
    recommendation: Recommendation;
    demandScore: number;
    metrics: {
        distanceToRoadKm: number;
        distanceToProjectKm: number;
        distanceToDistributorKm: number;
        distanceToWarehouseKm: number;
        potentialSales: number;
        truckAccess: "Yes" | "No";
        residentialDensity: "Low" | "Medium" | "High";
    };
    risks: {
        overlapDistributor: RiskLevel;
        nearWarehouse: RiskLevel;
        cannibalization: RiskLevel;
    };
};
