"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type IssueItem = {
    id: number;
    issueType: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    shipmentId: number | null;
    distributor?: { id?: number | null; name?: string | null };
    reportedAt: string;
    resolvedAt?: string | null;
    resolutionNotes?: string | null;
    metadata?: { evidenceUrls?: string[] };
};

export function OpsIssuesClient({ role }: { role: string }) {
    const params = useSearchParams();
    const [items, setItems] = useState<IssueItem[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState("OPEN");
    const [severityFilter, setSeverityFilter] = useState("ALL");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState("");

    const canResolve = role === "OPERATOR" || role === "SUPER_ADMIN";

    useEffect(() => {
        const issueId = params.get("issueId");
        if (!issueId) return;
        const id = Number(issueId);
        if (Number.isFinite(id)) {
            setSelectedId(id);
        }
    }, [params]);

    useEffect(() => {
        setBusy(true);
        setError(null);
        const qs = new URLSearchParams({
            type: "DAMAGED",
            status: statusFilter || "ALL",
            severity: severityFilter || "ALL",
        });
        fetch(`/api/ops/issues?${qs.toString()}`)
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as IssueItem[]))
            .catch(() => {
                setItems([]);
                setError("Gagal memuat laporan kerusakan.");
            })
            .finally(() => setBusy(false));
    }, [severityFilter, statusFilter]);

    const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

    const severityOptions: SelectOption[] = useMemo(
        () => [
            { value: "ALL", label: "All severity" },
            { value: "HIGH", label: "HIGH" },
            { value: "MED", label: "MED" },
            { value: "LOW", label: "LOW" },
        ],
        [],
    );

    const statusOptions: SelectOption[] = useMemo(
        () => [
            { value: "OPEN", label: "OPEN" },
            { value: "RESOLVED", label: "RESOLVED" },
            { value: "ALL", label: "All status" },
        ],
        [],
    );

    const severityBadge = (s: string) => {
        if (s === "HIGH") return <Badge variant="danger">HIGH</Badge>;
        if (s === "MED") return <Badge variant="warning">MED</Badge>;
        if (s === "LOW") return <Badge variant="secondary">LOW</Badge>;
        return <Badge variant="secondary">{s || "—"}</Badge>;
    };

    const statusBadge = (s: string) => {
        if (s === "OPEN") return <Badge variant="warning">OPEN</Badge>;
        if (s === "RESOLVED") return <Badge variant="success">RESOLVED</Badge>;
        return <Badge variant="secondary">{s || "—"}</Badge>;
    };

    async function resolveIssue() {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/ops/issues/${selectedId}/resolve`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resolutionNotes: resolutionNotes.trim() }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Gagal menyelesaikan laporan.");
                return;
            }
            setResolutionNotes("");
            const qs = new URLSearchParams({
                type: "DAMAGED",
                status: statusFilter || "ALL",
                severity: severityFilter || "ALL",
            });
            const r = await fetch(`/api/ops/issues?${qs.toString()}`);
            const d = await r.json();
            setItems((d.items ?? []) as IssueItem[]);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Damage Reports"
                description="Daftar laporan kerusakan dari distributor."
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Select options={statusOptions} value={statusFilter} onValueChange={setStatusFilter} />
                <Select options={severityOptions} value={severityFilter} onValueChange={setSeverityFilter} />
                <Input
                    placeholder="Pilih laporan di tabel"
                    value={selectedId ? `#${selectedId}` : ""}
                    readOnly
                />
                <Button variant="outline" onClick={() => setSelectedId(null)} disabled={!selectedId}>
                    Clear selection
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Open Reports</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-hidden rounded-lg border border-border">
                            <Table>
                                <THead>
                                    <TR>
                                        <TH>ID</TH>
                                        <TH>Distributor</TH>
                                        <TH>Shipment</TH>
                                        <TH>Severity</TH>
                                        <TH>Status</TH>
                                        <TH>Action</TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {items.map((issue) => (
                                        <TR key={issue.id}>
                                            <TD className="font-medium">#{issue.id}</TD>
                                            <TD className="text-xs">{issue.distributor?.name ?? "—"}</TD>
                                            <TD className="text-xs">{issue.shipmentId ? `#${issue.shipmentId}` : "—"}</TD>
                                            <TD>{severityBadge(issue.severity)}</TD>
                                            <TD>{statusBadge(issue.status)}</TD>
                                            <TD>
                                                <Button
                                                    size="xs"
                                                    variant={selectedId === issue.id ? "default" : "outline"}
                                                    onClick={() => setSelectedId(issue.id)}
                                                >
                                                    Open
                                                </Button>
                                            </TD>
                                        </TR>
                                    ))}
                                    {items.length === 0 ? (
                                        <TR>
                                            <TD colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                                                {busy ? "Memuat..." : "Tidak ada laporan."}
                                            </TD>
                                        </TR>
                                    ) : null}
                                </TBody>
                            </Table>
                        </div>
                        {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Detail Report</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {selected ? (
                            <>
                                <div className="space-y-1">
                                    <div className="font-medium">{selected.title}</div>
                                    <div className="text-xs text-muted-foreground">{selected.description}</div>
                                </div>
                                <div className="text-xs text-muted-foreground">Distributor: {selected.distributor?.name ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">Shipment: {selected.shipmentId ? `#${selected.shipmentId}` : "—"}</div>
                                <div className="text-xs text-muted-foreground">Reported: {selected.reportedAt ? new Date(selected.reportedAt).toLocaleString("id-ID") : "—"}</div>
                                <div className="flex items-center gap-2">
                                    {severityBadge(selected.severity)}
                                    {statusBadge(selected.status)}
                                </div>

                                {(selected.metadata?.evidenceUrls ?? []).length > 0 ? (
                                    <div className="space-y-1">
                                        <div className="text-xs text-muted-foreground">Bukti foto:</div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {(selected.metadata?.evidenceUrls ?? []).map((url, index) => (
                                                <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="underline">
                                                    Lihat bukti
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {selected.status === "RESOLVED" ? (
                                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                        <div>Resolved: {selected.resolvedAt ? new Date(selected.resolvedAt).toLocaleString("id-ID") : "—"}</div>
                                        <div>Notes: {selected.resolutionNotes || "—"}</div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <textarea
                                            className="min-h-[90px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                                            placeholder="Catatan penyelesaian (opsional)"
                                            value={resolutionNotes}
                                            onChange={(e) => setResolutionNotes(e.target.value)}
                                        />
                                        <Button onClick={resolveIssue} disabled={!canResolve || busy}>
                                            Mark as resolved
                                        </Button>
                                        {!canResolve ? (
                                            <div className="text-xs text-muted-foreground">Hanya operator dapat menyelesaikan laporan.</div>
                                        ) : null}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-xs text-muted-foreground">Pilih laporan dari tabel untuk melihat detail.</div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
