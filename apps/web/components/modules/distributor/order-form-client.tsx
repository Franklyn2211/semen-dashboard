"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";

type CreateOrderResponse = { id: number; requestedAt: string };

export function DistributorOrderFormClient() {
    const cementOptions: SelectOption[] = useMemo(
        () => [
            { value: "", label: "Select cement type", disabled: true },
            { value: "OPC", label: "OPC" },
            { value: "PPC", label: "PPC" },
            { value: "SRC", label: "SRC" },
        ],
        [],
    );

    const [cementType, setCementType] = useState<string>("");
    const [qty, setQty] = useState<string>("");

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreateOrderResponse | null>(null);

    async function submit() {
        setBusy(true);
        setError(null);
        setCreated(null);
        try {
            const quantityTons = Number(qty);
            if (!cementType) {
                setError("cementType required");
                return;
            }
            if (!quantityTons || quantityTons <= 0) {
                setError("quantityTons must be > 0");
                return;
            }

            const res = await fetch("/api/distributor/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cementType, quantityTons }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(body?.error?.message ?? "Failed to create order");
                return;
            }
            const d = (await res.json()) as CreateOrderResponse;
            setCreated(d);
            setQty("");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Order Semen"
                description="Buat permintaan order ke tim Operations (status awal: PENDING)."
            />

            <Card>
                <CardHeader>
                    <CardTitle>New Order Request</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Select options={cementOptions} value={cementType} onValueChange={setCementType} />
                        <Input type="number" placeholder="Quantity (tons)" value={qty} onChange={(e) => setQty(e.target.value)} />
                        <Button onClick={submit} disabled={busy}>
                            Submit
                        </Button>
                    </div>

                    {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}

                    {created ? (
                        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                            <div className="font-medium">Order created</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                    ID: <Badge variant="secondary">#{created.id}</Badge>
                                </span>
                                <span>Requested: {new Date(created.requestedAt).toLocaleString("id-ID")}</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">Lihat status di menu <span className="font-medium">My Orders</span>.</div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
