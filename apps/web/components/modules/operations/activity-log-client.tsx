"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

type ActivityRow = {
    id: number;
    ts: string;
    actorName?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
};

export function ActivityLogClient() {
    const [items, setItems] = useState<ActivityRow[]>([]);

    useEffect(() => {
        fetch("/api/ops/activity-log")
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as ActivityRow[]))
            .catch(() => setItems([]));
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Activity & System Log"
                description="Event terbaru dari operasional dan sistem."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Activity Log</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Time</TH>
                                <TH>Actor</TH>
                                <TH>Action</TH>
                                <TH>Entity</TH>
                                <TH>Metadata</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((r) => (
                                <TR key={r.id}>
                                    <TD className="text-xs font-mono">{new Date(r.ts).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{r.actorName ?? "System"}</TD>
                                    <TD><Badge variant="secondary">{r.action}</Badge></TD>
                                    <TD className="text-xs">
                                        <span className="font-mono">{r.entityType}</span> <span className="font-mono text-muted-foreground">{r.entityId}</span>
                                    </TD>
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
