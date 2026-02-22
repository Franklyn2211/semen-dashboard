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
    distributors: { id: number; name: string }[];
};

type Truck = { id: number; code: string; name: string; active: boolean };

type ShipmentRow = {
    id: number;
    status: string;
    cementType?: string;
    quantityTons?: number;
    etaMinutes?: number;
    fromWarehouse?: { id: number; name: string };
    toDistributor?: { id: number; name: string };
    truck?: { id?: number | null; code?: string | null; name?: string | null };
};

type ShipmentDetail = {
    id: number;
    status: string;
    departAt: string | null;
    arriveEta: string | null;
    etaMinutes: number;
    cementType: string;
    quantityTons: number;
    fromWarehouse: { id: number; name: string };
    toDistributor: { id: number; name: string };
    truck: { id: number | null; code: string | null; name: string | null };
};

type PatchShipmentPayload = {
    fromWarehouseId: number;
    toDistributorId: number;
    truckId?: number;
    departAt?: string;
};

function statusBadge(s: string) {
    if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    if (s === "CANCELLED") return <Badge variant="danger">CANCELLED</Badge>;
    return <Badge variant="secondary">UNKNOWN</Badge>;
}

export function ShipmentsClient({ role }: { role: string }) {
    const [items, setItems] = useState<ShipmentRow[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ShipmentDetail | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const [overrideEnabled, setOverrideEnabled] = useState(false);
    const canEdit = role === "OPERATOR" || (role === "SUPER_ADMIN" && overrideEnabled);

    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [trucks, setTrucks] = useState<Truck[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [assignFromWarehouseId, setAssignFromWarehouseId] = useState<string>("");
    const [assignToDistributorId, setAssignToDistributorId] = useState<string>("");
    const [assignTruckId, setAssignTruckId] = useState<string>("");
    const [assignDepartAtLocal, setAssignDepartAtLocal] = useState<string>("");

    const [filterStatus, setFilterStatus] = useState<string>("");
    const [filterWarehouseId, setFilterWarehouseId] = useState<string>("");
    const [filterDistributorId, setFilterDistributorId] = useState<string>("");
    const [search, setSearch] = useState<string>("");

    const refreshList = useCallback(async () => {
        try {
            const r = await fetch(`/api/ops/shipments?page=${page}&pageSize=${pageSize}`);
            const d = await r.json();
            setItems((d.items ?? []) as ShipmentRow[]);
        } catch {
            setItems([]);
        }
    }, [page, pageSize]);

    useEffect(() => {
        refreshList();

        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) => setLogistics(d as LogisticsMap))
            .catch(() => setLogistics(null));

        fetch("/api/ops/trucks")
            .then((r) => r.json())
            .then((d) => setTrucks((d.items ?? []) as Truck[]))
            .catch(() => setTrucks([]));
    }, [refreshList]);

    useEffect(() => {
        setSelectedId(null);
    }, [page]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        fetch(`/api/ops/shipments/${selectedId}`)
            .then((r) => r.json())
            .then((d) => setDetail(d as ShipmentDetail))
            .catch(() => setDetail(null));
    }, [selectedId]);

    useEffect(() => {
        if (!detail) return;
        setAssignFromWarehouseId(String(detail.fromWarehouse?.id ?? ""));
        setAssignToDistributorId(String(detail.toDistributor?.id ?? ""));
        setAssignTruckId(detail.truck?.id != null ? String(detail.truck.id) : "");
        setAssignDepartAtLocal(detail.departAt ? new Date(detail.departAt).toISOString().slice(0, 16) : "");
    }, [detail]);

    const warehouseOptions: SelectOption[] = useMemo(() => {
        const opts: SelectOption[] = [{ value: "", label: "Select warehouse", disabled: true }];
        for (const w of logistics?.warehouses ?? []) {
            opts.push({ value: String(w.id), label: `${w.name} (#${w.id})` });
        }
        return opts;
    }, [logistics]);

    const distributorOptions: SelectOption[] = useMemo(() => {
        const opts: SelectOption[] = [{ value: "", label: "Select distributor", disabled: true }];
        for (const d of logistics?.distributors ?? []) {
            opts.push({ value: String(d.id), label: `${d.name} (#${d.id})` });
        }
        return opts;
    }, [logistics]);

    const statusOptions: SelectOption[] = useMemo(
        () => [
            { value: "", label: "All status", disabled: true },
            { value: "SCHEDULED", label: "SCHEDULED" },
            { value: "ON_DELIVERY", label: "ON_DELIVERY" },
            { value: "DELAYED", label: "DELAYED" },
            { value: "COMPLETED", label: "COMPLETED" },
            { value: "CANCELLED", label: "CANCELLED" },
        ],
        [],
    );

    const visibleItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((s) => {
            if (filterStatus && s.status !== filterStatus) return false;
            if (filterWarehouseId && String(s.fromWarehouse?.id ?? "") !== filterWarehouseId) return false;
            if (filterDistributorId && String(s.toDistributor?.id ?? "") !== filterDistributorId) return false;
            if (!q) return true;
            const hay = [
                String(s.id ?? ""),
                s.status ?? "",
                s.fromWarehouse?.name ?? "",
                s.toDistributor?.name ?? "",
                s.cementType ?? "",
                String(s.truck?.code ?? ""),
                String(s.truck?.name ?? ""),
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [filterDistributorId, filterStatus, filterWarehouseId, items, search]);

    const truckOptions: SelectOption[] = useMemo(() => {
        const opts: SelectOption[] = [{ value: "", label: "No truck" }];
        for (const t of trucks) {
            opts.push({ value: String(t.id), label: `${t.code} · ${t.name}` + (t.active ? "" : " (inactive)"), disabled: !t.active });
        }
        return opts;
    }, [trucks]);

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

    async function saveAssignment() {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const payload: PatchShipmentPayload = {
                fromWarehouseId: Number(assignFromWarehouseId),
                toDistributorId: Number(assignToDistributorId),
            };
            if (assignTruckId) payload.truckId = Number(assignTruckId);
            if (assignDepartAtLocal) {
                const d = new Date(assignDepartAtLocal);
                if (!Number.isNaN(d.getTime())) payload.departAt = d.toISOString();
            }
            const res = await fetch(`/api/ops/shipments/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Failed to update shipment");
                return;
            }
            await Promise.all([
                refreshList(),
                fetch(`/api/ops/shipments/${selectedId}`)
                    .then((r) => r.json())
                    .then((d) => setDetail(d as ShipmentDetail))
                    .catch(() => setDetail(null)),
            ]);
        } finally {
            setBusy(false);
        }
    }

    async function updateStatus(next: string) {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/ops/shipments/${selectedId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: next }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Failed to update status");
                return;
            }
            await Promise.all([
                refreshList(),
                fetch(`/api/ops/shipments/${selectedId}`)
                    .then((r) => r.json())
                    .then((d) => setDetail(d as ShipmentDetail))
                    .catch(() => setDetail(null)),
            ]);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="All Shipments"
                description="Atur assignment (warehouse/distributor/truck/schedule) dan update lifecycle status."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <Select options={statusOptions} value={filterStatus} onValueChange={setFilterStatus} />
                        <Select options={warehouseOptions} value={filterWarehouseId} onValueChange={setFilterWarehouseId} />
                        <Select options={distributorOptions} value={filterDistributorId} onValueChange={setFilterDistributorId} />
                        <Input placeholder="Search id/status/warehouse/distributor/truck..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Filter bekerja di sisi client. SUPER_ADMIN bisa enable override untuk emergency patch shipment.</div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Shipments</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-hidden rounded-lg border border-border">
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>ID</TH>
                                            <TH>Status</TH>
                                            <TH>From</TH>
                                            <TH>To</TH>
                                            <TH>Cement</TH>
                                            <TH className="text-right">Qty (ton)</TH>
                                            <TH className="text-right">ETA (min)</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {visibleItems.map((s) => (
                                            <TR key={s.id} className="cursor-pointer" onClick={() => setSelectedId(s.id)}>
                                                <TD className="font-medium">#{s.id}</TD>
                                                <TD>{statusBadge(s.status)}</TD>
                                                <TD className="text-xs">{s.fromWarehouse?.name ?? "—"}</TD>
                                                <TD className="text-xs">{s.toDistributor?.name ?? "—"}</TD>
                                                <TD><Badge variant="secondary">{s.cementType ?? "—"}</Badge></TD>
                                                <TD className="text-right font-mono font-semibold">{typeof s.quantityTons === "number" ? Number(s.quantityTons).toLocaleString("id") : "—"}</TD>
                                                <TD className="text-right font-mono">{typeof s.etaMinutes === "number" ? Math.max(0, Math.round(Number(s.etaMinutes))).toLocaleString("id") : "—"}</TD>
                                            </TR>
                                        ))}
                                        {visibleItems.length === 0 ? (
                                            <TR>
                                                <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                                    Tidak ada data.
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
                                <div className="text-xs text-muted-foreground">Page {page}</div>
                                <Button variant="outline" size="sm" disabled={items.length < pageSize} onClick={() => setPage((p) => p + 1)}>
                                    Next
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Shipment Arrangement</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {!detail ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">Select a shipment.</div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-medium">#{detail.id}</div>
                                        {statusBadge(detail.status)}
                                    </div>

                                    <div className="grid grid-cols-1 gap-2">
                                        <Select options={warehouseOptions} value={assignFromWarehouseId} onValueChange={setAssignFromWarehouseId} disabled={!canEdit} />
                                        <Select options={distributorOptions} value={assignToDistributorId} onValueChange={setAssignToDistributorId} disabled={!canEdit} />
                                        <Select options={truckOptions} value={assignTruckId} onValueChange={setAssignTruckId} disabled={!canEdit} />
                                        <Input type="datetime-local" value={assignDepartAtLocal} onChange={(e) => setAssignDepartAtLocal(e.target.value)} disabled={!canEdit} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" disabled={!canEdit || busy} onClick={saveAssignment}>
                                            Save
                                        </Button>
                                        <div className="text-xs text-muted-foreground">
                                            ETA: {detail.etaMinutes != null ? Math.max(0, Math.round(detail.etaMinutes)).toLocaleString("id") : "—"} min
                                        </div>
                                    </div>

                                    {role === "SUPER_ADMIN" ? (
                                        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                                            <div className="font-semibold">Emergency override</div>
                                            <div className="mt-0.5 text-muted-foreground">Default read-only. Enable override to edit shipment assignment/status.</div>
                                            <div className="mt-2">
                                                <Button
                                                    size="xs"
                                                    variant={overrideEnabled ? "danger" : "outline"}
                                                    disabled={busy}
                                                    onClick={() => setOverrideEnabled((v) => !v)}
                                                >
                                                    {overrideEnabled ? "Disable Override" : "Enable Override"}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : role !== "OPERATOR" ? (
                                        <div className="text-xs text-muted-foreground">Read-only mode for {role}.</div>
                                    ) : null}

                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold text-muted-foreground">Lifecycle</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["SCHEDULED", "ON_DELIVERY", "DELAYED", "COMPLETED"].map((s) => (
                                                <Button
                                                    key={s}
                                                    size="xs"
                                                    variant={detail.status === s ? (s === "COMPLETED" ? "success" : s === "DELAYED" ? "danger" : "default") : "outline"}
                                                    disabled={!canEdit || busy || detail.status === s || !canTransition(detail.status, s)}
                                                    onClick={() => updateStatus(s)}
                                                >
                                                    {s}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {error ? <div className="text-xs text-red-600">{error}</div> : null}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
