"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

type RegionalStockRow = {
    warehouseId: number;
    warehouseName: string;
    stockTons: number;
};

type OpsOverview = {
    nationalStockTons: number;
    regionalStock: RegionalStockRow[];
    warehousesCriticalCount: number;
    pendingOrdersToday: number;
    activeShipments: number;
    delayedShipments: number;
    minStockAlerts: number;
    note?: string;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export function OpsOverviewClient() {
    const [data, setData] = useState<OpsOverview | null>(null);

    useEffect(() => {
        fetch("/api/ops/overview")
            .then((r) => r.json())
            .then((d) => setData(d as OpsOverview))
            .catch(() => setData(null));
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Global Operations Overview"
                description="Ringkasan stok, alert, dan shipment aktif."
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">National Stock</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? `${Math.round(num(data.nationalStockTons)).toLocaleString("id")} t` : "—"}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Active Shipments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? data.activeShipments : "—"}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Pending Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? data.pendingOrdersToday : "—"}</div>
                        <div className="text-xs text-muted-foreground">Request order distributor yang masih PENDING (hari ini).</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Critical Warehouses</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-2">
                        <div className="text-2xl font-bold">{data ? data.warehousesCriticalCount : "—"}</div>
                        {data ? (
                            <Badge variant={data.warehousesCriticalCount > 0 ? "danger" : "secondary"}>
                                {data.warehousesCriticalCount > 0 ? "RISK" : "OK"}
                            </Badge>
                        ) : null}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Min Stock Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data ? data.minStockAlerts : "—"}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Shipment Delays</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-2">
                        <div className="text-2xl font-bold">{data ? data.delayedShipments : "—"}</div>
                        {data ? (
                            <Badge variant={data.delayedShipments > 0 ? "warning" : "secondary"}>
                                {data.delayedShipments > 0 ? "ATTENTION" : "OK"}
                            </Badge>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Regional Stock (Warehouse)</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Warehouse</TH>
                                <TH className="text-right">Stock (ton)</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {(data?.regionalStock ?? []).map((r) => (
                                <TR key={r.warehouseId}>
                                    <TD className="font-medium">{r.warehouseName}</TD>
                                    <TD className="text-right font-mono font-semibold">{Math.round(num(r.stockTons)).toLocaleString("id")}</TD>
                                </TR>
                            ))}
                            {data && (data.regionalStock?.length ?? 0) === 0 ? (
                                <TR>
                                    <TD colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada data.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                    {data?.note ? <div className="mt-3 text-xs text-muted-foreground">{data.note}</div> : null}
                </CardContent>
            </Card>
        </div>
    );
}
