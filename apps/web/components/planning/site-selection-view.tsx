"use client";

import { useState } from "react";
import { Circle, CircleMarker, Marker, Popup } from "react-leaflet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltersBar, DEFAULT_FILTERS } from "@/components/planning/filters-bar";
import { MapContainer } from "@/components/planning/map-container";
import { MetricCard } from "@/components/planning/metric-card";
import { PlanningPageHeader } from "@/components/planning/planning-page-header";
import { RiskBadge } from "@/components/planning/risk-badge";
import {
    demandPoints,
    distributors,
    majorRoads,
    projects,
    warehouses,
} from "@/components/planning/mock-data";
import { scoreSiteCandidate } from "@/components/planning/utils";
import type { LatLng } from "@/components/planning/types";
import { cn } from "@/lib/utils";

const mapCenter: [number, number] = [-6.25, 106.9];
const demandMax = Math.max(1, ...demandPoints.map((point) => point.intensity));

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span>{label}</span>
        </div>
    );
}

export function SiteSelectionView() {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [candidate, setCandidate] = useState<LatLng | null>(null);

    const profile = candidate
        ? scoreSiteCandidate(candidate, {
              demandPoints,
              distributors,
              warehouses,
              projects,
              majorRoads,
          })
        : null;

    const recommendationVariant =
        profile?.recommendation === "Highly Recommended"
            ? "success"
            : profile?.recommendation === "Moderate"
              ? "warning"
              : "danger";

    const scoreTone =
        profile && profile.score >= 75
            ? "positive"
            : profile && profile.score >= 55
              ? "warning"
              : profile
                ? "negative"
                : "neutral";

    return (
        <div className="space-y-5">
            <PlanningPageHeader
                title="Site Selection"
                description="Evaluate a candidate location with demand heatmap, project proximity, and risk profiling."
            >
                <FiltersBar value={filters} onChange={setFilters} />
            </PlanningPageHeader>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle>Site Selection Map</CardTitle>
                                <div className="text-xs text-muted-foreground">
                                    Click the map to evaluate a candidate point.
                                </div>
                            </div>
                            <Badge variant="secondary">Demand heatmap</Badge>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-4">
                                <LegendItem color="#f97316" label="Demand intensity" />
                                <LegendItem color="#2563eb" label="Distributor" />
                                <LegendItem color="#16a34a" label="Active project" />
                                <LegendItem color="#0ea5e9" label="Candidate" />
                            </div>
                            <MapContainer
                                center={mapCenter}
                                onMapClick={(lat, lng) => setCandidate({ lat, lng })}
                                className="h-[520px]"
                            >
                                {demandPoints.map((point) => {
                                    const intensity = point.intensity / demandMax;
                                    const color = `rgba(249, 115, 22, ${0.2 + intensity * 0.6})`;
                                    return (
                                        <CircleMarker
                                            key={point.id}
                                            center={[point.lat, point.lng]}
                                            radius={6 + intensity * 8}
                                            pathOptions={{
                                                color: "transparent",
                                                fillColor: color,
                                                fillOpacity: 1,
                                            }}
                                        />
                                    );
                                })}

                                {projects.map((project) => (
                                    <Circle
                                        key={project.id}
                                        center={[project.lat, project.lng]}
                                        radius={900}
                                        pathOptions={{
                                            color: "#16a34a",
                                            fillColor: "#16a34a",
                                            fillOpacity: 0.08,
                                            weight: 1,
                                        }}
                                    >
                                        <Popup>
                                            <div className="space-y-1">
                                                <div className="text-sm font-semibold">{project.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Type: {project.type}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    Demand score: {project.demandScore}
                                                </div>
                                            </div>
                                        </Popup>
                                    </Circle>
                                ))}

                                {distributors.map((dist) => (
                                    <Marker key={dist.id} position={[dist.lat, dist.lng]}>
                                        <Popup>
                                            <div className="space-y-1">
                                                <div className="text-sm font-semibold">{dist.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Coverage: {dist.coverageKm} km
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    Capacity: {dist.capacityTons} tons
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}

                                {candidate ? (
                                    <CircleMarker
                                        center={[candidate.lat, candidate.lng]}
                                        radius={10}
                                        pathOptions={{
                                            color: "#0ea5e9",
                                            fillColor: "#0ea5e9",
                                            fillOpacity: 0.9,
                                        }}
                                    >
                                        <Popup>
                                            <div className="text-xs text-muted-foreground">Candidate point</div>
                                        </Popup>
                                    </CircleMarker>
                                ) : null}

                                {candidate ? (
                                    <Circle
                                        center={[candidate.lat, candidate.lng]}
                                        radius={2500}
                                        pathOptions={{
                                            color: "#0ea5e9",
                                            weight: 1,
                                            fillOpacity: 0.05,
                                            dashArray: "4 4",
                                        }}
                                    />
                                ) : null}
                            </MapContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Site Profiling</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!profile ? (
                                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                                    Select a candidate point on the map to see metrics and scoring.
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={cn(
                                                "flex h-14 w-14 items-center justify-center rounded-xl text-xl font-semibold",
                                                profile.score >= 75
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : profile.score >= 55
                                                      ? "bg-amber-100 text-amber-700"
                                                      : "bg-red-100 text-red-700",
                                            )}
                                        >
                                            {profile.score}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-xs text-muted-foreground">Feasibility score</div>
                                            <Badge variant={recommendationVariant}>
                                                {profile.recommendation}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                        Candidate: {candidate?.lat.toFixed(5)}, {candidate?.lng.toFixed(5)}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">Demand score: {profile.demandScore}</Badge>
                                        <Badge variant="outline">Truck access: {profile.metrics.truckAccess}</Badge>
                                    </div>

                                    <Tabs defaultValue="metrics">
                                        <TabsList>
                                            <TabsTrigger value="metrics">Metrics</TabsTrigger>
                                            <TabsTrigger value="risks">Risks</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="metrics">
                                            <div className="grid grid-cols-2 gap-2">
                                                <MetricCard
                                                    label="Distance to major road"
                                                    value={`${profile.metrics.distanceToRoadKm.toFixed(1)} km`}
                                                    tone={
                                                        profile.metrics.distanceToRoadKm <= 1.5
                                                            ? "positive"
                                                            : "warning"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Nearest project"
                                                    value={`${profile.metrics.distanceToProjectKm.toFixed(1)} km`}
                                                    tone={
                                                        profile.metrics.distanceToProjectKm <= 4
                                                            ? "positive"
                                                            : "warning"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Nearest distributor"
                                                    value={`${profile.metrics.distanceToDistributorKm.toFixed(1)} km`}
                                                    tone={
                                                        profile.metrics.distanceToDistributorKm >= 6
                                                            ? "positive"
                                                            : "negative"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Potential sales"
                                                    value={`${profile.metrics.potentialSales} t/yr`}
                                                    tone="positive"
                                                />
                                                <MetricCard
                                                    label="Truck access"
                                                    value={profile.metrics.truckAccess}
                                                    tone={
                                                        profile.metrics.truckAccess === "Yes"
                                                            ? "positive"
                                                            : "negative"
                                                    }
                                                />
                                                <MetricCard
                                                    label="Residential density"
                                                    value={profile.metrics.residentialDensity}
                                                    tone={
                                                        profile.metrics.residentialDensity === "High"
                                                            ? "positive"
                                                            : profile.metrics.residentialDensity === "Medium"
                                                              ? "warning"
                                                              : "negative"
                                                    }
                                                />
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="risks">
                                            <div className="space-y-2">
                                                <RiskBadge
                                                    label="Distributor overlap"
                                                    level={profile.risks.overlapDistributor}
                                                    detail={`${profile.metrics.distanceToDistributorKm.toFixed(1)} km`}
                                                />
                                                <RiskBadge
                                                    label="Too close to warehouse"
                                                    level={profile.risks.nearWarehouse}
                                                    detail={`${profile.metrics.distanceToWarehouseKm.toFixed(1)} km`}
                                                />
                                                <RiskBadge
                                                    label="Cannibalization risk"
                                                    level={profile.risks.cannibalization}
                                                    detail={`Demand score ${profile.demandScore}`}
                                                />
                                            </div>
                                        </TabsContent>
                                    </Tabs>

                                    <MetricCard
                                        label="Overall recommendation"
                                        value={profile.recommendation}
                                        tone={scoreTone}
                                        helper="Based on demand score, overlap penalty, and road access."
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
