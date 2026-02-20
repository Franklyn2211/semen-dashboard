"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogCard, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AuditLog } from "@/lib/types/admin";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAuditLog(raw: unknown): AuditLog | null {
    if (!isRecord(raw)) return null;
    const id = typeof raw.id === "string" ? raw.id : null;
    const ts = typeof raw.ts === "string" ? raw.ts : null;
    const actorId = typeof raw.actorId === "string" ? raw.actorId : "";
    const actorName = typeof raw.actorName === "string" ? raw.actorName : "";
    const action = typeof raw.action === "string" ? raw.action : "";
    const entityType = typeof raw.entityType === "string" ? raw.entityType : "";
    const entityId = typeof raw.entityId === "string" ? raw.entityId : "";
    const ip = typeof raw.ip === "string" ? raw.ip : "";
    if (!id || !ts) return null;

    const metadataRaw = raw.metadata;
    const metadata: Record<string, unknown> = isRecord(metadataRaw)
        ? metadataRaw
        : metadataRaw === undefined
            ? {}
            : { raw: metadataRaw };

    return {
        id,
        ts,
        actorId,
        actorName,
        action,
        entityType,
        entityId,
        metadata,
        ip,
    };
}

function csvEscape(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

function downloadLogsCSV(logs: AuditLog[]) {
    const header = ["ts", "actorName", "action", "entityType", "entityId", "ip", "metadata"];
    const lines = [header.join(",")];
    for (const log of logs) {
        lines.push(
            [
                csvEscape(log.ts),
                csvEscape(log.actorName ?? ""),
                csvEscape(log.action ?? ""),
                csvEscape(log.entityType ?? ""),
                csvEscape(log.entityId ?? ""),
                csvEscape(log.ip ?? ""),
                csvEscape(JSON.stringify(log.metadata ?? {})),
            ].join(","),
        );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function LogsView() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [busy, setBusy] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [actorFilter, setActorFilter] = useState("all");
    const [actionFilter, setActionFilter] = useState("all");
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setBusy(true);
            setLoadError(null);
            try {
                const res = await fetch("/api/admin/logs");
                if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
                    throw new Error(body?.error?.message ?? `Failed to load logs (${res.status})`);
                }
                const data = (await res.json().catch(() => null)) as unknown;
                const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
                const parsed: AuditLog[] = [];
                for (const it of items) {
                    const log = toAuditLog(it);
                    if (log) parsed.push(log);
                }
                if (!cancelled) setLogs(parsed);
            } catch (e) {
                if (!cancelled) {
                    setLogs([]);
                    setLoadError(e instanceof Error ? e.message : "Failed to load logs");
                }
            } finally {
                if (!cancelled) setBusy(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const actorOptions = useMemo(() => {
        const set = new Set<string>();
        for (const log of logs) {
            if (log.actorName) set.add(log.actorName);
        }
        return [{ value: "all", label: "All actors" }, ...Array.from(set).sort().map((a) => ({ value: a, label: a }))];
    }, [logs]);

    const actionOptions = useMemo(() => {
        const set = new Set<string>();
        for (const log of logs) {
            if (log.action) set.add(log.action);
        }
        return [{ value: "all", label: "All actions" }, ...Array.from(set).sort().map((a) => ({ value: a, label: a }))];
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            const logDate = new Date(log.ts);
            const matchesActor = actorFilter === "all" || log.actorName === actorFilter;
            const matchesAction = actionFilter === "all" || log.action === actionFilter;
            const afterStart = startDate ? logDate >= new Date(startDate) : true;
            const beforeEnd = endDate ? logDate <= new Date(`${endDate}T23:59:59`) : true;
            return matchesActor && matchesAction && afterStart && beforeEnd;
        });
    }, [logs, startDate, endDate, actorFilter, actionFilter]);

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="System Logs"
                description="Audit trail of configuration and access changes."
                actions={
                    <Button size="sm" variant="outline" disabled={filteredLogs.length === 0} onClick={() => downloadLogsCSV(filteredLogs)}>
                        Download CSV
                    </Button>
                }
            />

            <FiltersBar label="Filters">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                    <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                    <Select
                        options={actorOptions}
                        value={actorFilter}
                        onValueChange={setActorFilter}
                    />
                    <Select
                        options={actionOptions}
                        value={actionFilter}
                        onValueChange={setActionFilter}
                    />
                </div>
            </FiltersBar>

            {loadError ? <div className="text-sm text-red-600">{loadError}</div> : null}

            <DataTable
                columns={[
                    { key: "timestamp", label: "Timestamp" },
                    { key: "actor", label: "Actor" },
                    { key: "action", label: "Action" },
                    { key: "entity", label: "Entity" },
                    { key: "entityId", label: "Entity ID" },
                    { key: "ip", label: "IP" },
                    { key: "actions", label: "Actions", className: "text-right" },
                ]}
                rowCount={filteredLogs.length}
                emptyLabel="No logs available for the selected filters."
                loading={busy}
            >
                {filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border">
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                            {new Date(log.ts).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-medium">{log.actorName}</td>
                        <td className="px-3 py-2">{log.action}</td>
                        <td className="px-3 py-2">{log.entityType}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{log.entityId}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{log.ip}</td>
                        <td className="px-3 py-2">
                            <div className="flex items-center justify-end">
                                <Button size="xs" variant="ghost" onClick={() => setSelectedLog(log)}>
                                    <Eye className="h-4 w-4" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                ))}
            </DataTable>

            <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>Log Details</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="space-y-2 text-sm">
                            <div>
                                <span className="text-muted-foreground">Actor:</span>{" "}
                                {selectedLog?.actorName}
                            </div>
                            <div>
                                <span className="text-muted-foreground">Action:</span>{" "}
                                {selectedLog?.action}
                            </div>
                            <div>
                                <span className="text-muted-foreground">Entity:</span>{" "}
                                {selectedLog?.entityType} {selectedLog?.entityId}
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <pre className="text-xs">
                                    {JSON.stringify(selectedLog?.metadata ?? {}, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedLog(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </div>
    );
}
