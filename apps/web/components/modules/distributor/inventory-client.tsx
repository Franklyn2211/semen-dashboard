"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export type DistributorInventoryResponse = {
    distributor: { id: number; name: string };
    totals: {
        deliveredTons: number;
        soldTons: number;
        estimatedOnHandTons: number;
        note?: string;
    };
    deliveredByCementType: { cementType: string; deliveredTons: number }[];
    recentShipments: {
        id: number;
        status: string;
        cementType: string;
        quantityTons: number;
        departAt: string | null;
        arriveEta: string | null;
        etaMinutes: number;
        fromWarehouse: { id: number; name: string };
    }[];
};

function shipmentStatusBadge(s: string) {
    if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
    if (s === "RECEIVED") return <Badge variant="success">RECEIVED</Badge>;
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    return <Badge variant="secondary">{s || "UNKNOWN"}</Badge>;
}

export function DistributorInventoryClient({ initial }: { initial: DistributorInventoryResponse | null }) {
    const [data, setData] = useState<DistributorInventoryResponse | null>(initial);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/distributor/inventory");
            const d = (await r.json()) as DistributorInventoryResponse;
            setData(d);
        } catch {
            setData(null);
        }
    }, []);

    const totals = data?.totals;

    return (
        <div className="space-y-6">
            <PageHeader
                title="My Inventory"
                description="Ringkasan stok distributor (estimasi) dan shipment terakhir."
                actions={<Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Delivered</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{Number(totals?.deliveredTons ?? 0).toLocaleString("id-ID")}</div>
                        <div className="text-xs text-muted-foreground">Total ton shipment berstatus COMPLETED/RECEIVED.</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Sold</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{Number(totals?.soldTons ?? 0).toLocaleString("id-ID")}</div>
                        <div className="text-xs text-muted-foreground">Total ton dari transaksi (sales orders).</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Estimated On-Hand</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{Number(totals?.estimatedOnHandTons ?? 0).toLocaleString("id-ID")}</div>
                        <div className="text-xs text-muted-foreground">Delivered - Sold (estimasi).</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Delivered by Cement Type</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Cement</TH>
                                <TH className="text-right">Delivered (ton)</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {(data?.deliveredByCementType ?? []).map((r) => (
                                <TR key={r.cementType}>
                                    <TD>
                                        <Badge variant="secondary">{r.cementType}</Badge>
                                    </TD>
                                    <TD className="text-right font-mono font-semibold">{Number(r.deliveredTons).toLocaleString("id-ID")}</TD>
                                </TR>
                            ))}
                            {(data?.deliveredByCementType ?? []).length === 0 ? (
                                <TR>
                                    <TD colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada data.
                                    </TD>
                                </TR>
                            ) : null}
                        </TBody>
                    </Table>
                    {totals?.note ? <div className="mt-2 text-xs text-muted-foreground">{totals.note}</div> : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Shipments</CardTitle>
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
                                <TH>ETA</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {(data?.recentShipments ?? []).map((s) => (
                                <TR key={s.id}>
                                    <TD className="font-medium">#{s.id}</TD>
                                    <TD>{shipmentStatusBadge(s.status)}</TD>
                                    <TD>
                                        <Badge variant="secondary">{s.cementType}</Badge>
                                    </TD>
                                    <TD className="text-right font-mono font-semibold">{Number(s.quantityTons).toLocaleString("id-ID")}</TD>
                                    <TD className="text-xs">{s.fromWarehouse?.name ?? "—"}</TD>
                                    <TD className="text-xs text-muted-foreground">
                                        {s.arriveEta ? new Date(s.arriveEta).toLocaleString("id-ID") : s.etaMinutes ? `${s.etaMinutes} min` : "—"}
                                    </TD>
                                </TR>
                            ))}
                            {(data?.recentShipments ?? []).length === 0 ? (
                                <TR>
                                    <TD colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
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
