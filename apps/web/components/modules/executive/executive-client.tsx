"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

export type ExecutiveMode = "performance" | "regional" | "sales";

type TargetPoint = { date: string; target: number; actual: number };
type SalesOverview = {
    month: string;
    current: { orderCount: number; qtyTons: number; revenue: number; avgOrderValue: number };
    previous: { orderCount: number; qtyTons: number; revenue: number };
    growth: { qtyPct: number; revenuePct: number };
};
type ShipmentsSummary = {
    days: number;
    total: number;
    delivered: number;
    overdue: number;
    overduePct: number;
    byStatus?: Record<string, number>;
};
type RegionalItem = {
    distributorId: number;
    distributorName: string;
    orderCount: number;
    qtyTons: number;
    revenue: number;
    growthPct: number;
    avgOrderValue: number;
    shipmentsTotal: number;
    shipmentsOverdue: number;
    overduePct: number;
};
type RegionalPerformance = { days: number; items: RegionalItem[]; note?: string };
type SalesTopDistributor = { distributorId: number; distributorName: string; qtyTons: number; revenue: number };
type SalesSummary = {
    days: number;
    orderCount: number;
    approvedCount: number | null;
    totalQtyTons: number;
    totalRevenue: number;
    avgOrderValue: number;
    topDistributors: SalesTopDistributor[];
};

