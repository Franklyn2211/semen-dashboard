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

const DEFAULT_PERMISSIONS: Record<AdminRole, Permission[]> = {
    SUPER_ADMIN: RESOURCES.map((resource) => ({
        resource,
        actions: { view: true, create: true, edit: true, delete: true },
    })),
    MANAGEMENT: [
        { resource: "Planning", actions: { view: true, create: true, edit: true, delete: false } },
        { resource: "Operations", actions: { view: true, create: false, edit: false, delete: false } },
        { resource: "Executive", actions: { view: true, create: false, edit: false, delete: false } },
        { resource: "Administration", actions: { view: false, create: false, edit: false, delete: false } },
    ],
    OPERATOR: [
        { resource: "Planning", actions: { view: true, create: false, edit: false, delete: false } },
        { resource: "Operations", actions: { view: true, create: true, edit: true, delete: false } },
        { resource: "Executive", actions: { view: false, create: false, edit: false, delete: false } },
        { resource: "Administration", actions: { view: false, create: false, edit: false, delete: false } },
    ],
    DISTRIBUTOR: [
        { resource: "Planning", actions: { view: true, create: false, edit: false, delete: false } },
        { resource: "Operations", actions: { view: false, create: false, edit: false, delete: false } },
        { resource: "Executive", actions: { view: false, create: false, edit: false, delete: false } },
        { resource: "Administration", actions: { view: false, create: false, edit: false, delete: false } },
    ],
};

const DEFAULT_SIDEBAR: Record<AdminRole, string[]> = {
    SUPER_ADMIN: ["Dashboard", "Administration"],
    MANAGEMENT: ["Dashboard", "Planning", "Executive"],
    OPERATOR: ["Dashboard", "Operations", "Planning"],
    DISTRIBUTOR: ["Dashboard", "Planning"],
};

type SidebarModule = "Dashboard" | "Planning" | "Operations" | "Executive" | "Administration";
const SIDEBAR_MODULES: SidebarModule[] = [
    "Dashboard",
    "Planning",
    "Operations",
    "Executive",
    "Administration",
];

export function RbacView() {
    const [activeRole, setActiveRole] = useState<AdminRole>("SUPER_ADMIN");
    const [permissionsByRole, setPermissionsByRole] = useState<Record<AdminRole, Permission[]>>(
        DEFAULT_PERMISSIONS,
    );
    const [sidebarByRole, setSidebarByRole] = useState<Record<AdminRole, string[]>>(DEFAULT_SIDEBAR);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("admin_rbac");
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as {
                permissions: Record<AdminRole, Permission[]>;
                sidebar: Record<AdminRole, string[]>;
            };
            if (parsed?.permissions) setPermissionsByRole(parsed.permissions);
            if (parsed?.sidebar) setSidebarByRole(parsed.sidebar);
        } catch {
            return;
        }
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

    const handleSave = () => {
        localStorage.setItem(
            "admin_rbac",
            JSON.stringify({ permissions: permissionsByRole, sidebar: sidebarByRole }),
        );
        setSaved(true);
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
