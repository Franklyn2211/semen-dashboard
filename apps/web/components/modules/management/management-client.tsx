"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
    Dialog,
    DialogBody,
    DialogCard,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

// ────────── Types ──────────

type Distributor = {
    id: number;
    name: string;
    lat: number;
    lng: number;
    serviceRadiusKm: number;
};

type Store = {
    id: number;
    name: string;
    lat: number;
    lng: number;
};

type Project = {
    id: number;
    name: string;
    type: string;
    lat: number;
    lng: number;
    startDate: string;
    endDate: string;
    demandTonsMonth: number;
};

type Tab = "distributors" | "stores" | "projects";

// ────────── Field helpers ──────────

function FormField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            {children}
        </div>
    );
}

function NumInput({
    value,
    onChange,
    step = "any",
    placeholder,
}: {
    value: number;
    onChange: (v: number) => void;
    step?: string;
    placeholder?: string;
}) {
    return (
        <Input
            type="number"
            step={step}
            placeholder={placeholder}
            value={value || ""}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
    );
}

// ────────── Distributors ──────────

function DistributorsTab() {
    const [items, setItems] = useState<Distributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Distributor | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: "",
        lat: -6.25,
        lng: 106.9,
        serviceRadiusKm: 10,
    });

    const load = useCallback(() => {
        setLoading(true);
        fetch("/api/admin/distributors")
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as Distributor[]))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function openCreate() {
        setEditing(null);
        setForm({ name: "", lat: -6.25, lng: 106.9, serviceRadiusKm: 10 });
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(d: Distributor) {
        setEditing(d);
        setForm({ name: d.name, lat: d.lat, lng: d.lng, serviceRadiusKm: d.serviceRadiusKm });
        setError(null);
        setDialogOpen(true);
    }

    async function save() {
        if (!form.name.trim()) { setError("Name is required"); return; }
        setBusy(true); setError(null);
        try {
            const url = editing ? `/api/admin/distributors/${editing.id}` : "/api/admin/distributors";
            const method = editing ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Failed to save");
                return;
            }
            setDialogOpen(false);
            load();
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number) {
        if (!confirm("Delete this distributor?")) return;
        const res = await fetch(`/api/admin/distributors/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            alert(d?.error?.message ?? "Failed to delete");
            return;
        }
        load();
    }

    const filtered = items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <Input
                    placeholder="Search distributor..."
                    className="max-w-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <Button onClick={openCreate} size="sm">
                    + Add Distributor
                </Button>
            </div>

            {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Name</TH>
                                <TH>Lat</TH>
                                <TH>Lng</TH>
                                <TH>Radius (km)</TH>
                                <TH className="text-right">Actions</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {filtered.length === 0 ? (
                                <TR>
                                    <TD colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                                        No distributors found.
                                    </TD>
                                </TR>
                            ) : (
                                filtered.map((d) => (
                                    <TR key={d.id}>
                                        <TD className="text-muted-foreground">#{d.id}</TD>
                                        <TD className="font-medium">{d.name}</TD>
                                        <TD className="font-mono text-xs">{d.lat.toFixed(4)}</TD>
                                        <TD className="font-mono text-xs">{d.lng.toFixed(4)}</TD>
                                        <TD>
                                            <Badge variant="secondary">{d.serviceRadiusKm} km</Badge>
                                        </TD>
                                        <TD className="text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <Button variant="outline" size="xs" onClick={() => openEdit(d)}>
                                                    Edit
                                                </Button>
                                                <Button variant="danger" size="xs" onClick={() => remove(d.id)}>
                                                    Delete
                                                </Button>
                                            </div>
                                        </TD>
                                    </TR>
                                ))
                            )}
                        </TBody>
                    </Table>
                </div>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Distributor" : "New Distributor"}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <FormField label="Name">
                            <Input
                                placeholder="Distributor name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Latitude">
                                <NumInput value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} step="0.0001" placeholder="-6.25" />
                            </FormField>
                            <FormField label="Longitude">
                                <NumInput value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} step="0.0001" placeholder="106.9" />
                            </FormField>
                        </div>
                        <FormField label="Service Radius (km)">
                            <NumInput value={form.serviceRadiusKm} onChange={(v) => setForm((f) => ({ ...f, serviceRadiusKm: v }))} step="0.5" placeholder="10" />
                        </FormField>
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={save} disabled={busy}>
                            {busy ? "Saving…" : editing ? "Update" : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </>
    );
}

// ────────── Stores ──────────

function StoresTab() {
    const [items, setItems] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Store | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ name: "", lat: -6.25, lng: 106.9 });

    const load = useCallback(() => {
        setLoading(true);
        fetch("/api/admin/stores")
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as Store[]))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function openCreate() {
        setEditing(null);
        setForm({ name: "", lat: -6.25, lng: 106.9 });
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(s: Store) {
        setEditing(s);
        setForm({ name: s.name, lat: s.lat, lng: s.lng });
        setError(null);
        setDialogOpen(true);
    }

    async function save() {
        if (!form.name.trim()) { setError("Name is required"); return; }
        setBusy(true); setError(null);
        try {
            const url = editing ? `/api/admin/stores/${editing.id}` : "/api/admin/stores";
            const res = await fetch(url, {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Failed to save");
                return;
            }
            setDialogOpen(false);
            load();
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number) {
        if (!confirm("Delete this store?")) return;
        const res = await fetch(`/api/admin/stores/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            alert(d?.error?.message ?? "Failed to delete");
            return;
        }
        load();
    }

    const filtered = items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <Input placeholder="Search store..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
                <Button onClick={openCreate} size="sm">+ Add Store</Button>
            </div>

            {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Name</TH>
                                <TH>Lat</TH>
                                <TH>Lng</TH>
                                <TH className="text-right">Actions</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {filtered.length === 0 ? (
                                <TR><TD colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No stores found.</TD></TR>
                            ) : (
                                filtered.map((s) => (
                                    <TR key={s.id}>
                                        <TD className="text-muted-foreground">#{s.id}</TD>
                                        <TD className="font-medium">{s.name}</TD>
                                        <TD className="font-mono text-xs">{s.lat.toFixed(4)}</TD>
                                        <TD className="font-mono text-xs">{s.lng.toFixed(4)}</TD>
                                        <TD className="text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <Button variant="outline" size="xs" onClick={() => openEdit(s)}>Edit</Button>
                                                <Button variant="danger" size="xs" onClick={() => remove(s.id)}>Delete</Button>
                                            </div>
                                        </TD>
                                    </TR>
                                ))
                            )}
                        </TBody>
                    </Table>
                </div>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Store" : "New Store"}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <FormField label="Name">
                            <Input placeholder="Store name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Latitude">
                                <NumInput value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} step="0.0001" />
                            </FormField>
                            <FormField label="Longitude">
                                <NumInput value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} step="0.0001" />
                            </FormField>
                        </div>
                        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Update" : "Create"}</Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </>
    );
}

