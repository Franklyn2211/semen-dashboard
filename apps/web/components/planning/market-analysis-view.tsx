"use client";

import { useState } from "react";
import { CircleMarker } from "react-leaflet";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    Pie,
    PieChart,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FiltersBar, DEFAULT_FILTERS } from "@/components/planning/filters-bar";
import { MapContainer } from "@/components/planning/map-container";
import { PlanningPageHeader } from "@/components/planning/planning-page-header";
import {
    demandPoints,
    demandTrend,
    projectDensity,
    regionalComparison,
    salesCorrelation,
} from "@/components/planning/mock-data";
import { buildInsights } from "@/components/planning/utils";

const mapCenter: [number, number] = [-6.25, 106.9];
const demandMax = Math.max(1, ...demandPoints.map((point) => point.intensity));
const densityColors = ["#2563eb", "#16a34a", "#f97316"];

export function MarketAnalysisView() {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);

    const insights = buildInsights({
        demandTrend,
        regionalComparison,
        projectDensity,
        salesCorrelation,
    });

    return (
        <div className="space-y-5">
            <PlanningPageHeader
                title="Market Analysis"
                description="Track demand momentum, regional performance, and sales correlation."
            >
                <FiltersBar value={filters} onChange={setFilters} />
            </PlanningPageHeader>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle>Demand Heatmap</CardTitle>
                                <div className="text-xs text-muted-foreground">
                                    Heat intensity represents aggregated project demand.
                                </div>
                            </div>
                            <Badge variant="secondary">Demand view</Badge>
                        </CardHeader>
                        <CardContent>
                            <MapContainer center={mapCenter} className="h-[520px]">
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
                            </MapContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Demand Trend</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={demandTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="projects" barSize={16} fill="#93c5fd" name="Projects" />
                                    <Line
                                        type="monotone"
                                        dataKey="demand"
                                        stroke="#2563eb"
                                        strokeWidth={2}
                                        name="Demand"
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Regional Comparison</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={regionalComparison}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="region" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="demand" fill="#2563eb" name="Demand" />
                                    <Bar dataKey="sales" fill="#22c55e" name="Sales" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Project Density</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={projectDensity}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={45}
                                        outerRadius={80}
                                        paddingAngle={3}
                                    >
                                        {projectDensity.map((entry, index) => (
                                            <Cell
                                                key={entry.name}
                                                fill={densityColors[index % densityColors.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Sales Correlation</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis
                                        type="number"
                                        dataKey="demand"
                                        name="Demand"
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="sales"
                                        name="Sales"
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                                    <Scatter data={salesCorrelation} fill="#6366f1" name="Demand vs Sales" />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Insight Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {insights.length ? (
                                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                                    {insights.map((insight) => (
                                        <li key={insight}>{insight}</li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-sm text-muted-foreground">No insights available.</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
