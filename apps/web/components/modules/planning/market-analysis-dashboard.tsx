"use client";

import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    demandDrivers,
    demandTrend,
    regionGrowth,
    regionalComparison,
} from "@/components/planning/mock-data";

const ChartTooltipStyle = {
    contentStyle: {
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 10px -6px rgb(0 0 0 / 0.18)",
        fontSize: 12,
    },
};

type TrendDirection = "Increasing" | "Stable" | "Decreasing";

function trendFromPct(pct: number): TrendDirection {
    if (pct >= 2) return "Increasing";
    if (pct <= -2) return "Decreasing";
    return "Stable";
}

function badgeVariantForTrend(trend: TrendDirection): ComponentProps<typeof Badge>["variant"] {
    if (trend === "Increasing") return "success";
    if (trend === "Decreasing") return "danger";
    return "warning";
}

function formatPct(pct: number): string {
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function computeGrowthPctFromSeries(series: Array<{ demand: number }>): number {
    if (series.length < 2) return 0;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    if (!prev?.demand) return 0;
    return ((last.demand - prev.demand) / prev.demand) * 100;
}

function filterTrendByPeriod(period: string) {
    if (period === "6m") return demandTrend.slice(-6);
    if (period === "12m") return demandTrend;
    if (period === "ytd") {
        const janIdx = demandTrend.findIndex((d) => d.month === "Jan");
        if (janIdx >= 0) return demandTrend.slice(janIdx);
        return demandTrend.slice(-2);
    }
    return demandTrend;
}

function buildInsightText(input: {
    region: string;
    period: string;
    regionalComparisonData: typeof regionalComparison;
    regionGrowthData: typeof regionGrowth;
    kpiTrend: TrendDirection;
}): {
    lines: string[];
} {
    if (input.region !== "All") {
        const rc = input.regionalComparisonData.find((r) => r.region === input.region);
        const rg = input.regionGrowthData.find((r) => r.region === input.region);
        const demandIdx = rc?.demand ?? 0;
        const salesIdx = rc?.sales ?? 0;
        const growthPct = rg?.growthPct ?? 0;
        return {
            lines: [
                `Selected region: ${input.region} (period: ${input.period.toUpperCase()}).`,
                `Demand index: ${demandIdx} · Sales index: ${salesIdx}.`,
                `Regional growth: ${formatPct(growthPct)} · Trend: ${input.kpiTrend}.`,
            ],
        };
    }

    const highestDemand = input.regionalComparisonData.reduce(
        (best, cur) => (cur.demand > best.demand ? cur : best),
        input.regionalComparisonData[0] ?? { region: "—", demand: 0, sales: 0 },
    );

    const fastestGrowing = input.regionGrowthData.reduce(
        (best, cur) => (cur.growthPct > best.growthPct ? cur : best),
        input.regionGrowthData[0] ?? { region: "—", growthPct: 0 },
    );

    const stableOrSlowing = input.regionGrowthData.reduce(
        (best, cur) => (cur.growthPct < best.growthPct ? cur : best),
        input.regionGrowthData[0] ?? { region: "—", growthPct: 0 },
    );

    return {
        lines: [
            `Fastest growing region: ${fastestGrowing.region} (${formatPct(fastestGrowing.growthPct)}).`,
            `Highest demand region: ${highestDemand.region} (index ${highestDemand.demand}).`,
            `Stable / slowing region: ${stableOrSlowing.region} (${formatPct(stableOrSlowing.growthPct)}).`,
        ],
    };
}

export function MarketAnalysisDashboard({
    map,
    mapLoading,
}: {
    map: React.ReactNode;
    mapLoading: boolean;
}) {
    const [period, setPeriod] = useState("12m");
    const [region, setRegion] = useState("All");

    const regions = useMemo(() => {
        const unique = Array.from(new Set(regionalComparison.map((r) => r.region)));
        return ["All", ...unique];
    }, []);

    const regionalComparisonFiltered = useMemo(() => {
        return region === "All" ? regionalComparison : regionalComparison.filter((r) => r.region === region);
    }, [region]);

    const topDemandRegions = useMemo(() => {
        const sorted = [...regionalComparisonFiltered].sort((a, b) => b.demand - a.demand);
        return sorted;
    }, [regionalComparisonFiltered]);

    const avgDemandIndex = useMemo(() => {
        if (regionalComparison.length === 0) return 1;
        const sum = regionalComparison.reduce((acc, cur) => acc + cur.demand, 0);
        return sum / regionalComparison.length;
    }, []);

    const regionDemandIndex = useMemo(() => {
        if (region === "All") return avgDemandIndex;
        const match = regionalComparison.find((r) => r.region === region);
        return match?.demand ?? avgDemandIndex;
    }, [region, avgDemandIndex]);

    const trendBase = useMemo(() => filterTrendByPeriod(period), [period]);

    const trendDerived = useMemo(() => {
        // We only have a single trend series in mock data.
        // For region focus, derive a deterministic scaled series using the region’s demand index vs average.
        const factor = avgDemandIndex > 0 ? regionDemandIndex / avgDemandIndex : 1;
        return trendBase.map((d) => ({
            ...d,
            demand: clamp(d.demand * factor, 0, 100),
        }));
    }, [trendBase, regionDemandIndex, avgDemandIndex]);

    const kpiGrowthPct = useMemo(() => computeGrowthPctFromSeries(trendDerived), [trendDerived]);
    const kpiTrend = useMemo(() => trendFromPct(kpiGrowthPct), [kpiGrowthPct]);

    const insight = useMemo(
        () =>
            buildInsightText({
                region,
                period,
                regionalComparisonData: regionalComparisonFiltered,
                regionGrowthData: regionGrowth,
                kpiTrend,
            }),
        [region, period, regionalComparisonFiltered, kpiTrend],
    );

    const driverColors = ["#2563eb", "#22c55e", "#f97316", "#7c3aed"];

    return (
        <div className="space-y-5">
            {/* Top: Filter bar */}
            <Card className="rounded-2xl">
                <CardContent className="py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">Filters</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                Focus the view by period and region. Map area follows pan/zoom.
                            </div>
                        </div>

                        <div className="flex-1" />

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[520px]">
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">Period</div>
                                <Select
                                    value={period}
                                    onValueChange={setPeriod}
                                    options={[
                                        { value: "6m", label: "Last 6 months" },
                                        { value: "12m", label: "Last 12 months" },
                                        { value: "ytd", label: "Year to date" },
                                    ]}
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">Region</div>
                                <Select
                                    value={region}
                                    onValueChange={setRegion}
                                    options={regions.map((r) => ({ value: r, label: r }))}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Middle: Map + right insights/trend */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card className="rounded-2xl">
                    <CardHeader>
                        <div className="space-y-1">
                            <CardTitle>Demand Map</CardTitle>
                            <div className="text-xs text-muted-foreground">
                                Heat visualization highlights relative demand intensity within the current view.
                            </div>
                        </div>
                        <Badge variant="secondary">Demand surface</Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="relative h-[520px] overflow-hidden rounded-xl border border-border">
                            {map}
                            {mapLoading ? (
                                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/40">
                                    <div className="rounded-lg border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                                        Loading demand surface…
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {/* Demand Growth KPI */}
                    <Card className="rounded-2xl">
                        <CardContent className="py-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Demand Growth
                                    </div>
                                    <div className="text-3xl font-semibold leading-none text-foreground">
                                        {formatPct(kpiGrowthPct)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">vs previous period</div>
                                </div>

                                <Badge variant={badgeVariantForTrend(kpiTrend)} className="h-fit">
                                    {kpiTrend}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Market Insight */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Market Insight</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 text-sm">
                                <div className="rounded-xl border border-border bg-muted/30 p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Highlights</div>
                                    <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                                        {insight.lines.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Region filter: <span className="font-medium text-foreground">{region}</span> · Period: <span className="font-medium text-foreground">{period.toUpperCase()}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Demand Trend */}
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle>Demand Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendDerived} {...ChartTooltipStyle} margin={{ left: 6, right: 12, top: 8, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <Tooltip {...ChartTooltipStyle} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Line
                                            type="monotone"
                                            dataKey="demand"
                                            name="Demand Index"
                                            stroke="#2563eb"
                                            strokeWidth={2.5}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Bottom analytics row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* 1) Regional Comparison */}
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Regional Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={regionalComparisonFiltered}
                                    barSize={14}
                                    margin={{ left: 6, right: 12, top: 8, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="region" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <Tooltip {...ChartTooltipStyle} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="demand" name="Demand" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* 2) Top Demand Regions */}
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Top Demand Regions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topDemandRegions}
                                    layout="vertical"
                                    barSize={10}
                                    margin={{ left: 10, right: 12, top: 8, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <YAxis type="category" dataKey="region" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                                    <Tooltip {...ChartTooltipStyle} />
                                    <Bar dataKey="demand" name="Demand" radius={[0, 4, 4, 0]}>
                                        {topDemandRegions.map((entry, idx) => {
                                            const isTop = idx === 0;
                                            const isFocused = region !== "All" && entry.region === region;
                                            return (
                                                <Cell
                                                    key={entry.region}
                                                    fill={isTop ? "#ea580c" : isFocused ? "#f97316" : "#fdba74"}
                                                    opacity={isFocused || region === "All" ? 1 : 0.6}
                                                />
                                            );
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                            Sorted by demand volume (descending). {region === "All" ? "Top region is highlighted." : "Showing selected region."}
                        </div>
                    </CardContent>
                </Card>

                {/* 3) Demand Drivers */}
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle>Demand Drivers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={demandDrivers}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={62}
                                        outerRadius={92}
                                        paddingAngle={2}
                                    >
                                        {demandDrivers.map((entry, index) => (
                                            <Cell key={entry.name} fill={driverColors[index % driverColors.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...ChartTooltipStyle} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className={cn("mt-2 text-xs text-muted-foreground")}>
                            Contribution factors based on the current market model.
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
