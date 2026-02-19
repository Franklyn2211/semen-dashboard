"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogCard, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AuditLog } from "@/lib/types/admin";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "CONFIG_CHANGE"];
const ENTITIES = ["User", "Role", "Threshold", "Alert", "MasterData"];
const ACTORS = ["Nadia Putri", "Raka Pratama", "Dewi Ananda", "System Bot"];

function buildLogs(): AuditLog[] {
    const now = Date.now();
    return Array.from({ length: 50 }, (_, idx) => {
        const ts = new Date(now - idx * 1000 * 60 * 45).toISOString();
        const actorName = ACTORS[idx % ACTORS.length];
        return {
            id: `log-${idx + 1}`,
            ts,
            actorId: `usr-${(idx % 4) + 1}`,
            actorName,
            action: ACTIONS[idx % ACTIONS.length],
            entityType: ENTITIES[idx % ENTITIES.length],
            entityId: `${ENTITIES[idx % ENTITIES.length].toLowerCase()}-${idx + 10}`,
            metadata: {
                ip: `10.20.1.${(idx % 35) + 10}`,
                requestId: `req-${1000 + idx}`,
                changes: idx % 2 === 0 ? ["status", "threshold"] : ["role"],
            },
            ip: `10.20.1.${(idx % 35) + 10}`,
        };
    });
}

export function LogsView() {
    const logs = useMemo(() => buildLogs(), []);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [actorFilter, setActorFilter] = useState("all");
    const [actionFilter, setActionFilter] = useState("all");
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

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
            />

            <FiltersBar label="Filters">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                    <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                    <Select
                        options={[{ value: "all", label: "All actors" }, ...ACTORS.map((actor) => ({ value: actor, label: actor }))]}
                        value={actorFilter}
                        onValueChange={setActorFilter}
                    />
                    <Select
                        options={[{ value: "all", label: "All actions" }, ...ACTIONS.map((action) => ({ value: action, label: action }))]}
                        value={actionFilter}
                        onValueChange={setActionFilter}
                    />
                </div>
            </FiltersBar>

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
