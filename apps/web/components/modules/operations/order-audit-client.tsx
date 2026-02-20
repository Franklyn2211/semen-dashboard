"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

type OrderAuditRow = {
    id: number;
    ts: string;
    actorName?: string | null;
    action: string;
    orderRequestId: string;
    metadata?: unknown;
};

export function OrderAuditClient() {
    const [items, setItems] = useState<OrderAuditRow[]>([]);

    useEffect(() => {
        fetch("/api/ops/order-audit")
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as OrderAuditRow[]))
            .catch(() => setItems([]));
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Order Audit"
                description="Jejak keputusan approve/reject order."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Audit Log</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Time</TH>
                                <TH>Actor</TH>
                                <TH>Action</TH>
                                <TH>Order ID</TH>
                                <TH>Metadata</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((r) => (
                                <TR key={r.id}>
                                    <TD className="text-xs font-mono">{new Date(r.ts).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{r.actorName ?? "System"}</TD>
                                    <TD><Badge variant="secondary">{r.action}</Badge></TD>
                                    <TD className="text-xs font-mono">{r.orderRequestId}</TD>
                                    <TD className="text-xs text-muted-foreground">
                                        {r.metadata ? JSON.stringify(r.metadata).slice(0, 120) : "—"}
                                    </TD>
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada data.
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
