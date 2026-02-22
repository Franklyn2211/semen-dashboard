"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog, DialogBody, DialogCard, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LogisticsMap = {
    warehouses: { id: number; name: string }[];
};

type Truck = {
    id: number;
    code: string;
    name: string;
    active: boolean;
};

type OrderRequest = {
    id: number;
    status: string;
    requestedAt: string;
    cementType: string;
    quantityTons: number;
    distributor: { id: number; name: string };
};

type ApprovePayload = {
    reason?: string;
    fromWarehouseId?: number;
    truckId?: number;
    departAt?: string;
};

function toISOFromDate(value: string): string | null {
    if (!value) return null;
    const d = new Date(`${value}T00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export function OrdersManagementClient() {
    const [orders, setOrders] = useState<OrderRequest[]>([]);
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [trucks, setTrucks] = useState<Truck[]>([]);

    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const [activeOrder, setActiveOrder] = useState<OrderRequest | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("");
    const [truckId, setTruckId] = useState<string>("");
    const [deliveryDate, setDeliveryDate] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [modalError, setModalError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/orders");
            const d = await r.json();
            setOrders((d.items ?? []) as OrderRequest[]);
        } catch {
            setOrders([]);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) => setLogistics(d as LogisticsMap))
            .catch(() => setLogistics(null));

        fetch("/api/ops/trucks")
            .then((r) => r.json())
            .then((d) => setTrucks((d.items ?? []) as Truck[]))
            .catch(() => setTrucks([]));
    }, []);

    const warehouseOptions: SelectOption[] = useMemo(() => {
        const opts: SelectOption[] = [{ value: "", label: "Auto-select warehouse" }];
        for (const w of logistics?.warehouses ?? []) {
            opts.push({ value: String(w.id), label: `${w.name} (#${w.id})` });
        }
        return opts;
    }, [logistics]);

    const truckOptions: SelectOption[] = useMemo(() => {
        const opts: SelectOption[] = [{ value: "", label: "No truck" }];
        for (const t of trucks) {
            opts.push({ value: String(t.id), label: `${t.code} · ${t.name}` + (t.active ? "" : " (inactive)"), disabled: !t.active });
        }
        return opts;
    }, [trucks]);

    const sortedOrders = useMemo(() => {
        return [...orders].sort((a, b) => {
            const at = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
            const bt = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
            if (bt !== at) return bt - at;
            return b.id - a.id;
        });
    }, [orders]);

    const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
    const pagedOrders = sortedOrders.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    function openModal(order: OrderRequest) {
        setActiveOrder(order);
        setSourceWarehouseId("");
        setTruckId("");
        setDeliveryDate("");
        setReason("");
        setModalError(null);
        setModalOpen(true);
    }

    function closeModal() {
        if (busyId !== null) return;
        setModalOpen(false);
    }

    async function approve() {
        if (!activeOrder) return;
        setBusyId(activeOrder.id);
        setError(null);
        setModalError(null);
        try {
            const payload: ApprovePayload = {};
            const reasonValue = reason.trim();
            if (reasonValue) payload.reason = reasonValue;
            if (sourceWarehouseId) payload.fromWarehouseId = Number(sourceWarehouseId);
            if (truckId) payload.truckId = Number(truckId);
            const departAt = toISOFromDate(deliveryDate);
            if (departAt) payload.departAt = departAt;

            const res = await fetch(`/api/ops/orders/${activeOrder.id}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(body?.error?.message ?? "Failed to approve order");
                return;
            }
            await refresh();
            setModalOpen(false);
        } finally {
            setBusyId(null);
        }
    }

    async function reject() {
        if (!activeOrder) return;
        const trimmedReason = reason.trim();
        if (!trimmedReason) {
            setModalError("Reason is required for rejection.");
            return;
        }
        setBusyId(activeOrder.id);
        setError(null);
        setModalError(null);
        try {
            const res = await fetch(`/api/ops/orders/${activeOrder.id}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: trimmedReason }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(body?.error?.message ?? "Failed to reject order");
                return;
            }
            await refresh();
            setModalOpen(false);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Orders / Requests"
                description="Process distributor requests. Approve akan membuat shipment status SCHEDULED."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Distributor Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-hidden rounded-lg border border-border">
                        <Table>
                            <THead>
                                <TR>
                                    <TH>No.</TH>
                                    <TH>Distributor</TH>
                                    <TH>Cement</TH>
                                    <TH className="text-right">Qty (ton)</TH>
                                    <TH>Requested</TH>
                                    <TH>Status</TH>
                                    <TH>Action</TH>
                                </TR>
                            </THead>
                            <TBody>
                                {pagedOrders.map((o, idx) => (
                                    <TR key={o.id}>
                                        <TD className="font-medium">{(page - 1) * pageSize + idx + 1}</TD>
                                        <TD className="text-xs">{o.distributor?.name}</TD>
                                        <TD>
                                            <Badge variant="secondary">{o.cementType}</Badge>
                                        </TD>
                                        <TD className="text-right font-mono font-semibold">{Number(o.quantityTons).toLocaleString("id")}</TD>
                                        <TD className="text-xs">{new Date(o.requestedAt).toLocaleString("id-ID")}</TD>
                                        <TD><Badge variant="secondary">{o.status}</Badge></TD>
                                        <TD>
                                            <Button size="xs" variant="outline" disabled={o.status !== "PENDING"} onClick={() => openModal(o)}>
                                                Action
                                            </Button>
                                            {busyId === o.id ? <div className="mt-1 text-xs text-muted-foreground">Processing…</div> : null}
                                        </TD>
                                    </TR>
                                ))}
                                {pagedOrders.length === 0 ? (
                                    <TR>
                                        <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                            Tidak ada request.
                                        </TD>
                                    </TR>
                                ) : null}
                            </TBody>
                        </Table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Previous
                        </Button>
                        <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
                        <Button variant="outline" size="sm" disabled={pagedOrders.length < pageSize} onClick={() => setPage((p) => p + 1)}>
                            Next
                        </Button>
                    </div>

                    {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
                </CardContent>
            </Card>

            <Dialog open={modalOpen} onClose={closeModal}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>Process Distributor Request</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="text-sm text-muted-foreground">
                            {activeOrder ? `${activeOrder.distributor?.name} · ${activeOrder.cementType} · ${Number(activeOrder.quantityTons).toLocaleString("id")} ton` : ""}
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <div className="mb-1 text-xs font-semibold text-muted-foreground">Source Warehouse</div>
                                <Select options={warehouseOptions} value={sourceWarehouseId} onValueChange={setSourceWarehouseId} />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-semibold text-muted-foreground">Truck Number</div>
                                <Select options={truckOptions} value={truckId} onValueChange={setTruckId} />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-semibold text-muted-foreground">Delivery Date</div>
                                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-semibold text-muted-foreground">Reason (required for rejection)</div>
                                <textarea
                                    className="min-h-[90px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                                    placeholder="Provide a reason when rejecting the request..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </div>
                            {modalError ? <div className="text-xs text-red-600">{modalError}</div> : null}
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" size="sm" disabled={busyId !== null} onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button variant="danger" size="sm" disabled={busyId !== null} onClick={reject}>
                            Reject
                        </Button>
                        <Button variant="success" size="sm" disabled={busyId !== null} onClick={approve}>
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </div>
    );
}
