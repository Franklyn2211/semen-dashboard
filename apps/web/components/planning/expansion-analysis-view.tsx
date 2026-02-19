"use client";

import { useState } from "react";
import { Circle, CircleMarker, Marker, Popup } from "react-leaflet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FiltersBar, DEFAULT_FILTERS } from "@/components/planning/filters-bar";
import { MapContainer } from "@/components/planning/map-container";
import { MetricCard } from "@/components/planning/metric-card";
import { PlanningPageHeader } from "@/components/planning/planning-page-header";
import { demandPoints, distributors, regionMetrics, warehouses } from "@/components/planning/mock-data";
import { averageNearestDistance, distanceKm, isCoveredByDistributors } from "@/components/planning/utils";

const mapCenter: [number, number] = [-6.28, 106.9];
const demandMax = Math.max(1, ...demandPoints.map((point) => point.intensity));

export function ExpansionAnalysisView() {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [selectedEntity, setSelectedEntity] = useState("");
    const [radiusKm, setRadiusKm] = useState("20");
    const [reportStatus, setReportStatus] = useState<"idle" | "loading" | "done">("idle");

    const entityOptions = [
        { value: "", label: "Select entity" },
        ...distributors.map((dist) => ({
            value: `d:${dist.id}`,
            label: `Distributor - ${dist.name}`,
        })),
        ...warehouses.map((wh) => ({
            value: `w:${wh.id}`,
            label: `Warehouse - ${wh.name}`,
        })),
    ];

    const radiusOptions = [
        { value: "10", label: "10 km" },
        { value: "20", label: "20 km" },
        { value: "30", label: "30 km" },
    ];

    const selected = (() => {
        if (!selectedEntity) return null;
        const [kind, id] = selectedEntity.split(":");
        if (kind === "d") {
            const dist = distributors.find((item) => item.id === id);
            return dist ? { kind: "Distributor", data: dist } : null;
        }
        if (kind === "w") {
            const wh = warehouses.find((item) => item.id === id);
            return wh ? { kind: "Warehouse", data: wh } : null;
        }
        return null;
    })();

    const coveredPoints = demandPoints.filter((point) => isCoveredByDistributors(point, distributors));
    const gapPoints = demandPoints.filter((point) => !isCoveredByDistributors(point, distributors));
    const highGapPoints = gapPoints.filter((point) => point.intensity >= 65);

    const coveragePct = demandPoints.length
        ? Math.round((coveredPoints.length / demandPoints.length) * 100)
        : 0;
    const avgDistance = averageNearestDistance(demandPoints, distributors);

    const radiusValue = Number(radiusKm);
    const catchmentPoints = selected
        ? demandPoints.filter((point) => distanceKm(point, selected.data) <= radiusValue)
        : [];
    const overlapCount = catchmentPoints.filter((point) => isCoveredByDistributors(point, distributors)).length;
    const overlapPct = catchmentPoints.length
        ? Math.round((overlapCount / catchmentPoints.length) * 100)
        : 0;

    const topRegions = [...regionMetrics]
        .sort((a, b) => b.projectedVolume - a.projectedVolume)
        .slice(0, 5);

    const handleGenerate = () => {
        setReportStatus("loading");
        setTimeout(() => setReportStatus("done"), 900);
        setTimeout(() => setReportStatus("idle"), 2800);
    };

    return (
        <div className="space-y-5">
            <PlanningPageHeader
                title="Expansion Analysis"
                description="Identify whitespace coverage gaps and simulate catchment expansion scenarios."
            >
                <FiltersBar value={filters} onChange={setFilters} />
            </PlanningPageHeader>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle>Whitespace Coverage Map</CardTitle>
                                <div className="text-xs text-muted-foreground">
                                    Distributor coverage and high demand gaps.
                                </div>
                            </div>
                            <Badge variant="secondary">Coverage radius</Badge>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span>Blue circles: distributor coverage</span>
                                <span>Red dots: high demand gaps</span>
                                <span>Slate dots: demand points</span>
                            </div>
                            <MapContainer center={mapCenter} className="h-[520px]">
                                {distributors.map((dist) => (
                                    <Circle
                                        key={`cov-${dist.id}`}
                                        center={[dist.lat, dist.lng]}
                                        radius={dist.coverageKm * 1000}
                                        pathOptions={{
                                            color: "#2563eb",
                                            fillColor: "#2563eb",
                                            fillOpacity: 0.08,
                                            weight: 1,
                                        }}
                                    />
                                ))}

                                {demandPoints.map((point) => {
                                    const intensity = point.intensity / demandMax;
                                    return (
                                        <CircleMarker
                                            key={point.id}
                                            center={[point.lat, point.lng]}
                                            radius={4 + intensity * 4}
                                            pathOptions={{
                                                color: "#94a3b8",
                                                fillColor: "#94a3b8",
                                                fillOpacity: 0.5,
                                            }}
                                        />
                                    );
                                })}

                                {highGapPoints.map((point) => {
                                    const intensity = point.intensity / demandMax;
                                    return (
                                        <CircleMarker
                                            key={`gap-${point.id}`}
                                            center={[point.lat, point.lng]}
                                            radius={6 + intensity * 6}
                                            pathOptions={{
                                                color: "#ef4444",
                                                fillColor: "#ef4444",
                                                fillOpacity: 0.8,
                                            }}
                                        />
                                    );
                                })}

                                {distributors.map((dist) => (
                                    <Marker key={`dist-${dist.id}`} position={[dist.lat, dist.lng]}>
                                        <Popup>
                                            <div className="space-y-1">
                                                <div className="text-sm font-semibold">{dist.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Coverage: {dist.coverageKm} km
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}

                                {warehouses.map((wh) => (
                                    <CircleMarker
                                        key={`wh-${wh.id}`}
                                        center={[wh.lat, wh.lng]}
                                        radius={6}
                                        pathOptions={{
                                            color: "#0f766e",
                                            fillColor: "#0f766e",
                                            fillOpacity: 0.9,
                                        }}
                                    >
                                        <Popup>
                                            <div className="space-y-1">
                                                <div className="text-sm font-semibold">{wh.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Capacity: {wh.capacityTons} tons
                                                </div>
                                            </div>
                                        </Popup>
                                    </CircleMarker>
                                ))}

                                {selected ? (
                                    <Circle
                                        center={[selected.data.lat, selected.data.lng]}
                                        radius={radiusValue * 1000}
                                        pathOptions={{
                                            color: "#22c55e",
                                            fillColor: "#22c55e",
                                            fillOpacity: 0.08,
                                            weight: 2,
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
                            <CardTitle>Coverage Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <MetricCard label="Covered demand points" value={coveredPoints.length} />
                                <MetricCard label="Whitespace points" value={gapPoints.length} />
                                <MetricCard label="Coverage percentage" value={`${coveragePct}%`} />
                                <MetricCard label="Avg. distance to distributor" value={`${avgDistance.toFixed(1)} km`} />
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Whitespace highlights demand points outside existing distributor coverage.
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Catchment Simulation</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid gap-2">
                                <Select
                                    options={entityOptions}
                                    value={selectedEntity}
                                    onValueChange={setSelectedEntity}
                                />
                                <Select options={radiusOptions} value={radiusKm} onValueChange={setRadiusKm} />
                            </div>
                            {selected ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{selected.kind}</Badge>
                                        <span className="text-sm font-medium">{selected.data.name}</span>
                                        <Badge variant="outline">Radius {radiusKm} km</Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <MetricCard label="Demand points in radius" value={catchmentPoints.length} />
                                        <MetricCard label="Overlap coverage" value={`${overlapPct}%`} />
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Overlap shows how much of the selected radius is already covered.
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                                    Select a distributor or warehouse to simulate catchment coverage.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Gap Analysis</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {regionMetrics.length ? (
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>Region</TH>
                                            <TH>Demand score</TH>
                                            <TH>Distributors</TH>
                                            <TH>Coverage</TH>
                                            <TH>Recommendation</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {regionMetrics.map((region) => (
                                            <TR key={region.id}>
                                                <TD className="font-medium">{region.name}</TD>
                                                <TD>{region.demandScore}</TD>
                                                <TD>{region.distributorCount}</TD>
                                                <TD>{region.coveragePct}%</TD>
                                                <TD>{region.recommendation}</TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            ) : (
                                <div className="text-sm text-muted-foreground">No gap data available.</div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Expansion Recommendation</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-2">
                                {topRegions.map((region, index) => {
                                    const variant =
                                        region.recommendation === "Expand"
                                            ? "warning"
                                            : region.recommendation === "Monitor"
                                              ? "secondary"
                                              : "outline";
                                    return (
                                        <div
                                            key={region.id}
                                            className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                                        >
                                            <div>
                                                <div className="text-sm font-medium">
                                                    {index + 1}. {region.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    Demand {region.demandScore} | Coverage {region.coveragePct}%
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant={variant}>{region.recommendation}</Badge>
                                                <div className="text-xs text-muted-foreground">
                                                    +{region.projectedVolume} t/yr
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={handleGenerate} disabled={reportStatus === "loading"}>
                                    {reportStatus === "loading" ? "Generating..." : "Generate Report"}
                                </Button>
                                {reportStatus === "done" ? (
                                    <span className="text-xs text-emerald-600">
                                        Report generated. Check exports for download.
                                    </span>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
