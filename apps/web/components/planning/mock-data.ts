import type {
    DemandPoint,
    DemandDriver,
    Distributor,
    LatLng,
    MonthlyDemand,
    Project,
    ProjectDensity,
    RegionComparison,
    RegionGrowth,
    RegionMetric,
    SalesCorrelation,
    Warehouse,
} from "./types";

export const distributors: Distributor[] = [
    {
        id: "dist-1",
        name: "Tangerang Hub",
        lat: -6.192,
        lng: 106.639,
        coverageKm: 18,
        capacityTons: 1200,
    },
    {
        id: "dist-2",
        name: "Bekasi Central",
        lat: -6.234,
        lng: 107.018,
        coverageKm: 16,
        capacityTons: 980,
    },
    {
        id: "dist-3",
        name: "Depok West",
        lat: -6.383,
        lng: 106.8,
        coverageKm: 14,
        capacityTons: 760,
    },
    {
        id: "dist-4",
        name: "Bogor East",
        lat: -6.561,
        lng: 106.829,
        coverageKm: 15,
        capacityTons: 840,
    },
    {
        id: "dist-5",
        name: "Jakarta North",
        lat: -6.117,
        lng: 106.879,
        coverageKm: 20,
        capacityTons: 1300,
    },
];

export const warehouses: Warehouse[] = [
    {
        id: "wh-1",
        name: "Cikarang Warehouse",
        lat: -6.309,
        lng: 107.148,
        capacityTons: 2000,
    },
    {
        id: "wh-2",
        name: "Priok Depot",
        lat: -6.103,
        lng: 106.89,
        capacityTons: 1800,
    },
];

export const projects: Project[] = [
    {
        id: "pr-1",
        name: "Harbor Expansion",
        type: "Infrastructure",
        lat: -6.101,
        lng: 106.888,
        demandScore: 88,
    },
    {
        id: "pr-2",
        name: "Bekasi Logistics Park",
        type: "Industrial",
        lat: -6.256,
        lng: 107.032,
        demandScore: 76,
    },
    {
        id: "pr-3",
        name: "South Depok Housing",
        type: "Residential",
        lat: -6.431,
        lng: 106.829,
        demandScore: 69,
    },
    {
        id: "pr-4",
        name: "Toll Road Extension",
        type: "Infrastructure",
        lat: -6.207,
        lng: 106.957,
        demandScore: 82,
    },
    {
        id: "pr-5",
        name: "Tangerang Mixed Use",
        type: "Residential",
        lat: -6.215,
        lng: 106.655,
        demandScore: 64,
    },
    {
        id: "pr-6",
        name: "Bogor Civic Center",
        type: "Infrastructure",
        lat: -6.602,
        lng: 106.802,
        demandScore: 58,
    },
];

export const majorRoads: LatLng[] = [
    { lat: -6.224, lng: 106.845 },
    { lat: -6.215, lng: 106.901 },
    { lat: -6.229, lng: 106.962 },
    { lat: -6.271, lng: 106.996 },
    { lat: -6.284, lng: 107.045 },
];

export const demandPoints: DemandPoint[] = [
    { id: "dp-1", lat: -6.176, lng: 106.804, intensity: 78, region: "Jakarta", month: "2025-09" },
    { id: "dp-2", lat: -6.209, lng: 106.865, intensity: 62, region: "Jakarta", month: "2025-10" },
    { id: "dp-3", lat: -6.259, lng: 106.905, intensity: 55, region: "Jakarta", month: "2025-11" },
    { id: "dp-4", lat: -6.289, lng: 107.02, intensity: 71, region: "Bekasi", month: "2025-11" },
    { id: "dp-5", lat: -6.317, lng: 107.093, intensity: 86, region: "Bekasi", month: "2025-12" },
    { id: "dp-6", lat: -6.37, lng: 106.82, intensity: 58, region: "Depok", month: "2025-12" },
    { id: "dp-7", lat: -6.41, lng: 106.78, intensity: 49, region: "Depok", month: "2026-01" },
    { id: "dp-8", lat: -6.205, lng: 106.68, intensity: 66, region: "Tangerang", month: "2026-01" },
    { id: "dp-9", lat: -6.192, lng: 106.62, intensity: 73, region: "Tangerang", month: "2026-01" },
    { id: "dp-10", lat: -6.532, lng: 106.808, intensity: 52, region: "Bogor", month: "2026-02" },
    { id: "dp-11", lat: -6.593, lng: 106.848, intensity: 68, region: "Bogor", month: "2026-02" },
    { id: "dp-12", lat: -6.147, lng: 106.91, intensity: 81, region: "Jakarta", month: "2026-02" },
];

