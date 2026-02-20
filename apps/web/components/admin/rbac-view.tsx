"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AdminRole, Permission, PermissionResource } from "@/lib/types/admin";

const ROLE_OPTIONS = [
    { value: "SUPER_ADMIN", label: "SuperAdmin" },
    { value: "MANAGEMENT", label: "Management" },
    { value: "OPERATOR", label: "Operator" },
    { value: "DISTRIBUTOR", label: "Distributor" },
];

const RESOURCES: PermissionResource[] = [
    "Planning",
    "Operations",
    "Executive",
    "Administration",
];

type SidebarModule = "Dashboard" | "Planning" | "Operations" | "Distributor" | "Executive" | "Administration";
const SIDEBAR_MODULES: SidebarModule[] = [
    "Dashboard",
    "Planning",
    "Operations",
    "Distributor",
    "Executive",
    "Administration",
];

export function RbacView() {
    const [activeRole, setActiveRole] = useState<AdminRole>("SUPER_ADMIN");
    const [permissionsByRole, setPermissionsByRole] = useState<Record<AdminRole, Permission[]>>(() => {
        const makeEmpty = () =>
            RESOURCES.map((resource) => ({
                resource,
                actions: { view: false, create: false, edit: false, delete: false },
            }));
        return {
            SUPER_ADMIN: makeEmpty(),
            MANAGEMENT: makeEmpty(),
            OPERATOR: makeEmpty(),
            DISTRIBUTOR: makeEmpty(),
        };
    });
    const [sidebarByRole, setSidebarByRole] = useState<Record<AdminRole, string[]>>({
        SUPER_ADMIN: [],
        MANAGEMENT: [],
        OPERATOR: [],
        DISTRIBUTOR: [],
    });
    const [saved, setSaved] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            setLoadError(null);
            try {
                const res = await fetch("/api/admin/rbac");
                if (!res.ok) throw new Error("Failed to load RBAC config");
                const json = (await res.json()) as {
                    items: Array<{ role: AdminRole; config: { permissions?: Record<string, Permission["actions"]>; sidebar?: string[] } }>;
                };
                const nextPerms: Record<AdminRole, Permission[]> = { ...permissionsByRole };
                const nextSidebar: Record<AdminRole, string[]> = { ...sidebarByRole };

                (json.items ?? []).forEach((item) => {
                    const permObj = item.config?.permissions ?? {};
                    nextPerms[item.role] = RESOURCES.map((resource) => ({
                        resource,
                        actions: {
                            view: !!permObj[resource]?.view,
                            create: !!permObj[resource]?.create,
                            edit: !!permObj[resource]?.edit,
                            delete: !!permObj[resource]?.delete,
                        },
                    }));
                    nextSidebar[item.role] = item.config?.sidebar ?? [];
                });

                setPermissionsByRole(nextPerms);
                setSidebarByRole(nextSidebar);
                setSaved(true);
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : "Failed to load RBAC config");
            }
        }
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activePermissions = permissionsByRole[activeRole];

    const permissionMap = useMemo(() => {
        const map = new Map<PermissionResource, Permission>();
        activePermissions.forEach((perm) => map.set(perm.resource, perm));
        return map;
    }, [activePermissions]);

    const togglePermission = (resource: PermissionResource, action: keyof Permission["actions"]) => {
        setSaved(false);
        setPermissionsByRole((prev) => {
            const updated = prev[activeRole].map((perm) =>
                perm.resource === resource
                    ? { ...perm, actions: { ...perm.actions, [action]: !perm.actions[action] } }
                    : perm,
            );
            return { ...prev, [activeRole]: updated };
        });
    };

    const toggleSidebarModule = (module: SidebarModule) => {
        setSaved(false);
        setSidebarByRole((prev) => {
            const current = prev[activeRole] ?? [];
            const next = current.includes(module)
                ? current.filter((item) => item !== module)
                : [...current, module];
            return { ...prev, [activeRole]: next };
        });
    };

    const handleSave = async () => {
        setLoadError(null);
        try {
            const perms = permissionsByRole[activeRole];
            const permissions: Record<string, Permission["actions"]> = {};
            perms.forEach((p) => {
                permissions[p.resource] = p.actions;
            });
            const config = { permissions, sidebar: sidebarByRole[activeRole] ?? [] };
            const res = await fetch(`/api/admin/rbac/${activeRole}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (!res.ok) throw new Error("Failed to save RBAC config");
            setSaved(true);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to save RBAC config");
            setSaved(false);
        }
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="Role & Access Control"
                description="Define permissions and sidebar visibility per role."
                actions={
                    <Button size="sm" onClick={handleSave}>
                        <Save className="h-4 w-4" />
                        Save
                    </Button>
                }
                meta={
                    <Badge variant={saved ? "success" : "secondary"}>
                        {saved ? "Saved" : "Not saved"}
                    </Badge>
                }
            />

            <FiltersBar label="Role">
                <Select options={ROLE_OPTIONS} value={activeRole} onValueChange={(value) => setActiveRole(value as AdminRole)} />
            </FiltersBar>

            {loadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loadError}
                </div>
            ) : null}

            <DataTable
                columns={[
                    { key: "resource", label: "Resource" },
                    { key: "view", label: "View" },
                    { key: "create", label: "Create" },
                    { key: "edit", label: "Edit" },
                    { key: "delete", label: "Delete" },
                ]}
                rowCount={activePermissions.length}
                emptyLabel="No permissions configured."
            >
                {RESOURCES.map((resource) => {
                    const perm = permissionMap.get(resource);
                    return (
                        <tr key={resource} className="border-b border-border">
                            <td className="px-3 py-2 font-medium">{resource}</td>
                            {(["view", "create", "edit", "delete"] as const).map((action) => (
                                <td key={action} className="px-3 py-2">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                        checked={perm?.actions[action] ?? false}
                                        onChange={() => togglePermission(resource, action)}
                                    />
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </DataTable>

            <div className="rounded-lg border border-border bg-white p-4">
                <div className="text-sm font-medium">Sidebar visibility</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {SIDEBAR_MODULES.map((module) => (
                        <label key={module} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
                                checked={(sidebarByRole[activeRole] ?? []).includes(module)}
                                onChange={() => toggleSidebarModule(module)}
                            />
                            {module}
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
