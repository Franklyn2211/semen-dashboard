"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

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

type ApproveDraft = {
    fromWarehouseId: string; // "" means auto
    truckId: string; // "" means none
    departAtLocal: string; // datetime-local string
    reason: string;
};

type ApprovePayload = {
    reason?: string;
    fromWarehouseId?: number;
    truckId?: number;
    departAt?: string;
};

function toISOFromDatetimeLocal(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export function OrdersManagementClient() {
    const [orders, setOrders] = useState<OrderRequest[]>([]);
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [trucks, setTrucks] = useState<Truck[]>([]);

    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draftById, setDraftById] = useState<Record<number, ApproveDraft>>({});

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/orders?status=PENDING");
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

    function getDraft(id: number): ApproveDraft {
        return (
            draftById[id] ?? {
                fromWarehouseId: "",
                truckId: "",
                departAtLocal: "",
                reason: "",
            }
        );
    }

    function setDraft(id: number, patch: Partial<ApproveDraft>) {
        setDraftById((prev) => ({ ...prev, [id]: { ...getDraft(id), ...patch } }));
    }

    async function approve(id: number) {
        setBusyId(id);
        setError(null);
        try {
            const d = getDraft(id);
            const payload: ApprovePayload = {};
            const reason = d.reason?.trim();
            if (reason) payload.reason = reason;
            if (d.fromWarehouseId) payload.fromWarehouseId = Number(d.fromWarehouseId);
            if (d.truckId) payload.truckId = Number(d.truckId);
            const departAt = toISOFromDatetimeLocal(d.departAtLocal);
            if (departAt) payload.departAt = departAt;

            const res = await fetch(`/api/ops/orders/${id}/approve`, {
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
        } finally {
            setBusyId(null);
        }
    }

    async function reject(id: number) {
        setBusyId(id);
        setError(null);
        try {
            const reason = getDraft(id).reason?.trim();
            const res = await fetch(`/api/ops/orders/${id}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(body?.error?.message ?? "Failed to reject order");
                return;
            }
            await refresh();
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Orders Management"
                description="Approve/Reject request distributor. Approve akan cek stok lalu membuat shipment status SCHEDULED."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Pending Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-hidden rounded-lg border border-border">
                        <Table>
                            <THead>
                                <TR>
                                    <TH>ID</TH>
                                    <TH>Distributor</TH>
                                    <TH>Cement</TH>
                                    <TH className="text-right">Qty (ton)</TH>
                                    <TH>Requested</TH>
                                    <TH>Plan</TH>
                                    <TH>Action</TH>
                                </TR>
                            </THead>
                            <TBody>
                                {orders.map((o) => {
                                    const d = getDraft(o.id);
                                    return (
                                        <TR key={o.id}>
                                            <TD className="font-medium">#{o.id}</TD>
                                            <TD className="text-xs">{o.distributor?.name}</TD>
                                            <TD>
                                                <Badge variant="secondary">{o.cementType}</Badge>
                                            </TD>
                                            <TD className="text-right font-mono font-semibold">{Number(o.quantityTons).toLocaleString("id")}</TD>
                                            <TD className="text-xs">{new Date(o.requestedAt).toLocaleString("id-ID")}</TD>
                                            <TD className="min-w-[320px]">
                                                <div className="grid grid-cols-1 gap-2">
                                                    <Select
                                                        options={warehouseOptions}
                                                        value={d.fromWarehouseId}
                                                        onValueChange={(v) => setDraft(o.id, { fromWarehouseId: v })}
                                                    />
                                                    <Select
                                                        options={truckOptions}
                                                        value={d.truckId}
                                                        onValueChange={(v) => setDraft(o.id, { truckId: v })}
                                                    />
                                                    <Input
                                                        type="datetime-local"
                                                        value={d.departAtLocal}
                                                        onChange={(e) => setDraft(o.id, { departAtLocal: e.target.value })}
                                                    />
                                                    <Input
                                                        placeholder="Reason (optional)"
                                                        value={d.reason}
                                                        onChange={(e) => setDraft(o.id, { reason: e.target.value })}
                                                    />
                                                </div>
                                            </TD>
                                            <TD>
                                                <div className="flex items-center gap-2">
                                                    <Button size="xs" variant="success" disabled={busyId !== null} onClick={() => approve(o.id)}>
                                                        Approve
                                                    </Button>
                                                    <Button size="xs" variant="danger" disabled={busyId !== null} onClick={() => reject(o.id)}>
                                                        Reject
                                                    </Button>
                                                    {busyId === o.id ? <span className="text-xs text-muted-foreground">Processing…</span> : null}
                                                </div>
                                            </TD>
                                        </TR>
                                    );
                                })}
                                {orders.length === 0 ? (
                                    <TR>
                                        <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                            Tidak ada order pending.
                                        </TD>
                                    </TR>
                                ) : null}
                            </TBody>
                        </Table>
                    </div>

                    {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
                </CardContent>
            </Card>
        </div>
    );
}