export const regionMetrics: RegionMetric[] = [
    {
        id: "reg-1",
        name: "North Jakarta",
        demandScore: 84,
        distributorCount: 2,
        coveragePct: 78,
        recommendation: "Monitor",
        projectedVolume: 2200,
    },
    {
        id: "reg-2",
        name: "East Jakarta",
        demandScore: 76,
        distributorCount: 1,
        coveragePct: 62,
        recommendation: "Expand",
        projectedVolume: 2450,
    },
    {
        id: "reg-3",
        name: "Bekasi",
        demandScore: 88,
        distributorCount: 1,
        coveragePct: 55,
        recommendation: "Expand",
        projectedVolume: 2800,
    },
    {
        id: "reg-4",
        name: "Tangerang",
        demandScore: 69,
        distributorCount: 2,
        coveragePct: 74,
        recommendation: "Monitor",
        projectedVolume: 1900,
    },
    {
        id: "reg-5",
        name: "Depok",
        demandScore: 61,
        distributorCount: 1,
        coveragePct: 58,
        recommendation: "Expand",
        projectedVolume: 1650,
    },
    {
        id: "reg-6",
        name: "Bogor",
        demandScore: 64,
        distributorCount: 1,
        coveragePct: 52,
        recommendation: "Expand",
        projectedVolume: 1750,
    },
];

export const demandTrend: MonthlyDemand[] = [
    { month: "Mar", demand: 52, projects: 18 },
    { month: "Apr", demand: 55, projects: 19 },
    { month: "May", demand: 57, projects: 20 },
    { month: "Jun", demand: 59, projects: 23 },
    { month: "Jul", demand: 63, projects: 26 },
    { month: "Aug", demand: 66, projects: 27 },
    { month: "Sep", demand: 64, projects: 25 },
    { month: "Oct", demand: 68, projects: 28 },
    { month: "Nov", demand: 72, projects: 30 },
    { month: "Dec", demand: 74, projects: 32 },
    { month: "Jan", demand: 78, projects: 33 },
    { month: "Feb", demand: 81, projects: 35 },
];

export const regionalComparison: RegionComparison[] = [
    { region: "Jakarta", demand: 82, sales: 74 },
    { region: "Bekasi", demand: 88, sales: 79 },
    { region: "Tangerang", demand: 69, sales: 63 },
    { region: "Depok", demand: 61, sales: 55 },
    { region: "Bogor", demand: 64, sales: 57 },
    { region: "Karawang", demand: 58, sales: 52 },
];

export const projectDensity: ProjectDensity[] = [
    { name: "Residential", value: 44 },
    { name: "Infrastructure", value: 33 },
    { name: "Industrial", value: 23 },
];

export const salesCorrelation: SalesCorrelation[] = [
    { demand: 52, sales: 46, region: "Karawang" },
    { demand: 60, sales: 54, region: "Depok" },
    { demand: 65, sales: 58, region: "Bogor" },
    { demand: 70, sales: 62, region: "Tangerang" },
    { demand: 74, sales: 66, region: "Jakarta" },
    { demand: 79, sales: 72, region: "Bekasi" },
    { demand: 85, sales: 78, region: "East Jakarta" },
    { demand: 88, sales: 82, region: "Bekasi" },
];

export const regionGrowth: RegionGrowth[] = [
    { region: "Bekasi", growthPct: 12.6 },
    { region: "Jakarta", growthPct: 8.2 },
    { region: "Tangerang", growthPct: 4.3 },
    { region: "Bogor", growthPct: 1.8 },
    { region: "Karawang", growthPct: 0.9 },
    { region: "Depok", growthPct: -1.6 },
];

export const demandDrivers: DemandDriver[] = [
    { name: "Project Density", value: 34 },
    { name: "Population Growth", value: 22 },
    { name: "Infrastructure Activity", value: 26 },
    { name: "Historical Orders", value: 18 },
];