// ────────── Projects ──────────

const PROJECT_TYPES = ["CONSTRUCTION", "INFRASTRUCTURE", "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"];

function ProjectsTab() {
    const [items, setItems] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const today = new Date().toISOString().slice(0, 10);
    const sixMonths = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

    const [form, setForm] = useState({
        name: "",
        type: "CONSTRUCTION",
        lat: -6.25,
        lng: 106.9,
        startDate: today,
        endDate: sixMonths,
        demandTonsMonth: 100,
    });

    const load = useCallback(() => {
        setLoading(true);
        fetch("/api/admin/projects")
            .then((r) => r.json())
            .then((d) => setItems((d.items ?? []) as Project[]))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function openCreate() {
        setEditing(null);
        setForm({ name: "", type: "CONSTRUCTION", lat: -6.25, lng: 106.9, startDate: today, endDate: sixMonths, demandTonsMonth: 100 });
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(p: Project) {
        setEditing(p);
        setForm({ name: p.name, type: p.type, lat: p.lat, lng: p.lng, startDate: p.startDate, endDate: p.endDate, demandTonsMonth: p.demandTonsMonth });
        setError(null);
        setDialogOpen(true);
    }

    async function save() {
        if (!form.name.trim()) { setError("Name is required"); return; }
        setBusy(true); setError(null);
        try {
            const url = editing ? `/api/admin/projects/${editing.id}` : "/api/admin/projects";
            const res = await fetch(url, {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
                setError(d?.error?.message ?? "Failed to save");
                return;
            }
            setDialogOpen(false);
            load();
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number) {
        if (!confirm("Delete this project?")) return;
        const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const d = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            alert(d?.error?.message ?? "Failed to delete");
            return;
        }
        load();
    }

    const TYPE_BADGE: Record<string, "default" | "success" | "warning" | "secondary"> = {
        CONSTRUCTION: "default",
        INFRASTRUCTURE: "secondary",
        RESIDENTIAL: "success",
        COMMERCIAL: "warning",
        INDUSTRIAL: "secondary",
    };

    const filtered = items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.type.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <Input placeholder="Search project..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
                <Button onClick={openCreate} size="sm">+ Add Project</Button>
            </div>

            {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                        <THead>
                            <TR>
                                <TH>ID</TH>
                                <TH>Name</TH>
                                <TH>Type</TH>
                                <TH>Start</TH>
                                <TH>End</TH>
                                <TH className="text-right">Demand/mo</TH>
                                <TH className="text-right">Actions</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {filtered.length === 0 ? (
                                <TR><TD colSpan={7} className="text-center py-6 text-muted-foreground text-sm">No projects found.</TD></TR>
                            ) : (
                                filtered.map((p) => (
                                    <TR key={p.id}>
                                        <TD className="text-muted-foreground">#{p.id}</TD>
                                        <TD className="font-medium">{p.name}</TD>
                                        <TD>
                                            <Badge variant={TYPE_BADGE[p.type] ?? "secondary"}>{p.type}</Badge>
                                        </TD>
                                        <TD className="text-xs text-muted-foreground">{p.startDate}</TD>
                                        <TD className="text-xs text-muted-foreground">{p.endDate}</TD>
                                        <TD className="text-right font-mono text-sm">{Number(p.demandTonsMonth).toFixed(0)}</TD>
                                        <TD className="text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <Button variant="outline" size="xs" onClick={() => openEdit(p)}>Edit</Button>
                                                <Button variant="danger" size="xs" onClick={() => remove(p.id)}>Delete</Button>
                                            </div>
                                        </TD>
                                    </TR>
                                ))
                            )}
                        </TBody>
                    </Table>
                </div>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                <DialogCard>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <FormField label="Name">
                            <Input placeholder="Project name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                        </FormField>
                        <FormField label="Type">
                            <select
                                className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                value={form.type}
                                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                            >
                                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Latitude">
                                <NumInput value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} step="0.0001" />
                            </FormField>
                            <FormField label="Longitude">
                                <NumInput value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} step="0.0001" />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Start Date">
                                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                            </FormField>
                            <FormField label="End Date">
                                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
                            </FormField>
                        </div>
                        <FormField label="Demand (tons/month)">
                            <NumInput value={form.demandTonsMonth} onChange={(v) => setForm((f) => ({ ...f, demandTonsMonth: v }))} step="10" placeholder="100" />
                        </FormField>
                        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Update" : "Create"}</Button>
                    </DialogFooter>
                </DialogCard>
            </Dialog>
        </>
    );
}

// ────────── Main component ──────────

const TABS: { key: Tab; label: string; icon: string; desc: string }[] = [
    { key: "distributors", label: "Distributors", icon: "🏭", desc: "Manage cement distributors and service areas" },
    { key: "stores", label: "Stores", icon: "🏪", desc: "Manage retail stores / toko bangunan" },
    { key: "projects", label: "Projects", icon: "🏗️", desc: "Manage construction projects and demand forecast" },
];

export function ManagementClient() {
    const [tab, setTab] = useState<Tab>("distributors");
    const current = TABS.find((t) => t.key === tab)!;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-lg font-semibold">Master Data Management</h1>
                <p className="text-sm text-muted-foreground">
                    Create, edit, and delete master data entities.
                </p>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 rounded-lg border border-border bg-muted/60 p-1 w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={
                            tab === t.key
                                ? "flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm"
                                : "flex items-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        }
                    >
                        <span>{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content card */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        {current.icon} {current.label}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{current.desc}</span>
                </CardHeader>
                <CardContent>
                    {tab === "distributors" && <DistributorsTab />}
                    {tab === "stores" && <StoresTab />}
                    {tab === "projects" && <ProjectsTab />}
                </CardContent>
            </Card>
        </div>
    );
}
