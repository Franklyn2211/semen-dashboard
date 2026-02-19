"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";

const PlanningMap = dynamic(() => import("./planning-map"), { ssr: false });

type HeatCell = {
    cellLat: number;
    cellLng: number;
    centerLat: number;
    centerLng: number;
    size: number;
    score: number;
};

type WhitespaceArea = {
    cellLat: number;
    cellLng: number;
    centerLat: number;
    centerLng: number;
    size: number;
    score: number;
    nearestStoreKm: number;
    nearestDistributorKm: number;
};

type LogisticsEntity = {
    id: number;
    name: string;
    lat: number;
    lng: number;
    capacityTons?: number;
    serviceRadiusKm?: number;
};

type CatchmentKind = "warehouse" | "distributor";

type CatchmentResponse = {
    entity: {
        kind: CatchmentKind | string;
        id: number;
        name: string;
        lat: number;
        lng: number;
        radiusKm: number;
    };
    conflicts: unknown[];
};

type SiteProfile = {
    score: number;
    reasons: string[];
    roadWidthM: number;
    demandWithin3km: number;
    distanceToWarehouseKm: number;
};

export type PlanningMode = "site" | "expansion" | "market";

export function PlanningClient({ mode }: { mode: PlanningMode }) {
    const [bbox, setBbox] = useState<string>("-6.55,106.65,-6.00,107.35");
    const [cells, setCells] = useState<HeatCell[]>([]);
    const [whitespaceOn, setWhitespaceOn] = useState(false);
    const [whitespace, setWhitespace] = useState<WhitespaceArea[]>([]);
    const [clicked, setClicked] = useState<{ lat: number; lng: number } | null>(null);
    const [profile, setProfile] = useState<SiteProfile | null>(null);
    const [catchmentEntity, setCatchmentEntity] = useState<
        { kind: "warehouse" | "distributor"; id: number } | undefined
    >(undefined);
    const [catchment, setCatchment] = useState<
        | CatchmentResponse
        | null
    >(null);
    const [entities, setEntities] = useState<{
        warehouses: LogisticsEntity[];
        distributors: LogisticsEntity[];
    }>({ warehouses: [], distributors: [] });

    useEffect(() => {
        // Reset irrelevant state when switching focus
        if (mode !== "expansion") {
            setWhitespaceOn(false);
            setWhitespace([]);
            setCatchmentEntity(undefined);
            setCatchment(null);
        }
        if (mode !== "site") {
            setClicked(null);
            setProfile(null);
        }
    }, [mode]);

    useEffect(() => {
        fetch(`/api/planning/heatmap?bbox=${encodeURIComponent(bbox)}`)
            .then((r) => r.json())
            .then((d) => setCells(d.cells ?? []))
            .catch(() => setCells([]));
    }, [bbox]);

    useEffect(() => {
        fetch("/api/ops/logistics/map")
            .then((r) => r.json())
            .then((d) =>
                setEntities({
                    warehouses: (d.warehouses ?? []) as LogisticsEntity[],
                    distributors: (d.distributors ?? []) as LogisticsEntity[],
                }),
            )
            .catch(() => setEntities({ warehouses: [], distributors: [] }));
    }, []);

    useEffect(() => {
        if (!whitespaceOn) return;
        fetch(`/api/planning/whitespace?bbox=${encodeURIComponent(bbox)}`)
            .then((r) => r.json())
            .then((d) => setWhitespace((d.areas ?? []) as WhitespaceArea[]))
            .catch(() => setWhitespace([]));
    }, [bbox, whitespaceOn]);

    useEffect(() => {
        if (!catchmentEntity) return;
        const qs =
            catchmentEntity.kind === "warehouse"
                ? `warehouseId=${catchmentEntity.id}`
                : `distributorId=${catchmentEntity.id}`;
        fetch(`/api/planning/catchment?${qs}`)
            .then((r) => r.json())
            .then((d) => setCatchment(d as CatchmentResponse))
            .catch(() => setCatchment(null));
    }, [catchmentEntity]);

    async function loadProfile(lat: number, lng: number) {
        setClicked({ lat, lng });
        setProfile(null);
        const res = await fetch(
            `/api/planning/site-profile?lat=${lat}&lng=${lng}`,
        ).catch(() => null);
        if (!res || !res.ok) return;
        const data = (await res.json()) as SiteProfile;
        setProfile(data);
    }

    const catchmentOptions = useMemo(() => {
        const wh = entities.warehouses.map((w) => ({
            key: `w:${w.id}`,
            label: `Warehouse: ${w.name}`,
            kind: "warehouse" as const,
            id: Number(w.id),
        }));
        const ds = entities.distributors.map((d) => ({
            key: `d:${d.id}`,
            label: `Distributor: ${d.name}`,
            kind: "distributor" as const,
            id: Number(d.id),
        }));
        return [...wh, ...ds];
    }, [entities]);

    return (
        <div className="space-y-5">
            {/* Page header */}
            <div>
                <h1 className="text-lg font-semibold">
                    {mode === "site"
                        ? "Site Selection"
                        : mode === "expansion"
                            ? "Expansion Analysis"
                            : "Market Analysis"}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {mode === "site"
                        ? "Evaluasi lokasi: Heatmap + Site Profiling"
                        : mode === "expansion"
                            ? "Analisis ekspansi: Whitespace + Catchment Simulation"
                            : "Demand insight berbasis Heatmap"}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {mode === "site"
                                    ? "Site Selection Map"
                                    : mode === "expansion"
                                        ? "Expansion Analysis Map"
                                        : "Market Analysis Map"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                {mode === "expansion" ? (
                                    <Button
                                        variant={whitespaceOn ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                            setWhitespaceOn((v) => {
                                                const next = !v;
                                                if (!next) setWhitespace([]);
                                                return next;
                                            });
                                        }}
                                    >
                                        {whitespaceOn ? "✅ Whitespace" : "Whitespace"}
                                    </Button>
                                ) : null}

                                {mode === "site" ? (
                                    <Badge variant="secondary">Klik peta untuk profiling</Badge>
                                ) : null}

                                {mode === "market" ? (
                                    <Badge variant="secondary">Heatmap demand</Badge>
                                ) : null}

                                <div className="flex-1" />
                                <div className="text-xs text-muted-foreground">Bounding Box</div>
                                <Input
                                    className="h-8 w-[220px] font-mono text-xs"
                                    value={bbox}
                                    onChange={(e) => setBbox(e.target.value)}
                                />
                            </div>
                            <div className="h-[520px] overflow-hidden rounded-md border border-border">
                                <PlanningMap
                                    cells={cells}
                                    whitespace={mode === "expansion" && whitespaceOn ? whitespace : []}
                                    onBBoxChange={setBbox}
                                    onMapClick={mode === "site" ? loadProfile : () => { }}
                                    catchment={mode === "expansion" ? catchment : null}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    {mode === "site" ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Site Profiling</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="text-sm text-muted-foreground">
                                    Klik peta untuk mengevaluasi lokasi kandidat.
                                </div>
                                {clicked && (
                                    <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs font-mono text-muted-foreground">
                                        📍 {clicked.lat.toFixed(5)}, {clicked.lng.toFixed(5)}
                                    </div>
                                )}
                                {profile ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
                                                style={{
                                                    background:
                                                        profile.score >= 70
                                                            ? "#dcfce7"
                                                            : profile.score >= 40
                                                                ? "#fef9c3"
                                                                : "#fee2e2",
                                                    color:
                                                        profile.score >= 70
                                                            ? "#16a34a"
                                                            : profile.score >= 40
                                                                ? "#b45309"
                                                                : "#dc2626",
                                                }}
                                            >
                                                {Math.round(profile.score)}
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">Skor Lokasi</div>
                                                <Badge
                                                    variant={
                                                        profile.score >= 70
                                                            ? "success"
                                                            : profile.score >= 40
                                                                ? "warning"
                                                                : "danger"
                                                    }
                                                >
                                                    {profile.score >= 70
                                                        ? "Bagus"
                                                        : profile.score >= 40
                                                            ? "Sedang"
                                                            : "Kurang"}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 text-xs">
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="rounded-md bg-muted/60 px-2 py-1.5">
                                                    <span className="text-muted-foreground">Lebar Jalan</span>
                                                    <div className="font-semibold">{profile.roadWidthM} m</div>
                                                </div>
                                                <div className="rounded-md bg-muted/60 px-2 py-1.5">
                                                    <span className="text-muted-foreground">Demand 3km</span>
                                                    <div className="font-semibold">
                                                        {Number(profile.demandWithin3km).toFixed(1)}
                                                    </div>
                                                </div>
                                                <div className="col-span-2 rounded-md bg-muted/60 px-2 py-1.5">
                                                    <span className="text-muted-foreground">Jarak ke Gudang</span>
                                                    <div className="font-semibold">
                                                        {Number(profile.distanceToWarehouseKm).toFixed(1)} km
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="font-medium text-muted-foreground">Alasan:</div>
                                            <ul className="list-disc space-y-0.5 pl-4">
                                                {profile.reasons.map((r, i) => (
                                                    <li key={i}>{r}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <div className="py-4 text-center text-sm text-muted-foreground">
                                        Belum ada data dipilih.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : null}

                    {mode === "expansion" ? (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Whitespace</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    Aktifkan Whitespace untuk melihat area dengan peluang ekspansi.
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Catchment Simulation</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <select
                                        className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm focus-visible:outline-none"
                                        value={catchmentEntity ? `${catchmentEntity.kind}:${catchmentEntity.id}` : ""}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) {
                                                setCatchmentEntity(undefined);
                                                setCatchment(null);
                                                return;
                                            }
                                            const [kind, id] = v.split(":");
                                            const k =
                                                kind === "warehouse" || kind === "distributor"
                                                    ? (kind as CatchmentKind)
                                                    : null;
                                            if (!k) {
                                                setCatchmentEntity(undefined);
                                                setCatchment(null);
                                                return;
                                            }
                                            setCatchmentEntity({
                                                kind: k,
                                                id: Number(id),
                                            });
                                        }}
                                    >
                                        <option value="">Select warehouse/distributor...</option>
                                        {catchmentOptions.map((o) => (
                                            <option key={o.key} value={`${o.kind}:${o.id}`}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                    {catchment ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">{catchment.entity.kind}</Badge>
                                                <span className="text-sm font-medium">{catchment.entity.name}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Radius: {catchment.entity.radiusKm} km
                                            </div>
                                            <div className="text-xs font-medium">
                                                Konflik ({catchment.conflicts.length})
                                            </div>
                                            <div className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/30">
                                                <pre className="p-3 text-xs">
                                                    {JSON.stringify(catchment.conflicts, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-3 text-center text-sm text-muted-foreground">
                                            Pilih entitas di atas.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : null}

                    {mode === "market" ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Market Insight</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm text-muted-foreground">
                                <div>
                                    Heatmap menunjukkan intensitas demand relatif dalam area bounding box.
                                </div>
                                <div className="text-xs">
                                    Tips: geser/zoom peta untuk mengubah bounding box otomatis.
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
