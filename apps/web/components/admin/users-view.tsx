"use client";

import { useEffect, useMemo, useState } from "react";
import {
    KeyRound,
    Pencil,
    Plus,
    Power,
    Trash2,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Form, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { AdminRole, AdminUser, UserStatus } from "@/lib/types/admin";

const ROLE_OPTIONS = [
    { value: "all", label: "All roles" },
    { value: "SUPER_ADMIN", label: "SuperAdmin" },
    { value: "MANAGEMENT", label: "Management" },
    { value: "OPERATOR", label: "Operator" },
    { value: "DISTRIBUTOR", label: "Distributor" },
];

const STATUS_OPTIONS = [
    { value: "all", label: "All status" },
    { value: "ACTIVE", label: "Active" },
    { value: "DISABLED", label: "Disabled" },
];

const REGION_OPTIONS = [
    { value: "all", label: "All regions" },
    { value: "jakarta", label: "Jakarta" },
    { value: "bekasi", label: "Bekasi" },
    { value: "tangerang", label: "Tangerang" },
    { value: "bogor", label: "Bogor" },
];

const MOCK_USERS: AdminUser[] = [
    {
        id: "usr-1",
        name: "Nadia Putri",
        email: "nadia.putri@cementops.co",
        role: "SUPER_ADMIN",
        regionId: "jakarta",
        status: "ACTIVE",
        lastLoginAt: "2026-02-18 08:20",
    },
    {
        id: "usr-2",
        name: "Raka Pratama",
        email: "raka.pratama@cementops.co",
        role: "MANAGEMENT",
        regionId: "bekasi",
        status: "ACTIVE",
        lastLoginAt: "2026-02-18 14:05",
    },
    {
        id: "usr-3",
        name: "Dewi Ananda",
        email: "dewi.ananda@cementops.co",
        role: "OPERATOR",
        regionId: "tangerang",
        status: "DISABLED",
        lastLoginAt: "2026-02-14 09:12",
    },
    {
        id: "usr-4",
        name: "Tegar Mandala",
        email: "tegar.mandala@cementops.co",
        role: "DISTRIBUTOR",
        regionId: "bogor",
        status: "ACTIVE",
        lastLoginAt: "2026-02-18 06:32",
    },
];

type ConfirmState = {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
};

type UserFormState = {
    name: string;
    email: string;
    role: AdminRole;
    regionId: string;
    status: UserStatus;
};

const EMPTY_FORM: UserFormState = {
    name: "",
    email: "",
    role: "MANAGEMENT",
    regionId: "jakarta",
    status: "ACTIVE",
};

export function UsersView() {
    const [users, setUsers] = useState<AdminUser[]>(MOCK_USERS);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [regionFilter, setRegionFilter] = useState("all");
    const [toast, setToast] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [formState, setFormState] = useState<UserFormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 2400);
        return () => clearTimeout(id);
    }, [toast]);

    const filteredUsers = useMemo(() => {
        return users.filter((user) => {
            const matchesSearch =
                user.name.toLowerCase().includes(search.toLowerCase()) ||
                user.email.toLowerCase().includes(search.toLowerCase());
            const matchesRole = roleFilter === "all" || user.role === roleFilter;
            const matchesStatus = statusFilter === "all" || user.status === statusFilter;
            const matchesRegion = regionFilter === "all" || user.regionId === regionFilter;
            return matchesSearch && matchesRole && matchesStatus && matchesRegion;
        });
    }, [users, search, roleFilter, statusFilter, regionFilter]);

    const openAddDialog = () => {
        setEditingUser(null);
        setFormState(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
    };

    const openEditDialog = (user: AdminUser) => {
        setEditingUser(user);
        setFormState({
            name: user.name,
            email: user.email,
            role: user.role,
            regionId: user.regionId,
            status: user.status,
        });
        setFormError(null);
        setFormOpen(true);
    };

    const handleSave = () => {
        if (!formState.name.trim() || !formState.email.trim()) {
            setFormError("Name and email are required.");
            return;
        }
        if (editingUser) {
            setUsers((prev) =>
                prev.map((user) =>
                    user.id === editingUser.id
                        ? { ...user, ...formState, lastLoginAt: user.lastLoginAt }
                        : user,
                ),
            );
        } else {
            const now = new Date().toISOString().slice(0, 16).replace("T", " ");
            setUsers((prev) => [
                {
                    id: `usr-${Date.now()}`,
                    lastLoginAt: now,
                    ...formState,
                },
                ...prev,
            ]);
        }
        setFormOpen(false);
    };

    const requestConfirm = (state: ConfirmState) => setConfirm(state);

    const toggleStatus = (user: AdminUser) => {
        const nextStatus: UserStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
        requestConfirm({
            open: true,
            title: `${nextStatus === "DISABLED" ? "Disable" : "Enable"} user`,
            description: `Are you sure you want to set ${user.name} as ${nextStatus.toLowerCase()}?`,
            confirmLabel: nextStatus === "DISABLED" ? "Disable" : "Enable",
            tone: nextStatus === "DISABLED" ? "danger" : "default",
            onConfirm: () => {
                setUsers((prev) =>
                    prev.map((item) => (item.id === user.id ? { ...item, status: nextStatus } : item)),
                );
                setConfirm(null);
            },
        });
    };

    const resetPassword = (user: AdminUser) => {
        requestConfirm({
            open: true,
            title: "Reset password",
            description: `Send a password reset to ${user.email}?`,
            confirmLabel: "Send reset",
            onConfirm: () => {
                setToast(`Password reset link sent to ${user.email}.`);
                setConfirm(null);
            },
        });
    };

    const deleteUser = (user: AdminUser) => {
        requestConfirm({
            open: true,
            title: "Delete user",
            description: `This will permanently remove ${user.name}.`,
            confirmLabel: "Delete",
            tone: "danger",
            onConfirm: () => {
                setUsers((prev) => prev.filter((item) => item.id !== user.id));
                setConfirm(null);
            },
        });
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="User Management"
                description="Manage system users, roles, and access status across regions."
                actions={
                    <Button size="sm" onClick={openAddDialog}>
                        <Plus className="h-4 w-4" />
                        Add User
                    </Button>
                }
            />

            <FiltersBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search name or email"
            >
                <Select options={ROLE_OPTIONS} value={roleFilter} onValueChange={setRoleFilter} />
                <Select options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} />
                <Select options={REGION_OPTIONS} value={regionFilter} onValueChange={setRegionFilter} />
            </FiltersBar>

            <DataTable
                columns={[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "role", label: "Role" },
                    { key: "region", label: "Region" },
                    { key: "status", label: "Status" },
                    { key: "lastLogin", label: "Last Login" },
                    { key: "actions", label: "Actions", className: "text-right" },
                ]}
                rowCount={filteredUsers.length}
                emptyLabel="No users match the selected filters."
            >
                {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2 font-medium">{user.name}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{user.email}</td>
                        <td className="px-3 py-2">{user.role.replace("_", " ")}</td>
                        <td className="px-3 py-2 capitalize">{user.regionId}</td>
                        <td className="px-3 py-2">
                            <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>
                                {user.status === "ACTIVE" ? "Active" : "Disabled"}
                            </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{user.lastLoginAt}</td>
                        <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-2">
                                <Button size="xs" variant="ghost" onClick={() => openEditDialog(user)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="xs" variant="ghost" onClick={() => toggleStatus(user)}>
                                    <Power className="h-4 w-4" />
                                </Button>
                                <Button size="xs" variant="ghost" onClick={() => resetPassword(user)}>
                                    <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button size="xs" variant="ghost" onClick={() => deleteUser(user)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                ))}
            </DataTable>

            <EntityFormDialog
                open={formOpen}
                title={editingUser ? "Edit user" : "Add user"}
                description="Define identity, role, and status."
                submitLabel={editingUser ? "Save changes" : "Create user"}
                onSubmit={handleSave}
                onClose={() => setFormOpen(false)}
            >
                <Form className="space-y-3">
                    <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                            <Input
                                value={formState.name}
                                onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                                placeholder="Full name"
                            />
                        </FormControl>
                    </FormItem>
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                            <Input
                                value={formState.email}
                                onChange={(event) => setFormState({ ...formState, email: event.target.value })}
                                placeholder="user@cementops.co"
                                type="email"
                            />
                        </FormControl>
                    </FormItem>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormItem>
                            <FormLabel>Role</FormLabel>
                            <FormControl>
                                <Select
                                    options={ROLE_OPTIONS.filter((item) => item.value !== "all")}
                                    value={formState.role}
                                    onValueChange={(value) =>
                                        setFormState({ ...formState, role: value as AdminRole })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Region</FormLabel>
                            <FormControl>
                                <Select
                                    options={REGION_OPTIONS.filter((item) => item.value !== "all")}
                                    value={formState.regionId}
                                    onValueChange={(value) =>
                                        setFormState({ ...formState, regionId: value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                    </div>
                    <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                            <Select
                                options={STATUS_OPTIONS.filter((item) => item.value !== "all")}
                                value={formState.status}
                                onValueChange={(value) =>
                                    setFormState({ ...formState, status: value as UserStatus })
                                }
                            />
                        </FormControl>
                    </FormItem>
                    {formError ? <FormMessage>{formError}</FormMessage> : null}
                </Form>
            </EntityFormDialog>

            <ConfirmDialog
                open={!!confirm}
                title={confirm?.title ?? ""}
                description={confirm?.description ?? ""}
                confirmLabel={confirm?.confirmLabel}
                tone={confirm?.tone}
                onConfirm={() => confirm?.onConfirm()}
                onClose={() => setConfirm(null)}
            />

            {toast ? (
                <div className="fixed bottom-6 right-6 rounded-lg border border-border bg-white px-4 py-3 text-sm shadow-lg">
                    {toast}
                </div>
            ) : null}
        </div>
    );
}
