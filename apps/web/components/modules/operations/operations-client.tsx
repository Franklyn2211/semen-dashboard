"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const OpsMap = dynamic(() => import("./operations-map"), { ssr: false });

type LogisticsMap = {
    plant: { id: number; name: string; lat: number; lng: number };
    warehouses: { id: number; name: string; lat: number; lng: number }[];
    distributors: { id: number; name: string; lat: number; lng: number }[];
    routes: { polyline: { lat: number; lng: number }[] }[];
};

type StockItem = {
    warehouseId: number;
    warehouseName: string;
    cementType: string;
    quantityTons: number;
    updatedAt: string;
};

type ReorderItem = {
    warehouseId: number;
    warehouseName: string;
    cementType: string;
    quantityTons: number;
    leadTimeDays: number;
    targetStockTons: number;
    urgency: "LOW" | "MED" | "HIGH";
    recommendedQuantityTons: number;
    status: string;
};

type ShipmentSummary = {
    id: number;
    status: string;
    toDistributor: { id: number; name: string };
};

type ShipmentDetail = {
    id: number;
    status: string;
    arriveEta: string | null;
    truck: { lastLat: number | null; lastLng: number | null; lastUpdate: string | null };
    fromWarehouse: { id: number; name: string; lat: number; lng: number };
    toDistributor: { id: number; name: string; lat: number; lng: number };
};

type OrderRequest = {
    id: number;
    status: string;
    requestedAt: string;
    cementType: string;
    quantityTons: number;
    distributor: { id: number; name: string };
    approvedShipmentId?: number | null;
};

