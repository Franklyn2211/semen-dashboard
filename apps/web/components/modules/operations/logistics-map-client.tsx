"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const OpsMap = dynamic(() => import("./operations-map"), { ssr: false });

type LogisticsMap = {
    plant: { id: number; name: string; lat: number; lng: number };
    warehouses: { id: number; name: string; lat: number; lng: number }[];
    distributors: { id: number; name: string; lat: number; lng: number }[];
    routes: { polyline: { lat: number; lng: number }[] }[];
};

type ShipmentSummary = {
    id: number;
    status: string;
    etaMinutes?: number;
    fromWarehouse?: { id: number; name: string };
    toDistributor?: { id: number; name: string };
};

type ShipmentDetail = {
    id: number;
    status: string;
    etaMinutes: number;
    truck?: { lastLat: number | null; lastLng: number | null; lastUpdate: string | null } | null;
    fromWarehouse: { id: number; name: string; lat: number; lng: number };
    toDistributor: { id: number; name: string; lat: number; lng: number };
};

function statusBadge(s: string) {
    if (s === "COMPLETED") return <Badge variant="success">COMPLETED</Badge>;
    if (s === "ON_DELIVERY") return <Badge variant="default">ON DELIVERY</Badge>;
    if (s === "DELAYED") return <Badge variant="warning">DELAYED</Badge>;
    if (s === "SCHEDULED") return <Badge variant="secondary">SCHEDULED</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
}

export function LogisticsMapClient() {
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
    const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ShipmentDetail | null>(null);

    useEffect(() => {
        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) => setLogistics(d as LogisticsMap))
            .catch(() => setLogistics(null));

        fetch("/api/ops/shipments?page=1&pageSize=50")
            .then((r) => r.json())
            .then((d) => {
                const items = (d.items ?? []) as ShipmentSummary[];
                setShipments(items.filter((s) => ["SCHEDULED", "ON_DELIVERY", "DELAYED"].includes(s.status)));
            })
            .catch(() => setShipments([]));
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        fetch(`/api/ops/shipments/${selectedId}`)
            .then((r) => r.json())
            .then((d) => setDetail(d as ShipmentDetail))
            .catch(() => setDetail(null));
    }, [selectedId]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Logistics Map"
                description="Peta pabrik, gudang, distributor, rute dummy, dan tracking shipment aktif (simulasi)."
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Map</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[520px] overflow-hidden rounded-md border border-border">
                                <OpsMap logistics={logistics} shipment={detail} />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Active Shipments</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-[520px] overflow-auto rounded-md border border-border">
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>ID</TH>
                                            <TH>Status</TH>
                                            <TH className="text-right">ETA</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {shipments.map((s) => (
                                            <TR
                                                key={s.id}
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    setSelectedId(s.id);
                                                    setDetail(null);
                                                }}
                                            >
                                                <TD className="font-medium">#{s.id}</TD>
                                                <TD>{statusBadge(s.status)}</TD>
                                                <TD className="text-right font-mono">{typeof s.etaMinutes === "number" ? Math.max(0, Math.round(s.etaMinutes)).toLocaleString("id") : "—"}</TD>
                                            </TR>
                                        ))}
                                        {shipments.length === 0 ? (
                                            <TR>
                                                <TD colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                                                    Tidak ada shipment aktif.
                                                </TD>
                                            </TR>
                                        ) : null}
                                    </TBody>
                                </Table>
                            </div>
                            {detail ? (
                                <div className="mt-3 text-xs text-muted-foreground">
                                    Selected shipment #{detail.id} · Last update: {detail.truck?.lastUpdate ? new Date(detail.truck.lastUpdate).toLocaleString("id-ID") : "—"}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
