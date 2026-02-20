"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable } from "@/components/admin/data-table";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { FiltersBar } from "@/components/admin/filters-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormItem, FormLabel } from "@/components/ui/form";
import type { DistributorEntity, Factory, Outlet, Warehouse } from "@/lib/types/admin";

type MasterTab = "factories" | "warehouses" | "distributors" | "outlets";

type ConfirmState = {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
};

type FormState = {
    name: string;
    lat: string;
    lng: string;
    capacityTons: string;
    serviceRadiusKm: string;
};

const EMPTY_FORM: FormState = {
    name: "",
    lat: "",
    lng: "",
    capacityTons: "",
    serviceRadiusKm: "",
};

function tabLabel(tab: MasterTab) {
    switch (tab) {
        case "factories":
            return "Plant";
        case "warehouses":
            return "Warehouse";
        case "distributors":
            return "Distributor";
        case "outlets":
            return "Store";
    }
}

async function fetchItems<T>(url: string): Promise<T[]> {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: T[] };
    return json.items ?? [];
}

export function MasterDataView() {
    const [activeTab, setActiveTab] = useState<MasterTab>("factories");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const [factories, setFactories] = useState<Factory[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [distributors, setDistributors] = useState<DistributorEntity[]>([]);
    const [outlets, setOutlets] = useState<Outlet[]>([]);

    const [formOpen, setFormOpen] = useState(false);
    const [formTab, setFormTab] = useState<MasterTab>("factories");
    const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);

    async function loadAll() {
        setLoading(true);
        try {
            const [plants, whs, dists, stores] = await Promise.all([
                fetchItems<Factory>("/api/admin/plants"),
                fetchItems<Warehouse>("/api/admin/warehouses"),
                fetchItems<DistributorEntity>("/api/admin/distributors"),
                fetchItems<Outlet>("/api/admin/stores"),
            ]);

            setFactories(plants);
            setWarehouses(whs);
            setDistributors(dists);
            setOutlets(stores);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadAll();
    }, []);

    const filteredFactories = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return factories;
        return factories.filter((item) => item.name.toLowerCase().includes(q));
    }, [factories, search]);

    const filteredWarehouses = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return warehouses;
        return warehouses.filter((item) => item.name.toLowerCase().includes(q));
    }, [warehouses, search]);

    const filteredDistributors = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return distributors;
        return distributors.filter((item) => item.name.toLowerCase().includes(q));
    }, [distributors, search]);

    const filteredOutlets = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return outlets;
        return outlets.filter((item) => item.name.toLowerCase().includes(q));
    }, [outlets, search]);

    function openForm(tab: MasterTab, id?: string) {
        setFormTab(tab);
        setEditingId(id ?? null);

        if (!id) {
            setFormState(EMPTY_FORM);
            setFormOpen(true);
            return;
        }

        if (tab === "factories") {
            const item = factories.find((x) => x.id === id);
            if (!item) return;
            setFormState({
                ...EMPTY_FORM,
                name: item.name,
                lat: String(item.lat),
                lng: String(item.lng),
            });
        }

        if (tab === "warehouses") {
            const item = warehouses.find((x) => x.id === id);
            if (!item) return;
            setFormState({
                ...EMPTY_FORM,
                name: item.name,
                capacityTons: String(item.capacityTons),
                lat: String(item.lat),
                lng: String(item.lng),
            });
        }

        if (tab === "distributors") {
            const item = distributors.find((x) => x.id === id);
            if (!item) return;
            setFormState({
                ...EMPTY_FORM,
                name: item.name,
                serviceRadiusKm: String(item.serviceRadiusKm),
                lat: String(item.lat),
                lng: String(item.lng),
            });
        }

        if (tab === "outlets") {
            const item = outlets.find((x) => x.id === id);
            if (!item) return;
            setFormState({
                ...EMPTY_FORM,
                name: item.name,
                lat: String(item.lat),
                lng: String(item.lng),
            });
        }

        setFormOpen(true);
    }

    function requestDelete(tab: MasterTab, id: string, label: string) {
        setConfirm({
            open: true,
            title: `Delete ${tabLabel(tab)}`,
            description: `This will permanently remove ${label}.`,
            confirmLabel: "Delete",
            tone: "danger",
            onConfirm: async () => {
                const endpoint =
                    tab === "factories"
                        ? `/api/admin/plants/${id}`
                        : tab === "warehouses"
                            ? `/api/admin/warehouses/${id}`
                            : tab === "distributors"
                                ? `/api/admin/distributors/${id}`
                                : `/api/admin/stores/${id}`;
                await fetch(endpoint, { method: "DELETE" });
                setConfirm(null);
                await loadAll();
            },
        });
    }

    async function saveForm() {
        const name = formState.name.trim();
        const lat = Number(formState.lat);
        const lng = Number(formState.lng);
        if (!name) return;
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        const base =
            formTab === "factories"
                ? "/api/admin/plants"
                : formTab === "warehouses"
                    ? "/api/admin/warehouses"
                    : formTab === "distributors"
                        ? "/api/admin/distributors"
                        : "/api/admin/stores";
        const url = editingId ? `${base}/${editingId}` : base;
        const method = editingId ? "PUT" : "POST";

        const payload: Record<string, unknown> = { name, lat, lng };

        if (formTab === "warehouses") {
            payload.capacityTons = Number(formState.capacityTons) || 0;
        }
        if (formTab === "distributors") {
            payload.serviceRadiusKm = Number(formState.serviceRadiusKm) || 0;
        }

        await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        setFormOpen(false);
        await loadAll();
    }

    const formTitle = `${editingId ? "Edit" : "Add"} ${tabLabel(formTab)}`;

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Master Data"
                description="Maintain baseline entities and reference data for planning and operations workflows."
                actions={
                    <Button size="sm" onClick={() => openForm(activeTab)}>
                        <Plus className="h-4 w-4" />
                        Add Record
                    </Button>
                }
            />

            <FiltersBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search master data" />

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MasterTab)}>
                <TabsList>
                    <TabsTrigger value="factories">Plants</TabsTrigger>
                    <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
                    <TabsTrigger value="distributors">Distributors</TabsTrigger>
                    <TabsTrigger value="outlets">Stores</TabsTrigger>
                </TabsList>

                <TabsContent value="factories">
                    <DataTable
                        columns={[
                            { key: "name", label: "Plant" },
                            { key: "lat", label: "Lat" },
                            { key: "lng", label: "Lng" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredFactories.length}
                        loading={loading}
                        emptyLabel="No plants available."
                    >
                        {filteredFactories.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lat}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lng}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("factories", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => requestDelete("factories", item.id, item.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </DataTable>
                </TabsContent>

                <TabsContent value="warehouses">
                    <DataTable
                        columns={[
                            { key: "name", label: "Warehouse" },
                            { key: "capacity", label: "Capacity (tons)" },
                            { key: "lat", label: "Lat" },
                            { key: "lng", label: "Lng" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredWarehouses.length}
                        loading={loading}
                        emptyLabel="No warehouses available."
                    >
                        {filteredWarehouses.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.capacityTons}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lat}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lng}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("warehouses", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => requestDelete("warehouses", item.id, item.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </DataTable>
                </TabsContent>

                <TabsContent value="distributors">
                    <DataTable
                        columns={[
                            { key: "name", label: "Distributor" },
                            { key: "radius", label: "Service Radius (km)" },
                            { key: "lat", label: "Lat" },
                            { key: "lng", label: "Lng" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredDistributors.length}
                        loading={loading}
                        emptyLabel="No distributors available."
                    >
                        {filteredDistributors.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.serviceRadiusKm}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lat}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lng}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("distributors", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => requestDelete("distributors", item.id, item.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </DataTable>
                </TabsContent>

                <TabsContent value="outlets">
                    <DataTable
                        columns={[
                            { key: "name", label: "Store" },
                            { key: "lat", label: "Lat" },
                            { key: "lng", label: "Lng" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredOutlets.length}
                        loading={loading}
                        emptyLabel="No stores available."
                    >
                        {filteredOutlets.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lat}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.lng}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("outlets", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => requestDelete("outlets", item.id, item.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </DataTable>
                </TabsContent>
            </Tabs>

            <EntityFormDialog
                open={formOpen}
                title={formTitle}
                submitLabel={editingId ? "Update" : "Create"}
                onClose={() => setFormOpen(false)}
                onSubmit={() => void saveForm()}
            >
                <Form className="space-y-3">
                    <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                            <Input value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} />
                        </FormControl>
                    </FormItem>

                    {formTab === "warehouses" ? (
                        <FormItem>
                            <FormLabel>Capacity (tons)</FormLabel>
                            <FormControl>
                                <Input value={formState.capacityTons} onChange={(event) => setFormState({ ...formState, capacityTons: event.target.value })} />
                            </FormControl>
                        </FormItem>
                    ) : null}

                    {formTab === "distributors" ? (
                        <FormItem>
                            <FormLabel>Service radius (km)</FormLabel>
                            <FormControl>
                                <Input value={formState.serviceRadiusKm} onChange={(event) => setFormState({ ...formState, serviceRadiusKm: event.target.value })} />
                            </FormControl>
                        </FormItem>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormItem>
                            <FormLabel>Latitude</FormLabel>
                            <FormControl>
                                <Input value={formState.lat} onChange={(event) => setFormState({ ...formState, lat: event.target.value })} />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Longitude</FormLabel>
                            <FormControl>
                                <Input value={formState.lng} onChange={(event) => setFormState({ ...formState, lng: event.target.value })} />
                            </FormControl>
                        </FormItem>
                    </div>
                </Form>
            </EntityFormDialog>

            <ConfirmDialog
                open={!!confirm?.open}
                title={confirm?.title ?? ""}
                description={confirm?.description}
                confirmLabel={confirm?.confirmLabel}
                tone={confirm?.tone}
                onClose={() => setConfirm(null)}
                onConfirm={() => void confirm?.onConfirm()}
            />
        </div>
    );
}
