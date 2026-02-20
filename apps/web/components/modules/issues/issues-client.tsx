"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogBody,
    DialogCard,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type LogisticsMap = {
    warehouses: { id: number; name: string }[];
    distributors: { id: number; name: string }[];
};

type StatusFilter = "OPEN" | "RESOLVED" | "ALL";

type IssueItem = {
    id: number;
    issueType: "DELAY" | "STOCK_SHORTAGE" | "FLEET" | "OTHER";
    severity: "LOW" | "MED" | "HIGH";
    status: "OPEN" | "RESOLVED";
    title: string;
    description: string;
    shipmentId: number | null;
    warehouse: { id: number | null; name: string | null };
    distributor: { id: number | null; name: string | null };
    reportedBy: { id: number | null; name: string | null };
    reportedAt: string;
    resolvedBy: { id: number | null; name: string | null };
    resolvedAt: string | null;
    resolutionNotes: string;
    createdAt: string;
    updatedAt: string;
};

function apiErrorMessage(payload: unknown): string {
    if (!payload || typeof payload !== "object") return "Request failed";
    const p = payload as Record<string, unknown>;

    const err = p.error;
    if (err && typeof err === "object") {
        const msg = (err as Record<string, unknown>).message;
        if (typeof msg === "string" && msg.trim()) return msg;
    }

    const msg2 = p.message;
    if (typeof msg2 === "string" && msg2.trim()) return msg2;
    return "Request failed";
}

function getArrayField(obj: unknown, key: string): unknown[] {
    if (!obj || typeof obj !== "object") return [];
    const v = (obj as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : [];
}

function asIdName(v: unknown): { id: number; name: string } | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const idRaw = o.id;
    const nameRaw = o.name;
    const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
    const name = typeof nameRaw === "string" ? nameRaw : "";
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, name };
}

function isStatusFilter(v: string): v is StatusFilter {
    return v === "OPEN" || v === "RESOLVED" || v === "ALL";
}