function formatIDR(value: number) {
    return `Rp ${Math.round(value).toLocaleString("id")}`;
}

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
    const allKeys = Array.from(
        rows.reduce((s, r) => {
            for (const k of Object.keys(r)) s.add(k);
            return s;
        }, new Set<string>()),
    );
    if (allKeys.length === 0) {
        allKeys.push("note");
        rows = [{ note: "No data" }];
    }

    const escape = (v: unknown) => {
        const str = v == null ? "" : String(v);
        if (/[\n\r,\"]/g.test(str)) return `"${str.replace(/\"/g, '""')}"`;
        return str;
    };

    const csv = [
        allKeys.join(","),
        ...rows.map((r) => allKeys.map((k) => escape(r[k])).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function ExecutiveClient({ mode }: { mode: ExecutiveMode }) {
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [targetSeries, setTargetSeries] = useState<TargetPoint[]>([]);
    const [targetMonthly, setTargetMonthly] = useState<number | null>(null);
    const [salesOverview, setSalesOverview] = useState<SalesOverview | null>(null);
    const [shipments, setShipments] = useState<ShipmentsSummary | null>(null);
    const [regional, setRegional] = useState<RegionalPerformance | null>(null);
    const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);

    useEffect(() => {
        if (mode !== "performance") return;

        fetch(`/api/exec/target-vs-actual?month=${month}`)
            .then((r) => r.json())
            .then((d) => {
                setTargetSeries((d.series ?? []) as TargetPoint[]);
                setTargetMonthly(typeof d.targetMonthly === "number" ? d.targetMonthly : null);
            })
            .catch(() => {
                setTargetSeries([]);
                setTargetMonthly(null);
            });

        fetch(`/api/exec/sales/overview?month=${month}`)
            .then((r) => r.json())
            .then((d) => setSalesOverview(d as SalesOverview))
            .catch(() => setSalesOverview(null));

        fetch("/api/exec/shipments/summary")
            .then((r) => r.json())
            .then((d) => setShipments(d as ShipmentsSummary))
            .catch(() => setShipments(null));

        fetch("/api/exec/regional/performance?days=30")
            .then((r) => r.json())
            .then((d) => setRegional(d as RegionalPerformance))
            .catch(() => setRegional(null));
    }, [mode, month]);

    useEffect(() => {
        if (mode !== "regional") return;
        fetch("/api/exec/regional/performance?days=30")
            .then((r) => r.json())
            .then((d) => setRegional(d as RegionalPerformance))
            .catch(() => setRegional(null));
    }, [mode]);

    useEffect(() => {
        if (mode !== "sales") return;
        fetch("/api/exec/sales/summary?days=90")
            .then((r) => r.json())
            .then((d) => setSalesSummary(d as SalesSummary))
            .catch(() => setSalesSummary(null));
    }, [mode]);

    const kpiPerformance = useMemo(() => {
        const actualMtd = targetSeries.length > 0 ? Number(targetSeries[targetSeries.length - 1]?.actual ?? 0) : 0;
        const target = Number(targetMonthly ?? 0);
        const achievementPct = target > 0 ? (actualMtd / target) * 100 : null;

        const bestRegion = regional?.items?.[0] ?? null;
        const worstRegion = regional?.items && regional.items.length > 0 ? regional.items[regional.items.length - 1] : null;

        return {
            actualMtd,
            achievementPct,
            bestRegion,
            worstRegion,
        };
    }, [targetSeries, targetMonthly, regional]);

    const regionalSortedByRevenue = useMemo(() => {
        const list = regional?.items ?? [];
        return [...list].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    }, [regional]);

    const salesTopByVolume = useMemo(() => {
        const list = salesSummary?.topDistributors ?? [];
        return [...list].sort((a, b) => Number(b.qtyTons) - Number(a.qtyTons));
    }, [salesSummary]);

    const salesTopByRevenue = useMemo(() => {
        const list = salesSummary?.topDistributors ?? [];
        return [...list].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    }, [salesSummary]);

    const canDownload =
        (mode === "performance" && (regional?.items?.length ?? 0) > 0) ||
        (mode === "regional" && (regional?.items?.length ?? 0) > 0) ||
        (mode === "sales" && (salesSummary?.topDistributors?.length ?? 0) > 0);

    function downloadExcelCSV() {
        const stamp = new Date().toISOString().slice(0, 10);

        if (mode === "sales") {
            const rows = (salesSummary?.topDistributors ?? []).map((it) => ({
                distributorId: it.distributorId,
                distributorName: it.distributorName,
                qtyTons: it.qtyTons,
                revenue: it.revenue,
            }));
            downloadCSV(`sales-summary_${stamp}.csv`, rows);
            return;
        }

        const rows = (regional?.items ?? []).map((it) => ({
            distributorId: it.distributorId,
            distributorName: it.distributorName,
            orderCount: it.orderCount,
            qtyTons: it.qtyTons,
            revenue: it.revenue,
            growthPct: it.growthPct,
            avgOrderValue: it.avgOrderValue,
            shipmentsTotal: it.shipmentsTotal,
            shipmentsOverdue: it.shipmentsOverdue,
            overduePct: it.overduePct,
        }));
        downloadCSV(`${mode === "regional" ? "regional-performance" : "performance-overview"}_${stamp}.csv`, rows);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={
                    mode === "performance"
                        ? "Performance Overview"
                        : mode === "regional"
                            ? "Regional Performance"
                            : "Sales Summary"
                }
                description={
                    mode === "performance"
                        ? "Gambaran besar performa: sales, target vs realisasi, growth, dan SLA distribusi."
                        : mode === "regional"
                            ? "Performa antar wilayah (proxy: distributor) untuk keputusan taktis regional."
                            : "Ringkasan transaksi dan pendapatan untuk monitoring revenue & produktivitas distributor."
                }
                actions={
                    <>
                        <Button size="sm" variant="outline" onClick={() => window.print()}>
                            Download PDF
                        </Button>
                        <Button size="sm" onClick={downloadExcelCSV} disabled={!canDownload}>
                            Download Excel
                        </Button>
                    </>
                }
            />

            {mode === "performance" ? (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Total Penjualan (Bulan)</div>
                                <div className="mt-1 text-2xl font-bold">
                                    {salesOverview ? formatIDR(Number(salesOverview.current.revenue ?? 0)) : "—"}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Volume (Bulan)</div>
                                <div className="mt-1 text-2xl font-bold">
                                    {salesOverview ? `${Math.round(Number(salesOverview.current.qtyTons ?? 0)).toLocaleString("id")} t` : "—"}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Target vs Realisasi</div>
                                <div className="mt-1 text-2xl font-bold">
                                    {kpiPerformance.achievementPct != null ? `${kpiPerformance.achievementPct.toFixed(1)}%` : "—"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {targetMonthly != null ? `Target ${Math.round(targetMonthly).toLocaleString("id")} t` : ""}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Pertumbuhan Bulanan</div>
                                <div className="mt-1 text-2xl font-bold">
                                    {salesOverview ? (
                                        <Badge variant={Number(salesOverview.growth.revenuePct) >= 0 ? "success" : "danger"}>
                                            {Number(salesOverview.growth.revenuePct) >= 0 ? "+" : ""}{Number(salesOverview.growth.revenuePct).toFixed(1)}%
                                        </Badge>
                                    ) : (
                                        "—"
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Shipment Berhasil</div>
                                <div className="mt-1 text-2xl font-bold">{shipments ? Number(shipments.delivered).toLocaleString("id") : "—"}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Tingkat Keterlambatan</div>
                                <div className="mt-1 text-2xl font-bold">{shipments ? `${Number(shipments.overduePct ?? 0).toFixed(1)}%` : "—"}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{shipments ? `${shipments.overdue} overdue` : ""}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Target vs Realisasi (MTD)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="text-sm text-muted-foreground">Bulan</div>
                                <Input className="h-8 w-[140px]" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                            </div>
                            <div className="h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={targetSeries}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <ReferenceLine y={0} stroke="#e2e8f0" />
                                        <Line type="monotone" dataKey="target" name="Target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                                        <Line type="monotone" dataKey="actual" name="Aktual" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle>Regional Snapshot (30 Hari)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-auto rounded-md border border-border">
                                    <Table>
                                        <THead>
                                            <TR>
                                                <TH>Wilayah (Distributor)</TH>
                                                <TH className="text-right">Revenue</TH>
                                                <TH className="text-right">Growth</TH>
                                                <TH className="text-right">Delay %</TH>
                                            </TR>
                                        </THead>
                                        <TBody>
                                            {regionalSortedByRevenue.slice(0, 10).map((it) => (
                                                <TR key={it.distributorId}>
                                                    <TD className="font-medium">{it.distributorName}</TD>
                                                    <TD className="text-right font-mono">{formatIDR(Number(it.revenue ?? 0)).replace("Rp ", "")}</TD>
                                                    <TD className="text-right">
                                                        <Badge variant={Number(it.growthPct) >= 0 ? "success" : "danger"}>
                                                            {Number(it.growthPct) >= 0 ? "+" : ""}{Number(it.growthPct).toFixed(1)}%
                                                        </Badge>
                                                    </TD>
                                                    <TD className="text-right font-mono">{Number(it.overduePct ?? 0).toFixed(1)}%</TD>
                                                </TR>
                                            ))}
                                        </TBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Wilayah Terbaik & Terlemah</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <div className="text-xs text-muted-foreground">Terbaik (Revenue 30d)</div>
                                    <div className="mt-1 font-semibold">{kpiPerformance.bestRegion ? kpiPerformance.bestRegion.distributorName : "—"}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {kpiPerformance.bestRegion ? formatIDR(Number(kpiPerformance.bestRegion.revenue ?? 0)) : ""}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Terlemah (Revenue 30d)</div>
                                    <div className="mt-1 font-semibold">{kpiPerformance.worstRegion ? kpiPerformance.worstRegion.distributorName : "—"}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {kpiPerformance.worstRegion ? formatIDR(Number(kpiPerformance.worstRegion.revenue ?? 0)) : ""}
                                    </div>
                                </div>
                                {regional?.note ? (
                                    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                                        {regional.note}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}

            {mode === "regional" ? (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Performa per Wilayah (30 Hari)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {regional?.note ? (
                                <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                                    {regional.note}
                                </div>
                            ) : null}
                            <div className="overflow-auto rounded-md border border-border">
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>Wilayah (Distributor)</TH>
                                            <TH className="text-right">Orders</TH>
                                            <TH className="text-right">Revenue</TH>
                                            <TH className="text-right">Growth</TH>
                                            <TH className="text-right">Avg Transaksi</TH>
                                            <TH className="text-right">Delay %</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {(regionalSortedByRevenue ?? []).map((it) => (
                                            <TR key={it.distributorId}>
                                                <TD className="font-medium">{it.distributorName}</TD>
                                                <TD className="text-right font-mono">{Number(it.orderCount ?? 0).toLocaleString("id")}</TD>
                                                <TD className="text-right font-mono">{formatIDR(Number(it.revenue ?? 0)).replace("Rp ", "")}</TD>
                                                <TD className="text-right">
                                                    <Badge variant={Number(it.growthPct) >= 0 ? "success" : "danger"}>
                                                        {Number(it.growthPct) >= 0 ? "+" : ""}{Number(it.growthPct).toFixed(1)}%
                                                    </Badge>
                                                </TD>
                                                <TD className="text-right font-mono">{formatIDR(Number(it.avgOrderValue ?? 0)).replace("Rp ", "")}</TD>
                                                <TD className="text-right font-mono">{Number(it.overduePct ?? 0).toFixed(1)}%</TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            ) : null}

            {mode === "sales" ? (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Total Order Masuk (90d)</div>
                                <div className="mt-1 text-2xl font-bold">{salesSummary ? Number(salesSummary.orderCount).toLocaleString("id") : "—"}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Total Order Disetujui</div>
                                <div className="mt-1 text-2xl font-bold">{salesSummary?.approvedCount != null ? Number(salesSummary.approvedCount).toLocaleString("id") : "—"}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Total Pendapatan (90d)</div>
                                <div className="mt-1 text-2xl font-bold">{salesSummary ? formatIDR(Number(salesSummary.totalRevenue ?? 0)) : "—"}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Rata-rata Transaksi</div>
                                <div className="mt-1 text-2xl font-bold">{salesSummary ? formatIDR(Number(salesSummary.avgOrderValue ?? 0)) : "—"}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Top Distributor (Volume)</div>
                                <div className="mt-1 text-sm font-semibold">{salesTopByVolume[0]?.distributorName ?? "—"}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{salesTopByVolume[0] ? `${Math.round(Number(salesTopByVolume[0].qtyTons)).toLocaleString("id")} t / 90d` : ""}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Produk Paling Laku</div>
                                <div className="mt-1 text-2xl font-bold">—</div>
                                <div className="mt-1 text-xs text-muted-foreground">Belum ada data produk pada `sales_orders`.</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Top Distributor by Revenue (90d)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-auto rounded-md border border-border">
                                    <Table>
                                        <THead>
                                            <TR>
                                                <TH>Distributor</TH>
                                                <TH className="text-right">Revenue</TH>
                                                <TH className="text-right">Qty (t)</TH>
                                            </TR>
                                        </THead>
                                        <TBody>
                                            {salesTopByRevenue.slice(0, 10).map((it) => (
                                                <TR key={it.distributorId}>
                                                    <TD className="font-medium">{it.distributorName}</TD>
                                                    <TD className="text-right font-mono">{formatIDR(Number(it.revenue ?? 0)).replace("Rp ", "")}</TD>
                                                    <TD className="text-right font-mono">{Number(it.qtyTons ?? 0).toFixed(0)}</TD>
                                                </TR>
                                            ))}
                                        </TBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Top Distributor by Volume (90d)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-auto rounded-md border border-border">
                                    <Table>
                                        <THead>
                                            <TR>
                                                <TH>Distributor</TH>
                                                <TH className="text-right">Qty (t)</TH>
                                                <TH className="text-right">Revenue</TH>
                                            </TR>
                                        </THead>
                                        <TBody>
                                            {salesTopByVolume.slice(0, 10).map((it) => (
                                                <TR key={it.distributorId}>
                                                    <TD className="font-medium">{it.distributorName}</TD>
                                                    <TD className="text-right font-mono">{Number(it.qtyTons ?? 0).toFixed(0)}</TD>
                                                    <TD className="text-right font-mono">{formatIDR(Number(it.revenue ?? 0)).replace("Rp ", "")}</TD>
                                                </TR>
                                            ))}
                                        </TBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}
        </div>
    );
}
