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
    distributorId: string;
    password: string;
    status: UserStatus;
};

const EMPTY_FORM: UserFormState = {
    name: "",
    email: "",
    role: "MANAGEMENT",
    distributorId: "",
    password: "",
    status: "ACTIVE",
};

export function UsersView() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [distributors, setDistributors] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [toast, setToast] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [formState, setFormState] = useState<UserFormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setLoadError(null);
        try {
            const [usersRes, distRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/admin/distributors"),
            ]);
            if (!usersRes.ok) throw new Error("Failed to load users");
            if (!distRes.ok) throw new Error("Failed to load distributors");

            const usersJson = (await usersRes.json()) as { items: AdminUser[] };
            const distJson = (await distRes.json()) as { items: Array<{ id: number | string; name: string }> };

            setUsers(usersJson.items ?? []);
            setDistributors(
                (distJson.items ?? []).map((d) => ({ id: String(d.id), name: d.name })),
            );
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

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
            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    const distributorNameById = useMemo(() => {
        const map = new Map<string, string>();
        distributors.forEach((d) => map.set(d.id, d.name));
        return map;
    }, [distributors]);

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
            distributorId: user.distributorId ?? "",
            password: "",
            status: user.status,
        });
        setFormError(null);
        setFormOpen(true);
    };

    const handleSave = async () => {
        if (!formState.name.trim() || !formState.email.trim()) {
            setFormError("Name and email are required.");
            return;
        }
        if (!editingUser && !formState.password.trim()) {
            setFormError("Password is required when creating a user.");
            return;
        }
        if (formState.role === "DISTRIBUTOR" && !formState.distributorId) {
            setFormError("Distributor is required for Distributor role.");
            return;
        }

        try {
            setFormError(null);
            if (editingUser) {
                const res = await fetch(`/api/admin/users/${editingUser.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: formState.name,
                        email: formState.email,
                        role: formState.role,
                        distributorId:
                            formState.role === "DISTRIBUTOR" ? Number(formState.distributorId) : null,
                    }),
                });
                if (!res.ok) throw new Error("Failed to update user");

                await fetch(`/api/admin/users/${editingUser.id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: formState.status }),
                });
            } else {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: formState.name,
                        email: formState.email,
                        password: formState.password,
                        role: formState.role,
                        distributorId:
                            formState.role === "DISTRIBUTOR" ? Number(formState.distributorId) : null,
                    }),
                });
                if (!res.ok) throw new Error("Failed to create user");
            }
            setFormOpen(false);
            await load();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to save");
        }
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
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/admin/users/${user.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: nextStatus }),
                    });
                    if (!res.ok) throw new Error("Failed to update status");
                    await load();
                } finally {
                    setConfirm(null);
                }
            },
        });
    };

    const resetPassword = (user: AdminUser) => {
        requestConfirm({
            open: true,
            title: "Reset password",
            description: `Send a password reset to ${user.email}?`,
            confirmLabel: "Send reset",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
                        method: "POST",
                    });
                    if (!res.ok) throw new Error("Failed to reset password");
                    const json = (await res.json()) as { tempPassword?: string };
                    if (json.tempPassword) {
                        setToast(`Temp password for ${user.email}: ${json.tempPassword}`);
                    } else {
                        setToast(`Password reset for ${user.email}.`);
                    }
                } finally {
                    setConfirm(null);
                }
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
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error("Failed to delete user");
                    await load();
                } finally {
                    setConfirm(null);
                }
            },
        });
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="User Management"
                description="Manage system users, roles, and access status."
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
            </FiltersBar>

            <DataTable
                columns={[
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "role", label: "Role" },
                    { key: "distributor", label: "Distributor" },
                    { key: "status", label: "Status" },
                    { key: "lastLogin", label: "Last Login" },
                    { key: "actions", label: "Actions", className: "text-right" },
                ]}
                rowCount={filteredUsers.length}
                emptyLabel={
                    loading
                        ? "Loading users…"
                        : loadError
                            ? loadError
                            : "No users match the selected filters."
                }
            >
                {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2 font-medium">{user.name}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{user.email}</td>
                        <td className="px-3 py-2">{user.role.replace("_", " ")}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                            {user.role === "DISTRIBUTOR" && user.distributorId
                                ? distributorNameById.get(user.distributorId) ?? user.distributorId
                                : "—"}
                        </td>
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
                            <FormLabel>Distributor</FormLabel>
                            <FormControl>
                                <Select
                                    options={[
                                        { value: "", label: "—" },
                                        ...distributors.map((d) => ({ value: d.id, label: d.name })),
                                    ]}
                                    value={formState.distributorId}
                                    onValueChange={(value) =>
                                        setFormState({ ...formState, distributorId: value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                    </div>

                    {!editingUser ? (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input
                                    value={formState.password}
                                    onChange={(event) =>
                                        setFormState({ ...formState, password: event.target.value })
                                    }
                                    placeholder="Temporary password"
                                    type="password"
                                />
                            </FormControl>
                        </FormItem>
                    ) : null}
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
