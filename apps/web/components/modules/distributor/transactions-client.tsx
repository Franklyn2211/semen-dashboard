"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";

export type DistributorTxItem = {
    id: number;
    orderDate: string;
    quantityTons: number;
    totalPrice: number;
};

export function DistributorTransactionsClient({ initial }: { initial: DistributorTxItem[] }) {
    const [items, setItems] = useState<DistributorTxItem[]>(initial);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch("/api/distributor/transactions");
            const d = await r.json();
            setItems((d.items ?? []) as DistributorTxItem[]);
        } catch {
            setItems([]);
        }
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Transaction History"
                description="Daftar sales orders untuk distributor ini."
                actions={<Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Date</TH>
                                <TH className="text-right">Qty (ton)</TH>
                                <TH className="text-right">Total</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((t) => (
                                <TR key={t.id}>
                                    <TD className="font-medium">#{t.id}</TD>
                                    <TD className="text-xs">{t.orderDate ? new Date(t.orderDate).toLocaleDateString("id-ID") : "—"}</TD>
                                    <TD className="text-right font-mono font-semibold">{Number(t.quantityTons).toLocaleString("id-ID")}</TD>
                                    <TD className="text-right font-mono">{Number(t.totalPrice).toLocaleString("id-ID")}</TD>
                                </TR>
                            ))}
                            {items.length === 0 ? (
                                <TR>
                                    <TD colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                                        Tidak ada transaksi.
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
