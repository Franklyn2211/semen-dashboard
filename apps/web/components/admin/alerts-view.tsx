"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AlertConfig, AlertSeverity, AdminRole } from "@/lib/types/admin";

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
    { value: "SUPER_ADMIN", label: "SuperAdmin" },
    { value: "MANAGEMENT", label: "Management" },
    { value: "OPERATOR", label: "Operator" },
    { value: "DISTRIBUTOR", label: "Distributor" },
];

const MOCK_USERS = [
    { id: "usr-1", name: "Nadia Putri" },
    { id: "usr-2", name: "Raka Pratama" },
    { id: "usr-3", name: "Dewi Ananda" },
];

const MOCK_ALERTS: AlertConfig[] = [
    {
        id: "alert-1",
        name: "Stock Critical",
        description: "Trigger when stock drops below critical threshold.",
        enabled: true,
        severity: "High",
        recipients: { roles: ["SUPER_ADMIN", "MANAGEMENT"], users: ["usr-1"] },
        channels: { inApp: true, email: true },
        params: { threshold: 20, unit: "%" },
    },
    {
        id: "alert-2",
        name: "Shipment Delay",
        description: "Notify if delivery is delayed beyond SLA.",
        enabled: true,
        severity: "Medium",
        recipients: { roles: ["OPERATOR"], users: ["usr-2"] },
        channels: { inApp: true, email: false },
        params: { threshold: 180, unit: "minutes" },
    },
    {
        id: "alert-3",
        name: "Demand Spike",
        description: "Detect sudden demand increases in a region.",
        enabled: false,
        severity: "Low",
        recipients: { roles: ["MANAGEMENT"], users: [] },
        channels: { inApp: true, email: true },
        params: { threshold: 25, unit: "%" },
    },
];

const SEVERITY_OPTIONS = [
    { value: "Low", label: "Low" },
    { value: "Medium", label: "Medium" },
    { value: "High", label: "High" },
];

export function AlertsView() {
    const [alerts, setAlerts] = useState<AlertConfig[]>(MOCK_ALERTS);
    const [search, setSearch] = useState("");
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 2400);
        return () => clearTimeout(id);
    }, [toast]);

    const filteredAlerts = useMemo(() => {
        return alerts.filter((alert) =>
            `${alert.name} ${alert.description}`.toLowerCase().includes(search.toLowerCase()),
        );
    }, [alerts, search]);

    const updateAlert = (id: string, updater: (alert: AlertConfig) => AlertConfig) => {
        setAlerts((prev) => prev.map((alert) => (alert.id === id ? updater(alert) : alert)));
    };

    const toggleRole = (alert: AlertConfig, role: AdminRole) => {
        const hasRole = alert.recipients.roles.includes(role);
        const nextRoles = hasRole
            ? alert.recipients.roles.filter((item) => item !== role)
            : [...alert.recipients.roles, role];
        updateAlert(alert.id, (current) => ({
            ...current,
            recipients: { ...current.recipients, roles: nextRoles },
        }));
    };

    const toggleUser = (alert: AlertConfig, userId: string) => {
        const hasUser = alert.recipients.users.includes(userId);
        const nextUsers = hasUser
            ? alert.recipients.users.filter((item) => item !== userId)
            : [...alert.recipients.users, userId];
        updateAlert(alert.id, (current) => ({
            ...current,
            recipients: { ...current.recipients, users: nextUsers },
        }));
    };

    const handleSave = () => {
        setToast("Alert configuration saved.");
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="Alert Configuration"
                description="Define alert types, recipients, and escalation thresholds."
                actions={
                    <Button size="sm" onClick={handleSave}>
                        <Save className="h-4 w-4" />
                        Save
                    </Button>
                }
            />

            <FiltersBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search alert types"
            />

            <div className="grid gap-4 lg:grid-cols-3">
                {filteredAlerts.length === 0 ? (
                    <Card className="lg:col-span-3">
                        <CardContent className="py-10 text-center text-sm text-muted-foreground">
                            No alert types match the current filters.
                        </CardContent>
                    </Card>
                ) : (
                    filteredAlerts.map((alert) => (
                        <Card key={alert.id} className="shadow-sm">
                            <CardHeader className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle>{alert.name}</CardTitle>
                                    <Badge variant={alert.enabled ? "success" : "outline"}>
                                        {alert.enabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{alert.description}</p>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Enable alert</span>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                        checked={alert.enabled}
                                        onChange={() =>
                                            updateAlert(alert.id, (current) => ({
                                                ...current,
                                                enabled: !current.enabled,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">Severity</div>
                                    <Select
                                        options={SEVERITY_OPTIONS}
                                        value={alert.severity}
                                        onValueChange={(value) =>
                                            updateAlert(alert.id, (current) => ({
                                                ...current,
                                                severity: value as AlertSeverity,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">Recipients (roles)</div>
                                    <div className="grid gap-2">
                                        {ROLE_OPTIONS.map((role) => (
                                            <label key={role.value} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    checked={alert.recipients.roles.includes(role.value)}
                                                    onChange={() => toggleRole(alert, role.value)}
                                                />
                                                {role.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">Recipients (users)</div>
                                    <div className="grid gap-2">
                                        {MOCK_USERS.map((user) => (
                                            <label key={user.id} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    checked={alert.recipients.users.includes(user.id)}
                                                    onChange={() => toggleUser(alert, user.id)}
                                                />
                                                {user.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">Channels</div>
                                    <div className="grid gap-2">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                checked={alert.channels.inApp}
                                                onChange={() =>
                                                    updateAlert(alert.id, (current) => ({
                                                        ...current,
                                                        channels: {
                                                            ...current.channels,
                                                            inApp: !current.channels.inApp,
                                                        },
                                                    }))
                                                }
                                            />
                                            In-app
                                        </label>
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                checked={alert.channels.email}
                                                onChange={() =>
                                                    updateAlert(alert.id, (current) => ({
                                                        ...current,
                                                        channels: {
                                                            ...current.channels,
                                                            email: !current.channels.email,
                                                        },
                                                    }))
                                                }
                                            />
                                            Email
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">Threshold</div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={alert.params.threshold}
                                            onChange={(event) =>
                                                updateAlert(alert.id, (current) => ({
                                                    ...current,
                                                    params: {
                                                        ...current.params,
                                                        threshold: Number(event.target.value) || 0,
                                                    },
                                                }))
                                            }
                                        />
                                        <span className="text-xs text-muted-foreground">{alert.params.unit}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {toast ? (
                <div className="fixed bottom-6 right-6 rounded-lg border border-border bg-white px-4 py-3 text-sm shadow-lg">
                    {toast}
                </div>
            ) : null}
        </div>
    );
}