export function IssuesClient() {
    const [logistics, setLogistics] = useState<LogisticsMap | null>(null);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
    const [items, setItems] = useState<IssueItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [createType, setCreateType] = useState<IssueItem["issueType"]>("DELAY");
    const [createSeverity, setCreateSeverity] = useState<IssueItem["severity"]>("MED");
    const [createTitle, setCreateTitle] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createShipmentId, setCreateShipmentId] = useState("");
    const [createWarehouseId, setCreateWarehouseId] = useState<string>("");
    const [createDistributorId, setCreateDistributorId] = useState<string>("");
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [resolveOpen, setResolveOpen] = useState(false);
    const [resolving, setResolving] = useState<IssueItem | null>(null);
    const [resolveNotes, setResolveNotes] = useState("");
    const [resolveBusy, setResolveBusy] = useState(false);
    const [resolveError, setResolveError] = useState<string | null>(null);

    const loadLogistics = useCallback(async () => {
        try {
            const r = await fetch("/api/ops/logistics/map");
            const d = await r.json();
            setLogistics({
                warehouses: getArrayField(d, "warehouses")
                    .map(asIdName)
                    .filter((x): x is { id: number; name: string } => !!x),
                distributors: getArrayField(d, "distributors")
                    .map(asIdName)
                    .filter((x): x is { id: number; name: string } => !!x),
            });
        } catch {
            setLogistics(null);
        }
    }, []);

    const loadIssues = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(`/api/ops/issues?status=${statusFilter}`);
            const d = await r.json();
            if (!r.ok) {
                setItems([]);
                setError(apiErrorMessage(d));
                return;
            }
            setItems((d.items ?? []) as IssueItem[]);
        } catch {
            setItems([]);
            setError("Failed to load issues");
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadLogistics();
    }, [loadLogistics]);

    useEffect(() => {
        loadIssues();
    }, [loadIssues]);

    const warehouseOptions = useMemo(() => {
        const base = [{ value: "", label: "(Optional) Select warehouse" }];
        const wh = (logistics?.warehouses ?? []).map((w) => ({ value: String(w.id), label: w.name }));
        return [...base, ...wh];
    }, [logistics]);

    const distributorOptions = useMemo(() => {
        const base = [{ value: "", label: "(Optional) Select distributor" }];
        const di = (logistics?.distributors ?? []).map((d) => ({ value: String(d.id), label: d.name }));
        return [...base, ...di];
    }, [logistics]);

    async function onCreate() {
        setCreateError(null);
        const title = createTitle.trim();
        if (!title) {
            setCreateError("Title is required");
            return;
        }

        let shipmentId: number | undefined;
        if (createShipmentId.trim()) {
            const parsed = Number(createShipmentId);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                setCreateError("Shipment ID must be a positive number");
                return;
            }
            shipmentId = parsed;
        }

        let warehouseId: number | undefined;
        if (createWarehouseId) warehouseId = Number(createWarehouseId);

        let distributorId: number | undefined;
        if (createDistributorId) distributorId = Number(createDistributorId);

        setCreateBusy(true);
        try {
            const r = await fetch("/api/ops/issues", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    issueType: createType,
                    severity: createSeverity,
                    title,
                    description: createDescription.trim(),
                    shipmentId,
                    warehouseId,
                    distributorId,
                }),
            });
            const d = await r.json();
            if (!r.ok) {
                setCreateError(apiErrorMessage(d));
                return;
            }

            setCreateTitle("");
            setCreateDescription("");
            setCreateShipmentId("");
            setCreateWarehouseId("");
            setCreateDistributorId("");
            await loadIssues();
        } catch {
            setCreateError("Failed to create issue");
        } finally {
            setCreateBusy(false);
        }
    }

    function statusBadge(status: IssueItem["status"]) {
        if (status === "OPEN") return <Badge variant="warning">OPEN</Badge>;
        return <Badge variant="success">RESOLVED</Badge>;
    }

    function severityBadge(sev: IssueItem["severity"]) {
        if (sev === "HIGH") return <Badge variant="danger">HIGH</Badge>;
        if (sev === "MED") return <Badge variant="warning">MED</Badge>;
        return <Badge variant="secondary">LOW</Badge>;
    }

    function openResolve(issue: IssueItem) {
        setResolving(issue);
        setResolveNotes("");
        setResolveError(null);
        setResolveOpen(true);
    }

    async function submitResolve() {
        if (!resolving) return;
        const notes = resolveNotes.trim();
        if (!notes) {
            setResolveError("Resolution notes are required");
            return;
        }

        setResolveBusy(true);
        setResolveError(null);
        try {
            const r = await fetch(`/api/ops/issues/${resolving.id}/resolve`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ resolutionNotes: notes }),
            });
            const d = await r.json();
            if (!r.ok) {
                setResolveError(apiErrorMessage(d));
                return;
            }
            setResolveOpen(false);
            setResolving(null);
            await loadIssues();
        } catch {
            setResolveError("Failed to resolve issue");
        } finally {
            setResolveBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Issues"
                description="Report and resolve operational issues (delay, stock shortage, fleet)."
                actions={<Button variant="outline" onClick={loadIssues} disabled={loading}>Refresh</Button>}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Report Issue</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Type</div>
                            <Select
                                value={createType}
                                onValueChange={(v) => setCreateType(v as IssueItem["issueType"])}
                                options={[
                                    { value: "DELAY", label: "Delay" },
                                    { value: "STOCK_SHORTAGE", label: "Stock Shortage" },
                                    { value: "FLEET", label: "Fleet Issue" },
                                    { value: "OTHER", label: "Other" },
                                ]}
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Severity</div>
                            <Select
                                value={createSeverity}
                                onValueChange={(v) => setCreateSeverity(v as IssueItem["severity"])}
                                options={[
                                    { value: "LOW", label: "LOW" },
                                    { value: "MED", label: "MED" },
                                    { value: "HIGH", label: "HIGH" },
                                ]}
                            />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground">Title</div>
                            <Input
                                value={createTitle}
                                onChange={(e) => setCreateTitle(e.target.value)}
                                placeholder="Short summary"
                            />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground">Description (optional)</div>
                            <Input
                                value={createDescription}
                                onChange={(e) => setCreateDescription(e.target.value)}
                                placeholder="More details"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Related Shipment ID (optional)</div>
                            <Input
                                value={createShipmentId}
                                onChange={(e) => setCreateShipmentId(e.target.value)}
                                placeholder="e.g. 123"
                                inputMode="numeric"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Warehouse (optional)</div>
                            <Select
                                value={createWarehouseId}
                                onValueChange={(v) => setCreateWarehouseId(v)}
                                options={warehouseOptions}
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Distributor (optional)</div>
                            <Select
                                value={createDistributorId}
                                onValueChange={(v) => setCreateDistributorId(v)}
                                options={distributorOptions}
                            />
                        </div>

                        <div className="flex items-center justify-end md:col-span-2">
                            <Button onClick={onCreate} disabled={createBusy}>
                                {createBusy ? "Creating…" : "Create Issue"}
                            </Button>
                        </div>
                    </div>

                    {createError ? (
                        <div className="mt-3 text-sm text-red-600">{createError}</div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>Issue List</CardTitle>
                    <div className="w-52">
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => {
                                if (isStatusFilter(v)) setStatusFilter(v);
                            }}
                            options={[
                                { value: "OPEN", label: "OPEN" },
                                { value: "RESOLVED", label: "RESOLVED" },
                                { value: "ALL", label: "ALL" },
                            ]}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Status</TH>
                                <TH>Type</TH>
                                <TH>Severity</TH>
                                <TH>Title</TH>
                                <TH>Warehouse</TH>
                                <TH>Distributor</TH>
                                <TH>Shipment</TH>
                                <TH>Reported</TH>
                                <TH className="text-right">Actions</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {items.map((issue) => (
                                <TR key={issue.id}>
                                    <TD className="text-sm text-muted-foreground">{issue.id}</TD>
                                    <TD>{statusBadge(issue.status)}</TD>
                                    <TD className="text-sm">{issue.issueType}</TD>
                                    <TD>{severityBadge(issue.severity)}</TD>
                                    <TD className="text-sm">
                                        <div className="font-medium">{issue.title}</div>
                                        {issue.description ? (
                                            <div className="text-xs text-muted-foreground">{issue.description}</div>
                                        ) : null}
                                    </TD>
                                    <TD className="text-sm">{issue.warehouse?.name ?? "-"}</TD>
                                    <TD className="text-sm">{issue.distributor?.name ?? "-"}</TD>
                                    <TD className="text-sm text-muted-foreground">{issue.shipmentId ?? "-"}</TD>
                                    <TD className="text-xs text-muted-foreground">
                                        {new Date(issue.reportedAt).toLocaleString()}
                                    </TD>
                                    <TD className="text-right">
                                        {issue.status === "OPEN" ? (
                                            <Button size="xs" onClick={() => openResolve(issue)}>
                                                Resolve
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>

                    {loading ? (
                        <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
                    ) : null}
                    {!loading && items.length === 0 ? (
                        <div className="mt-3 text-sm text-muted-foreground">No issues found.</div>
                    ) : null}
                </CardContent>
            </Card>

            <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>Resolve Issue</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="space-y-2 text-sm">
                            <div>
                                <span className="text-muted-foreground">Issue:</span> #{resolving?.id} {resolving?.title}
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">Resolution Notes</div>
                                <Input
                                    value={resolveNotes}
                                    onChange={(e) => setResolveNotes(e.target.value)}
                                    placeholder="What was done to resolve it?"
                                />
                            </div>
                            {resolveError ? <div className="text-sm text-red-600">{resolveError}</div> : null}
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResolveOpen(false)} disabled={resolveBusy}>
                            Cancel
                        </Button>
                        <Button onClick={submitResolve} disabled={resolveBusy}>
                            {resolveBusy ? "Resolving…" : "Resolve"}
                        </Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </div>
    );
}
