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
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    return <Badge variant="secondary">{s || "UNKNOWN"}</Badge>;
}

export function DistributorShipmentTrackingClient({ initial }: { initial: DistributorShipmentItem[] }) {
    const [items, setItems] = useState<DistributorShipmentItem[]>(initial);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/distributor/shipments");
            const d = await r.json();
            setItems((d.items ?? []) as DistributorShipmentItem[]);
        } catch {
            setItems([]);
        }
    }, []);

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
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada shipment.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
