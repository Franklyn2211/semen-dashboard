"use client";

import { useEffect, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── helpers ──────────────────────────────────────────────────────────────────

function greeting(name: string) {
    const h = new Date().getHours();
    const salut = h < 12 ? "Selamat pagi" : h < 17 ? "Selamat siang" : "Selamat sore";
    return `${salut}, ${name}`;
}

function today() {
    return new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({
    icon,
    title,
    value,
    sub,
    accent,
}: {
    icon: string;
    title: string;
    value: React.ReactNode;
    sub?: string;
    accent?: string;
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-start gap-3">
                    <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                        style={{ background: accent ? `${accent}18` : "#2563eb18" }}
                    >
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{title}</div>
                        <div className="mt-0.5 text-2xl font-bold tracking-tight">{value}</div>
                        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ── section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="block h-px flex-1 bg-border" />
            {children}
            <span className="block h-px flex-1 bg-border" />
        </div>
    );
}

// ── chart tooltip ─────────────────────────────────────────────────────────────

const ChartTooltipStyle = {
    contentStyle: {
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
        fontSize: 12,
    },
};

// ── main component ────────────────────────────────────────────────────────────

export function DashboardClient({
    role,
    name,
}: {
    role: "ADMIN" | "OPS" | "EXEC";
    name: string;
}) {
    // ── state ──────────────────────────────────────────────────────────────────
    const [distributorsCount, setDistributorsCount] = useState<number | null>(null);
    const [storesCount, setStoresCount] = useState<number | null>(null);
    const [projectsCount, setProjectsCount] = useState<number | null>(null);
    const [stockTotal, setStockTotal] = useState<number | null>(null);
    const [reorderItems, setReorderItems] = useState<{ urgency: string }[]>([]);
    const [shipmentStatuses, setShipmentStatuses] = useState<{ status: string; count: number }[]>([]);
    const [targetSeries, setTargetSeries] = useState<{ date: string; target: number; actual: number }[]>([]);
    const [partners, setPartners] = useState<{ distributorName: string; totalQtyTons90d: number; trendPct: number }[]>([]);

    const month = new Date().toISOString().slice(0, 7);

    useEffect(() => {
        // ADMIN & OPS: ops data
        if (role === "ADMIN" || role === "OPS") {
            fetch("/api/ops/stock")
                .then((r) => r.json())
                .then((d) => {
                    const items = (d.items ?? []) as { quantityTons: number }[];
                    const total = items.reduce((s, i) => s + Number(i.quantityTons), 0);
                    setStockTotal(total);
                })
                .catch(() => setStockTotal(null));

            fetch("/api/ops/prediction/reorder")
                .then((r) => r.json())
                .then((d) => setReorderItems((d.items ?? []) as { urgency: string }[]))
                .catch(() => setReorderItems([]));

            fetch("/api/ops/shipments?page=1&pageSize=100")
                .then((r) => r.json())
                .then((d) => {
                    const items = (d.items ?? []) as { status: string }[];
                    const counts: Record<string, number> = {};
                    for (const s of items) {
                        counts[s.status] = (counts[s.status] ?? 0) + 1;
                    }
                    setShipmentStatuses(
                        Object.entries(counts).map(([status, count]) => ({ status, count })),
                    );
                })
                .catch(() => setShipmentStatuses([]));
        }

        // ADMIN only: master data counts
        if (role === "ADMIN") {
            fetch("/api/admin/distributors")
                .then((r) => r.json())
                .then((d) => setDistributorsCount((d.items ?? []).length))
                .catch(() => setDistributorsCount(null));

            fetch("/api/admin/stores")
                .then((r) => r.json())
                .then((d) => setStoresCount((d.items ?? []).length))
                .catch(() => setStoresCount(null));

            fetch("/api/admin/projects")
                .then((r) => r.json())
                .then((d) => setProjectsCount((d.items ?? []).length))
                .catch(() => setProjectsCount(null));
        }

        // ADMIN & EXEC: exec analytics
        if (role === "ADMIN" || role === "EXEC") {
            fetch(`/api/exec/target-vs-actual?month=${month}`)
                .then((r) => r.json())
                .then((d) =>
                    setTargetSeries(
                        (d.series ?? []) as { date: string; target: number; actual: number }[],
                    ),
                )
                .catch(() => setTargetSeries([]));

            fetch("/api/exec/partners/performance")
                .then((r) => r.json())
                .then((d) =>
                    setPartners(
                        (d.items ?? []) as { distributorName: string; totalQtyTons90d: number; trendPct: number }[],
                    ),
                )
                .catch(() => setPartners([]));
        }
    }, [role, month]);

    // ── derived ────────────────────────────────────────────────────────────────
    const highReorders = reorderItems.filter((r) => r.urgency === "HIGH").length;
    const top5Partners = [...partners]
        .sort((a, b) => Number(b.totalQtyTons90d) - Number(a.totalQtyTons90d))
        .slice(0, 6)
        .map((p) => ({ name: p.distributorName, qty: Math.round(Number(p.totalQtyTons90d)), trend: Number(p.trendPct) }));

    const reorderChart = [
        { label: "HIGH", count: reorderItems.filter((r) => r.urgency === "HIGH").length, fill: "#dc2626" },
        { label: "MED", count: reorderItems.filter((r) => r.urgency === "MED").length, fill: "#d97706" },
        { label: "LOW", count: reorderItems.filter((r) => r.urgency === "LOW").length, fill: "#16a34a" },
    ];

    const PIE_COLORS: Record<string, string> = {
        PLANNED: "#94a3b8",
        IN_TRANSIT: "#2563eb",
        DELIVERED: "#16a34a",
        CANCELLED: "#dc2626",
    };

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">{greeting(name)}</h1>
                    <p className="text-sm text-muted-foreground">{today()}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                        Role: {role}
                    </Badge>
                    {highReorders > 0 && (
                        <Badge variant="danger" className="text-xs">
                            {highReorders} Reorder Alert{highReorders > 1 ? "s" : ""}
                        </Badge>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {role === "ADMIN" && (
                    <>
                        <StatCard
                            icon="🏭"
                            title="Distributor"
                            value={distributorsCount ?? "—"}
                            sub="total terdaftar"
                            accent="#2563eb"
                        />
                        <StatCard
                            icon="🏪"
                            title="Toko"
                            value={storesCount ?? "—"}
                            sub="total terdaftar"
                            accent="#7c3aed"
                        />
                        <StatCard
                            icon="🏗️"
                            title="Proyek Aktif"
                            value={projectsCount ?? "—"}
                            sub="dalam pipeline"
                            accent="#0891b2"
                        />
                        <StatCard
                            icon="📦"
                            title="Total Stok"
                            value={stockTotal !== null ? `${Math.round(stockTotal).toLocaleString("id")} t` : "—"}
                            sub="semua gudang"
                            accent="#16a34a"
                        />
                    </>
                )}

                {role === "OPS" && (
                    <>
                        <StatCard
                            icon="📦"
                            title="Total Stok"
                            value={stockTotal !== null ? `${Math.round(stockTotal).toLocaleString("id")} t` : "—"}
                            sub="semua gudang"
                            accent="#16a34a"
                        />
                        <StatCard
                            icon="🔴"
                            title="Reorder HIGH"
                            value={reorderItems.filter((r) => r.urgency === "HIGH").length}
                            sub="perlu segera di-order"
                            accent="#dc2626"
                        />
                        <StatCard
                            icon="🚚"
                            title="Total Pengiriman"
                            value={shipmentStatuses.reduce((s, i) => s + i.count, 0)}
                            sub="halaman pertama"
                            accent="#d97706"
                        />
                        <StatCard
                            icon="✅"
                            title="Delivered"
                            value={shipmentStatuses.find((s) => s.status === "DELIVERED")?.count ?? 0}
                            sub="berhasil terkirim"
                            accent="#16a34a"
                        />
                    </>
                )}

                {role === "EXEC" && (
                    <>
                        <StatCard
                            icon="🤝"
                            title="Total Partner"
                            value={partners.length}
                            sub="distributor aktif"
                            accent="#2563eb"
                        />
                        <StatCard
                            icon="📈"
                            title="Avg Trend"
                            value={
                                partners.length > 0
                                    ? `${(partners.reduce((s, p) => s + Number(p.trendPct), 0) / partners.length).toFixed(1)}%`
                                    : "—"
                            }
                            sub="90 hari terakhir"
                            accent="#16a34a"
                        />
                        <StatCard
                            icon="🏆"
                            title="Volume Tertinggi"
                            value={
                                top5Partners.length > 0
                                    ? `${top5Partners[0].qty.toLocaleString("id")} t`
                                    : "—"
                            }
                            sub={top5Partners[0]?.name ?? ""}
                            accent="#7c3aed"
                        />
                        <StatCard
                            icon="📅"
                            title="Periode"
                            value={month}
                            sub="bulan aktif"
                            accent="#0891b2"
                        />
                    </>
                )}
            </div>

            {/* Charts row 1: Target vs Actual + Shipment Status */}
            {(role === "ADMIN" || role === "EXEC") && targetSeries.length > 0 && (
                <>
                    <SectionLabel>Kinerja Penjualan</SectionLabel>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Target vs Aktual</CardTitle>
                                    <span className="text-xs text-muted-foreground">{month}</span>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[240px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={targetSeries} {...ChartTooltipStyle}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                                <Tooltip {...ChartTooltipStyle} />
                                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                                <Line type="monotone" dataKey="target" name="Target" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="6 3" />
                                                <Line type="monotone" dataKey="actual" name="Aktual" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Top Partner (90d)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[240px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={top5Partners} layout="vertical" barSize={10}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                                            <Tooltip {...ChartTooltipStyle} />
                                            <Bar dataKey="qty" name="Vol (ton)" radius={[0, 4, 4, 0]}>
                                                {top5Partners.map((_, i) => (
                                                    <Cell key={i} fill={i === 0 ? "#2563eb" : i === 1 ? "#3b82f6" : "#93c5fd"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {/* Charts row 2: Shipment Status + Reorder Urgency */}
            {(role === "ADMIN" || role === "OPS") && (
                <>
                    <SectionLabel>Operasional</SectionLabel>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {/* Shipment status pie */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Status Pengiriman</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {shipmentStatuses.length === 0 ? (
                                    <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                        Tidak ada data
                                    </div>
                                ) : (
                                    <div className="h-[200px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={shipmentStatuses}
                                                    dataKey="count"
                                                    nameKey="status"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={70}
                                                    innerRadius={40}
                                                    paddingAngle={3}
                                                >
                                                    {shipmentStatuses.map((s, i) => (
                                                        <Cell
                                                            key={i}
                                                            fill={PIE_COLORS[s.status] ?? "#94a3b8"}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    {...ChartTooltipStyle}
                                                    formatter={(v: number, n: string) => [`${v} pengiriman`, n]}
                                                />
                                                <Legend
                                                    iconType="circle"
                                                    iconSize={8}
                                                    wrapperStyle={{ fontSize: 11 }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Reorder urgency bar */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Urgensi Reorder</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reorderChart} barSize={36}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <Tooltip {...ChartTooltipStyle} formatter={(v: number) => [`${v} distributor`, "Jumlah"]} />
                                            <Bar dataKey="count" name="Distributor" radius={[4, 4, 0, 0]}>
                                                {reorderChart.map((r, i) => (
                                                    <Cell key={i} fill={r.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Stock recap */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Ringkasan Stok</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col justify-center gap-3 py-2">
                                <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-3">
                                    <span className="text-sm font-medium text-green-800">Total Stok</span>
                                    <span className="text-lg font-bold text-green-700">
                                        {stockTotal !== null ? `${Math.round(stockTotal).toLocaleString("id")} t` : "—"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
                                    <span className="text-sm font-medium text-amber-800">Reorder Pending</span>
                                    <span className="text-lg font-bold text-amber-700">{reorderItems.length}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
                                    <span className="text-sm font-medium text-red-800">Urgensi Tinggi</span>
                                    <span className="text-lg font-bold text-red-700">{highReorders}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {/* EXEC: partner trend cards */}
            {role === "EXEC" && partners.length > 0 && (
                <>
                    <SectionLabel>Performa Partner</SectionLabel>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Volume Partner (Top 6, 90 hari)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={top5Partners} barSize={14}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                            <Tooltip {...ChartTooltipStyle} />
                                            <Bar dataKey="qty" name="Vol (ton)" radius={[4, 4, 0, 0]}>
                                                {top5Partners.map((_, i) => (
                                                    <Cell key={i} fill={i === 0 ? "#2563eb" : "#93c5fd"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Trend % Partner</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={top5Partners} barSize={14}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                                            <Tooltip {...ChartTooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, "Trend"]} />
                                            <Bar dataKey="trend" name="Trend %" radius={[4, 4, 0, 0]}>
                                                {top5Partners.map((p, i) => (
                                                    <Cell key={i} fill={p.trend >= 0 ? "#16a34a" : "#dc2626"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
