"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export type DistributorOrderItem = {
    id: number;
    status: string;
    requestedAt: string;
    decidedAt: string | null;
    decisionReason: string;
    approvedShipmentId: number | null;
    cementType: string;
    quantityTons: number;
};

function statusBadge(s: string) {
    if (s === "PENDING") return <Badge variant="secondary">PENDING</Badge>;
    if (s === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
    if (s === "REJECTED") return <Badge variant="danger">REJECTED</Badge>;
    if (s === "FULFILLED") return <Badge variant="default">FULFILLED</Badge>;
    return <Badge variant="secondary">{s || "UNKNOWN"}</Badge>;
}

export function DistributorOrdersClient({ initial }: { initial: DistributorOrderItem[] }) {
    const [items, setItems] = useState<DistributorOrderItem[]>(initial);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/distributor/orders");
            const d = await r.json();
            setItems((d.items ?? []) as DistributorOrderItem[]);
        } catch {
            setItems([]);
        }
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="My Orders"
                description="Riwayat order request untuk distributor ini."
                actions={<Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Status</TH>
                                <TH>Cement</TH>
                                <TH className="text-right">Qty (ton)</TH>
                                <TH>Requested</TH>
                                <TH>Decision</TH>
                                <TH>Shipment</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((o) => (
                                <TR key={o.id}>
                                    <TD className="font-medium">#{o.id}</TD>
                                    <TD>{statusBadge(o.status)}</TD>
                                    <TD>
                                        <Badge variant="secondary">{o.cementType}</Badge>
                                    </TD>
                                    <TD className="text-right font-mono font-semibold">{Number(o.quantityTons).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{o.requestedAt ? new Date(o.requestedAt).toLocaleString("id-ID") : "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">{o.decisionReason || "—"}</TD>
                                    <TD className="text-xs">{o.approvedShipmentId ? `#${o.approvedShipmentId}` : "—"}</TD>
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                                        Belum ada order.
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
