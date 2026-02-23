"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select, type SelectOption } from "@/components/ui/select";

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

type CreateIssueResponse = { id: number };

type IssueReport = {
    id: number;
    severity: string;
    status: string;
    title: string;
    description: string;
    shipmentId: number | null;
    reportedAt: string;
    resolvedAt?: string | null;
    resolutionNotes?: string | null;
    metadata?: { evidenceUrls?: string[]; damageType?: string };
};

type IssueFormState = {
    shipmentId: string;
    severity: string;
    title: string;
    description: string;
    damageType: string;
    damagedBags: string;
    damagedTons: string;
};

const DEFAULT_FORM: IssueFormState = {
    shipmentId: "",
    severity: "MED",
    title: "",
    description: "",
    damageType: "BAG_TORN",
    damagedBags: "",
    damagedTons: "",
};

export function DistributorProductReportClient() {
    const [shipments, setShipments] = useState<DistributorShipmentItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reports, setReports] = useState<IssueReport[]>([]);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    const [form, setForm] = useState<IssueFormState>(DEFAULT_FORM);
    const [busy, setBusy] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreateIssueResponse | null>(null);
    const [files, setFiles] = useState<File[]>([]);

    const refreshShipments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch("/api/distributor/shipments");
            const d = await r.json();
            setShipments((d.items ?? []) as DistributorShipmentItem[]);
        } catch {
            setShipments([]);
            setError("Gagal memuat data shipment.");
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshReports = useCallback(async () => {
        setReportLoading(true);
        setReportError(null);
        try {
            const r = await fetch("/api/distributor/issues?status=ALL");
            const d = await r.json();
            setReports((d.items ?? []) as IssueReport[]);
        } catch {
            setReports([]);
            setReportError("Gagal memuat laporan.");
        } finally {
            setReportLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshShipments();
        refreshReports();
    }, [refreshReports, refreshShipments]);

    const shipmentOptions: SelectOption[] = useMemo(() => {
        const options: SelectOption[] = [
            { value: "", label: "Tanpa referensi shipment" },
        ];
        shipments.forEach((s) => {
            options.push({
                value: String(s.id),
                label: `#${s.id} - ${s.cementType} - ${Number(s.quantityTons).toLocaleString("id-ID")} ton`,
            });
        });
        return options;
    }, [shipments]);

    const severityOptions: SelectOption[] = useMemo(
        () => [
            { value: "LOW", label: "LOW" },
            { value: "MED", label: "MED" },
            { value: "HIGH", label: "HIGH" },
        ],
        [],
    );

    const damageTypeOptions: SelectOption[] = useMemo(
        () => [
            { value: "BAG_TORN", label: "Karung sobek" },
            { value: "WET", label: "Basah/terkena air" },
            { value: "BROKEN", label: "Karung rusak/pecah" },
            { value: "MISSING", label: "Barang kurang" },
            { value: "OTHER", label: "Lainnya" },
        ],
        [],
    );

    const updateForm = (key: keyof IssueFormState, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const uploadEvidence = useCallback(async (selected: File[]) => {
        const urls: string[] = [];
        for (const file of selected) {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/distributor/issues/upload", {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                throw new Error(body?.error?.message ?? "Upload gagal");
            }
            const d = (await res.json()) as { url?: string };
            if (d.url) urls.push(d.url);
        }
        return urls;
    }, []);

    const submitIssue = useCallback(async () => {
        setBusy(true);
        setSubmitError(null);
        setCreated(null);

        const shipmentId = form.shipmentId ? Number(form.shipmentId) : null;
        const damagedBagsNum = form.damagedBags ? Number(form.damagedBags) : null;
        const damagedTonsNum = form.damagedTons ? Number(form.damagedTons) : null;

        if (form.title.trim() === "") {
            setSubmitError("Judul laporan wajib diisi.");
            setBusy(false);
            return;
        }
        if (form.description.trim() === "") {
            setSubmitError("Deskripsi kerusakan wajib diisi.");
            setBusy(false);
            return;
        }
        if (shipmentId !== null && (!Number.isFinite(shipmentId) || shipmentId <= 0)) {
            setSubmitError("Shipment ID tidak valid.");
            setBusy(false);
            return;
        }
        if (damagedBagsNum !== null && (!Number.isFinite(damagedBagsNum) || damagedBagsNum < 0)) {
            setSubmitError("Jumlah karung rusak tidak valid.");
            setBusy(false);
            return;
        }
        if (damagedTonsNum !== null && (!Number.isFinite(damagedTonsNum) || damagedTonsNum < 0)) {
            setSubmitError("Estimasi ton rusak tidak valid.");
            setBusy(false);
            return;
        }

        try {
            let evidenceUrls: string[] = [];
            if (files.length > 0) {
                evidenceUrls = await uploadEvidence(files);
            }
            const res = await fetch("/api/distributor/issues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    issueType: "DAMAGED",
                    severity: form.severity,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    shipmentId,
                    metadata: {
                        damageType: form.damageType,
                        damagedBags: damagedBagsNum,
                        damagedTons: damagedTonsNum,
                        evidenceUrls,
                    },
                }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setSubmitError(body?.error?.message ?? "Gagal mengirim laporan.");
                return;
            }
            const d = (await res.json()) as CreateIssueResponse;
            setCreated(d);
            setForm(DEFAULT_FORM);
            setFiles([]);
            refreshReports();
        } finally {
            setBusy(false);
        }
    }, [files, form, refreshReports, uploadEvidence]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Product Report"
                description="Laporkan kerusakan atau kekurangan barang yang diterima di distributor."
                actions={
                    <Button size="sm" variant="outline" onClick={refreshShipments} disabled={loading}>
                        Refresh shipments
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>Form Laporan Kerusakan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Shipment (opsional)</div>
                            <Select options={shipmentOptions} value={form.shipmentId} onValueChange={(value) => updateForm("shipmentId", value)} />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Severity</div>
                            <Select options={severityOptions} value={form.severity} onValueChange={(value) => updateForm("severity", value)} />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Jenis kerusakan</div>
                            <Select options={damageTypeOptions} value={form.damageType} onValueChange={(value) => updateForm("damageType", value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Jumlah karung rusak</div>
                            <Input
                                type="number"
                                placeholder="Contoh: 12"
                                value={form.damagedBags}
                                onChange={(e) => updateForm("damagedBags", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Estimasi ton rusak</div>
                            <Input
                                type="number"
                                placeholder="Contoh: 0.8"
                                value={form.damagedTons}
                                onChange={(e) => updateForm("damagedTons", e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Judul laporan</div>
                            <Input
                                placeholder="Contoh: Karung sobek saat tiba"
                                value={form.title}
                                onChange={(e) => updateForm("title", e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Deskripsi kejadian</div>
                        <textarea
                            className="min-h-[110px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                            placeholder="Ceritakan kondisi barang, jumlah, dan detail lain yang diperlukan operator."
                            value={form.description}
                            onChange={(e) => updateForm("description", e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Bukti foto (jpg/png/webp)</div>
                        <Input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                        />
                        {files.length > 0 ? (
                            <div className="text-xs text-muted-foreground">{files.length} file dipilih</div>
                        ) : null}
                    </div>

                    <Button onClick={submitIssue} disabled={busy}>
                        Kirim laporan kerusakan
                    </Button>

                    {error ? <div className="text-xs text-red-600">{error}</div> : null}
                    {submitError ? <div className="text-xs text-red-600">{submitError}</div> : null}

                    {created ? (
                        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                            <div className="font-medium">Laporan terkirim</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                ID laporan: <Badge variant="secondary">#{created.id}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                                Tim operator akan menindaklanjuti laporan ini.
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Riwayat Laporan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/40">
                                <tr>
                                    <th className="px-3 py-2 text-left">ID</th>
                                    <th className="px-3 py-2 text-left">Shipment</th>
                                    <th className="px-3 py-2 text-left">Severity</th>
                                    <th className="px-3 py-2 text-left">Status</th>
                                    <th className="px-3 py-2 text-left">Notes</th>
                                    <th className="px-3 py-2 text-left">Bukti</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((r) => (
                                    <tr key={r.id} className="border-b border-border">
                                        <td className="px-3 py-2 font-medium">#{r.id}</td>
                                        <td className="px-3 py-2 text-xs">{r.shipmentId ? `#${r.shipmentId}` : "—"}</td>
                                        <td className="px-3 py-2">{r.severity}</td>
                                        <td className="px-3 py-2">{r.status}</td>
                                        <td className="px-3 py-2 text-xs">{r.resolutionNotes || "—"}</td>
                                        <td className="px-3 py-2 text-xs">
                                            {(r.metadata?.evidenceUrls ?? []).length > 0 ? (
                                                (r.metadata?.evidenceUrls ?? []).map((url, index) => (
                                                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="underline mr-2">
                                                        Lihat
                                                    </a>
                                                ))
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {reports.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                                            {reportLoading ? "Memuat..." : "Belum ada laporan."}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    {reportError ? <div className="text-xs text-red-600">{reportError}</div> : null}
                </CardContent>
            </Card>
        </div>
    );
}
