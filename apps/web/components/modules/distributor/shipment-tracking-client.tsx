"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export type DistributorShipmentItem = {
    id: number;
    status: string;
    cementType: string;
    quantityTons: number;
    departAt: string | null;
    arriveEta: string | null;
    etaMinutes: number;
    fromWarehouse: { id: number; name: string };
};

function statusBadge(s: string) {
    if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
    if (s === "RECEIVED") return <Badge variant="success">RECEIVED</Badge>;
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    return <Badge variant="secondary">{s || "UNKNOWN"}</Badge>;
}

export function DistributorShipmentTrackingClient({ initial }: { initial: DistributorShipmentItem[] }) {
    const [items, setItems] = useState<DistributorShipmentItem[]>(initial);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/distributor/shipments");
            const d = await r.json();
            setItems((d.items ?? []) as DistributorShipmentItem[]);
        } catch {
            setItems([]);
        }
    }, []);

    const markReceived = useCallback(async (id: number) => {
        setBusyId(id);
        setError(null);
        try {
            const res = await fetch(`/api/distributor/shipments/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "RECEIVED" }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(body?.error?.message ?? "Gagal update status.");
                return;
            }
            await refresh();
        } finally {
            setBusyId(null);
        }
    }, [refresh]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Shipment Tracking"
                description="Tracking shipment menuju distributor ini."
                actions={<Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Shipments</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Status</TH>
                                <TH>Cement</TH>
                                <TH className="text-right">Qty (ton)</TH>
                                <TH>From</TH>
                                <TH>Depart</TH>
                                <TH>ETA</TH>
                                <TH>Action</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((s) => (
                                <TR key={s.id}>
                                    <TD className="font-medium">#{s.id}</TD>
                                    <TD>{statusBadge(s.status)}</TD>
                                    <TD>
                                        <Badge variant="secondary">{s.cementType}</Badge>
                                    </TD>
                                    <TD className="text-right font-mono font-semibold">{Number(s.quantityTons).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{s.fromWarehouse?.name ?? "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">{s.departAt ? new Date(s.departAt).toLocaleString("id-ID") : "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">
                                        {s.arriveEta ? new Date(s.arriveEta).toLocaleString("id-ID") : s.etaMinutes ? `${s.etaMinutes} min` : "—"}
                                    </TD>
                                    <TD>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={s.status !== "COMPLETED" || busyId === s.id}
                                            onClick={() => markReceived(s.id)}
                                        >
                                            Mark received
                                        </Button>
                                    </TD>
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada shipment.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                    {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
                </CardContent>
            </Card>
        </div>
    );
}
