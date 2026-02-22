"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

const OpsMap = dynamic(() => import("./operations-map"), { ssr: false });

type OpsOverview = {
    nationalStockTons: number;
    warehousesCriticalCount: number;
    pendingOrdersToday: number;
    activeShipments: number;
    delayedShipments: number;
    minStockAlerts: number;
    note?: string;
};

type OrderRequest = {
    id: number;
    status: string;
    requestedAt: string;
    cementType: string;
    quantityTons: number;
    distributor: { id: number; name: string };
};

type LogisticsMap = {
    plant: { id: number; name: string; lat: number; lng: number };
    warehouses: { id: number; name: string; lat: number; lng: number }[];
    distributors: { id: number; name: string; lat: number; lng: number }[];
    routes: { polyline: { lat: number; lng: number }[] }[];
};

type ShipmentRow = {
    id: number;
    status: string;
    cementType?: string;
    quantityTons?: number;
    fromWarehouse?: { id: number; name: string };
    toDistributor?: { id: number; name: string };
};

type ShipmentDetail = {
    id: number;
    status: string;
    cementType: string;
    quantityTons: number;
    departAt: string | null;
    arriveEta: string | null;
    fromWarehouse: { id: number; name: string; lat: number; lng: number };
    toDistributor: { id: number; name: string; lat: number; lng: number };
    truck: { id: number | null; code: string | null; name: string | null };
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export function OpsOverviewClient() {
    const router = useRouter();
    const [data, setData] = useState<OpsOverview | null>(null);
    const [requests, setRequests] = useState<OrderRequest[]>([]);
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [shipments, setShipments] = useState<ShipmentRow[]>([]);
    const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
    const [shipmentDetail, setShipmentDetail] = useState<ShipmentDetail | null>(null);

    useEffect(() => {
        fetch("/api/ops/overview")
            .then((r) => r.json())
            .then((d) => setData(d as OpsOverview))
            .catch(() => setData(null));

        fetch("/api/ops/orders")
            .then((r) => r.json())
            .then((d) => {
                const items = (d.items ?? []) as OrderRequest[];
                const sorted = [...items].sort((a, b) => {
                    const at = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
                    const bt = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
                    return bt - at;
                });
                setRequests(sorted.slice(0, 3));
            })
            .catch(() => setRequests([]));

        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) => setLogistics(d as LogisticsMap))
            .catch(() => setLogistics(null));

        fetch("/api/ops/shipments?page=1&pageSize=50")
            .then((r) => r.json())
            .then((d) => setShipments((d.items ?? []) as ShipmentRow[]))
            .catch(() => setShipments([]));
    }, []);

    useEffect(() => {
        if (!selectedShipmentId) {
            setShipmentDetail(null);
            return;
        }
        fetch(`/api/ops/shipments/${selectedShipmentId}`)
            .then((r) => r.json())
            .then((d) => setShipmentDetail(d as ShipmentDetail))
            .catch(() => setShipmentDetail(null));
    }, [selectedShipmentId]);

    const shipmentLines = useMemo(() => {
        if (!logistics) return [] as { id: number; status: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }[];
        const warehousesById = new Map(logistics.warehouses.map((w) => [w.id, w]));
        const distributorsById = new Map(logistics.distributors.map((d) => [d.id, d]));
        return shipments
            .filter((s) => s.status === "SCHEDULED" || s.status === "ON_DELIVERY" || s.status === "DELAYED")
            .map((s) => {
                const w = warehousesById.get(s.fromWarehouse?.id ?? 0);
                const d = distributorsById.get(s.toDistributor?.id ?? 0);
                if (!w || !d) return null;
                return { id: s.id, status: s.status, from: { lat: w.lat, lng: w.lng }, to: { lat: d.lat, lng: d.lng } };
            })
            .filter((v): v is { id: number; status: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } } => v !== null);
    }, [logistics, shipments]);

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
                    <CardTitle>Distribution Map</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                        <div className="lg:col-span-3">
                            <div className="h-[520px] overflow-hidden rounded-lg border border-border">
                                <OpsMap
                                    logistics={logistics}
                                    shipment={null}
                                    shipmentLines={shipmentLines}
                                    onSelectShipment={setSelectedShipmentId}
                                    selectedShipmentId={selectedShipmentId}
                                    showRoutes={false}
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full" style={{ background: "#9ca3af" }} />
                                    SCHEDULED
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full" style={{ background: "#2563eb" }} />
                                    ON DELIVERY
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />
                                    DELAYED
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-1">
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                {shipmentDetail ? (
                                    <div className="space-y-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="font-semibold">Shipment #{shipmentDetail.id}</div>
                                            <Badge variant="secondary">{shipmentDetail.status}</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {shipmentDetail.fromWarehouse?.name} to {shipmentDetail.toDistributor?.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {shipmentDetail.cementType} · {Number(shipmentDetail.quantityTons).toLocaleString("id")} ton
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Delivery date: {shipmentDetail.departAt ? new Date(shipmentDetail.departAt).toLocaleDateString("id-ID") : "—"}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">
                                        Klik garis pengiriman untuk melihat detail pesanan.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Distributor Requests Notification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-border">
                        <Table>
                            <THead>
                                <TR>
                                    <TH>No.</TH>
                                    <TH>Distributor</TH>
                                    <TH>Cement</TH>
                                    <TH className="text-right">Qty (Tons)</TH>
                                    <TH>Requested</TH>
                                    <TH>Status</TH>
                                </TR>
                            </THead>
                            <TBody>
                                {requests.map((r, idx) => (
                                    <TR key={r.id}>
                                        <TD className="font-medium">{idx + 1}</TD>
                                        <TD className="text-xs">{r.distributor?.name ?? "—"}</TD>
                                        <TD>{r.cementType}</TD>
                                        <TD className="text-right font-mono font-semibold">{Number(r.quantityTons).toLocaleString("id")}</TD>
                                        <TD className="text-xs">{r.requestedAt ? new Date(r.requestedAt).toLocaleString("id-ID") : "—"}</TD>
                                        <TD><Badge variant="secondary">{r.status}</Badge></TD>
                                    </TR>
                                ))}
                                {requests.length === 0 ? (
                                    <TR>
                                        <TD colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                                            Tidak ada request terbaru.
                                        </TD>
                                    </TR>
                                ) : null}
                            </TBody>
                        </Table>
                    </div>
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => router.push("/operations/orders")}>
                            View More
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
