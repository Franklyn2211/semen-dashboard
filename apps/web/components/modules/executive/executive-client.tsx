"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

const ExecMap = dynamic(() => import("./executive-map"), { ssr: false });

export function ExecutiveClient() {
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [series, setSeries] = useState<{ date: string; target: number; actual: number }[]>([]);
    const [stores, setStores] = useState<{ id: number; name: string; lat: number; lng: number; competitorSharePct: number }[]>([]);
    const [partners, setPartners] = useState<{ distributorId: number; distributorName: string; totalQtyTons90d: number; trendPct: number }[]>([]);
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<"total" | "trend" | "name">("total");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    useEffect(() => {
        fetch(`/api/exec/target-vs-actual?month=${month}`)
            .then((r) => r.json())
            .then((d) => setSeries((d.series ?? []) as { date: string; target: number; actual: number }[]))
            .catch(() => setSeries([]));
    }, [month]);

    useEffect(() => {
        const bbox = "-6.55,106.65,-6.00,107.35";
        fetch(`/api/exec/competitor/map?bbox=${encodeURIComponent(bbox)}`)
            .then((r) => r.json())
            .then((d) => setStores((d.items ?? []) as { id: number; name: string; lat: number; lng: number; competitorSharePct: number }[]))
            .catch(() => setStores([]));
    }, []);

    useEffect(() => {
        fetch("/api/exec/partners/performance")
            .then((r) => r.json())
            .then((d) => setPartners((d.items ?? []) as { distributorId: number; distributorName: string; totalQtyTons90d: number; trendPct: number }[]))
            .catch(() => setPartners([]));
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = partners;
        if (q) {
            list = list.filter((p) =>
                String(p.distributorName).toLowerCase().includes(q),
            );
        }
        const dir = sortDir === "asc" ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sortKey === "name") {
                return String(a.distributorName).localeCompare(String(b.distributorName)) * dir;
            }
            if (sortKey === "trend") {
                return (Number(a.trendPct) - Number(b.trendPct)) * dir;
            }
            return (Number(a.totalQtyTons90d) - Number(b.totalQtyTons90d)) * dir;
        });
    }, [partners, search, sortKey, sortDir]);

    function toggleSort(key: typeof sortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    }

    return (
        <div className="space-y-5">
            {/* Page header */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-lg font-semibold">Executive Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Analitik tingkat eksekutif — target, kompetitor, dan performa mitra.</p>
                </div>
            </div>

            {/* KPI summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Total Mitra</div>
                        <div className="mt-1 text-2xl font-bold">{partners.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Vol. Tertinggi (90d)</div>
                        <div className="mt-1 text-2xl font-bold">
                            {partners.length > 0
                                ? `${Math.round(Math.max(...partners.map((p) => Number(p.totalQtyTons90d)))).toLocaleString("id")} t`
                                : "—"}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Avg Trend</div>
                        <div className="mt-1 text-2xl font-bold">
                            {partners.length > 0
                                ? `${(partners.reduce((s, p) => s + Number(p.trendPct), 0) / partners.length).toFixed(1)}%`
                                : "—"}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Toko Dipetakan</div>
                        <div className="mt-1 text-2xl font-bold">{stores.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Target vs Actual</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-3 flex items-center gap-2">
                        <div className="text-sm text-muted-foreground">Bulan</div>
                        <Input className="h-8 w-[140px]" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                    </div>
                    <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={series}>
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
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Competitor Dominance Map</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[380px] overflow-hidden rounded-md border border-border">
                                <ExecMap stores={stores} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Partner Performance</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Input placeholder="Search distributor..." value={search} onChange={(e) => setSearch(e.target.value)} />
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => toggleSort("name")}>Name</Button>
                                <Button variant="outline" size="sm" onClick={() => toggleSort("total")}>Total</Button>
                                <Button variant="outline" size="sm" onClick={() => toggleSort("trend")}>Trend</Button>
                            </div>
                            <div className="max-h-[320px] overflow-auto rounded-md border border-border">
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>Distributor</TH>
                                            <TH className="text-right">Qty 90d</TH>
                                            <TH className="text-right">Trend %</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {filtered.map((p) => (
                                            <TR key={p.distributorId}>
                                                <TD className="font-medium">{p.distributorName}</TD>
                                                <TD className="text-right font-mono">{Number(p.totalQtyTons90d).toFixed(0)}</TD>
                                                <TD className="text-right">
                                                    <Badge variant={Number(p.trendPct) >= 0 ? "success" : "danger"}>
                                                        {Number(p.trendPct) >= 0 ? "+" : ""}{Number(p.trendPct).toFixed(1)}%
                                                    </Badge>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