export function OperationsClient() {
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [stock, setStock] = useState<StockItem[]>([]);
    const [reorder, setReorder] = useState<ReorderItem[]>([]);
    const [pendingOrders, setPendingOrders] = useState<OrderRequest[]>([]);
    const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
    const [page, setPage] = useState(1);
    const [selectedShipment, setSelectedShipment] = useState<ShipmentSummary | null>(null);
    const [shipmentDetail, setShipmentDetail] = useState<ShipmentDetail | null>(null);
    const [statusBusy, setStatusBusy] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    const [orderBusyId, setOrderBusyId] = useState<number | null>(null);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [orderReasonById, setOrderReasonById] = useState<Record<number, string>>({});

    const refreshStock = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/stock");
            const d = await r.json();
            setStock((d.items ?? []) as StockItem[]);
        } catch {
            setStock([]);
        }
    }, []);

    const refreshReorder = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/prediction/reorder");
            const d = await r.json();
            setReorder((d.items ?? []) as ReorderItem[]);
        } catch {
            setReorder([]);
        }
    }, []);

    const refreshShipments = useCallback(async () => {
        try {
            const r = await fetch(`/api/ops/shipments?page=${page}&pageSize=10`);
            const d = await r.json();
            setShipments((d.items ?? []) as ShipmentSummary[]);
        } catch {
            setShipments([]);
        }
    }, [page]);

    const refreshPendingOrders = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/orders?status=PENDING");
            const d = await r.json();
            setPendingOrders((d.items ?? []) as OrderRequest[]);
        } catch {
            setPendingOrders([]);
        }
    }, []);

    useEffect(() => {
        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) => setLogistics(d as LogisticsMap))
            .catch(() => setLogistics(null));
    }, []);

    useEffect(() => {
        refreshStock();
    }, [refreshStock]);

    useEffect(() => {
        refreshReorder();
    }, [refreshReorder]);

    useEffect(() => {
        refreshPendingOrders();
    }, [refreshPendingOrders]);

    useEffect(() => {
        refreshShipments();
    }, [refreshShipments]);

    useEffect(() => {
        if (!selectedShipment) return;
        fetch(`/api/ops/shipments/${selectedShipment.id}`)
            .then((r) => r.json())
            .then((d) => setShipmentDetail(d as ShipmentDetail))
            .catch(() => setShipmentDetail(null));
    }, [selectedShipment]);

    async function updateShipmentStatus(id: number, status: string) {
        setStatusBusy(true);
        setStatusError(null);
        try {
            const res = await fetch(`/api/ops/shipments/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
                setStatusError(d?.error?.message ?? "Failed to update");
                return;
            }
            // Refresh both shipment list and detail
            const updated = await fetch(`/api/ops/shipments?page=${page}&pageSize=10`);
            const list = await updated.json();
            setShipments((list.items ?? []) as ShipmentSummary[]);
            if (selectedShipment?.id === id) {
                const dr = await fetch(`/api/ops/shipments/${id}`);
                const dd = await dr.json();
                setShipmentDetail(dd as ShipmentDetail);
                setSelectedShipment((prev) => prev ? { ...prev, status } : prev);
            }
        } finally {
            setStatusBusy(false);
        }
    }

    async function approveOrder(id: number) {
        setOrderBusyId(id);
        setOrderError(null);
        try {
            const reason = (orderReasonById[id] ?? "").trim();
            const res = await fetch(`/api/ops/orders/${id}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setOrderError(d?.error?.message ?? "Failed to approve order");
                return;
            }
            await Promise.all([refreshPendingOrders(), refreshShipments(), refreshStock(), refreshReorder()]);
        } finally {
            setOrderBusyId(null);
        }
    }

    async function rejectOrder(id: number) {
        setOrderBusyId(id);
        setOrderError(null);
        try {
            const reason = (orderReasonById[id] ?? "").trim();
            const res = await fetch(`/api/ops/orders/${id}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setOrderError(d?.error?.message ?? "Failed to reject order");
                return;
            }
            await Promise.all([refreshPendingOrders(), refreshReorder()]);
        } finally {
            setOrderBusyId(null);
        }
    }

    const urgencyBadge = (u: string) => {
        if (u === "HIGH") return <Badge variant="danger">HIGH</Badge>;
        if (u === "MED") return <Badge variant="warning">MED</Badge>;
        return <Badge variant="success">LOW</Badge>;
    };

    const statusBadge = (s: string) => {
        if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
        if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
        if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
        if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
        if (s === "CANCELLED") return <Badge variant="danger">CANCELLED</Badge>;
        return <Badge variant="secondary">UNKNOWN</Badge>;
    };

    const canTransition = (from: string, to: string) => {
        if (from === to) return true;
        const allowedNext: Record<string, Record<string, boolean>> = {
            SCHEDULED: { ON_DELIVERY: true, DELAYED: true, COMPLETED: true },
            ON_DELIVERY: { DELAYED: true, COMPLETED: true },
            DELAYED: { ON_DELIVERY: true, COMPLETED: true },
            COMPLETED: {},
        };
        return Boolean(allowedNext[from]?.[to]);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Operations Center"
                description="Monitor logistik, stok gudang, reorder, dan pengiriman secara real-time."
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Peta Logistik</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[420px] overflow-hidden rounded-md border border-border">
                                <OpsMap logistics={logistics} shipment={shipmentDetail} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Stok Gudang</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <THead>
                                    <TR>
                                        <TH>Gudang</TH>
                                        <TH>Tipe Semen</TH>
                                        <TH className="text-right">Qty (ton)</TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {stock.map((s, idx) => (
                                        <TR key={idx}>
                                            <TD className="font-medium">{s.warehouseName}</TD>
                                            <TD><Badge variant="secondary">{s.cementType}</Badge></TD>
                                            <TD className="text-right font-mono font-semibold">{Number(s.quantityTons).toLocaleString("id")}</TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Prediksi Reorder</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {reorder.length === 0 && (
                                <div className="py-4 text-center text-sm text-muted-foreground">Tidak ada reorder pending.</div>
                            )}
                            {reorder.map((r, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${r.urgency === "HIGH" ? "border-red-200 bg-red-50" : r.urgency === "MED" ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
                                        }`}
                                >
                                    <div>
                                        <div className="text-sm font-medium">{r.warehouseName} · {r.cementType}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Rekomendasi: {Number(r.recommendedQuantityTons).toFixed(0)} ton
                                        </div>
                                    </div>
                                    {urgencyBadge(r.urgency)}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Order Requests</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {pendingOrders.length === 0 ? (
                                <div className="py-4 text-center text-sm text-muted-foreground">Tidak ada order pending.</div>
                            ) : null}

                            {pendingOrders.map((o) => (
                                <div key={o.id} className="rounded-lg border border-border p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">
                                                #{o.id} · {o.distributor?.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                <Badge variant="secondary" className="mr-2">{o.cementType}</Badge>
                                                {Number(o.quantityTons).toLocaleString("id")} ton · {new Date(o.requestedAt).toLocaleString("id-ID")}
                                            </div>
                                        </div>
                                        <Badge variant="secondary">{o.status}</Badge>
                                    </div>

                                    <Input
                                        placeholder="Reason (optional)"
                                        value={orderReasonById[o.id] ?? ""}
                                        onChange={(e) =>
                                            setOrderReasonById((prev) => ({ ...prev, [o.id]: e.target.value }))
                                        }
                                    />

                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="xs"
                                            variant="success"
                                            disabled={orderBusyId !== null}
                                            onClick={() => approveOrder(o.id)}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="danger"
                                            disabled={orderBusyId !== null}
                                            onClick={() => rejectOrder(o.id)}
                                        >
                                            Reject
                                        </Button>
                                        {orderBusyId === o.id ? (
                                            <div className="text-xs text-muted-foreground">Processing…</div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}

                            {orderError ? <div className="text-xs text-red-600">{orderError}</div> : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Pengiriman</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="max-h-[320px] overflow-auto rounded-md border border-border">
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>ID</TH>
                                            <TH>Status</TH>
                                            <TH>To</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {shipments.map((s) => (
                                            <TR
                                                key={s.id}
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    setSelectedShipment(s);
                                                    setShipmentDetail(null);
                                                }}
                                            >
                                                <TD>#{s.id}</TD>
                                                <TD>{statusBadge(s.status)}</TD>
                                                <TD className="max-w-[100px] truncate text-xs">{s.toDistributor?.name}</TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            </div>
                            <div className="flex items-center justify-between">
                                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                    Prev
                                </Button>
                                <div className="text-xs text-muted-foreground">Page {page}</div>
                                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                                    Next
                                </Button>
                            </div>
                            {/* Status update panel */}
                            {selectedShipment && (
                                <div className="mt-2 rounded-lg border border-border bg-muted/50 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-semibold text-foreground">
                                            Pengiriman #{selectedShipment.id}
                                        </div>
                                        {statusBadge(selectedShipment.status)}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {["SCHEDULED", "ON_DELIVERY", "DELAYED", "COMPLETED"].map((s) => (
                                            <Button
                                                key={s}
                                                size="xs"
                                                variant={
                                                    selectedShipment.status === s
                                                        ? s === "COMPLETED" ? "success" : s === "DELAYED" ? "danger" : "default"
                                                        : "outline"
                                                }
                                                disabled={statusBusy || selectedShipment.status === s || !canTransition(selectedShipment.status, s)}
                                                onClick={() => updateShipmentStatus(selectedShipment.id, s)}
                                            >
                                                {s}
                                            </Button>
                                        ))}
                                    </div>
                                    {statusError && (
                                        <div className="text-xs text-red-600">{statusError}</div>
                                    )}
                                </div>
                            )}          </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
