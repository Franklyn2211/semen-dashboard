"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormItem, FormLabel } from "@/components/ui/form";
import type { DistributorEntity, Factory, Outlet, Warehouse } from "@/lib/types/admin";

type MasterTab = "factories" | "warehouses" | "distributors" | "outlets";

const STATUS_OPTIONS = [
    { value: "all", label: "All status" },
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
];

const REGION_OPTIONS = [
    { value: "jakarta", label: "Jakarta" },
    { value: "bekasi", label: "Bekasi" },
    { value: "tangerang", label: "Tangerang" },
    { value: "bogor", label: "Bogor" },
];

const MOCK_FACTORIES: Factory[] = [
    {
        id: "fac-1",
        name: "Cement Plant Cilegon",
        address: "Jl. Raya Merak KM 6",
        lat: -6.02,
        lng: 106.02,
        status: "ACTIVE",
    },
    {
        id: "fac-2",
        name: "Karawang Grinding",
        address: "Kawasan Industri KIIC",
        lat: -6.32,
        lng: 107.3,
        status: "ACTIVE",
    },
];

const MOCK_WAREHOUSES: Warehouse[] = [
    {
        id: "wh-1",
        name: "Cikarang Warehouse",
        factoryId: "fac-2",
        capacityTon: 2000,
        address: "Delta Mas",
        lat: -6.31,
        lng: 107.14,
        status: "ACTIVE",
    },
    {
        id: "wh-2",
        name: "Priok Depot",
        capacityTon: 1800,
        address: "Pelabuhan Tanjung Priok",
        lat: -6.11,
        lng: 106.88,
        status: "INACTIVE",
    },
];

const MOCK_DISTRIBUTORS: DistributorEntity[] = [
    {
        id: "dist-1",
        name: "Tangerang Hub",
        phone: "+62 812 3400 1122",
        address: "Jl. MH Thamrin",
        lat: -6.19,
        lng: 106.64,
        regionId: "tangerang",
        status: "ACTIVE",
    },
    {
        id: "dist-2",
        name: "Bekasi Central",
        phone: "+62 812 7844 9931",
        address: "Jl. Ahmad Yani",
        lat: -6.24,
        lng: 107.02,
        regionId: "bekasi",
        status: "ACTIVE",
    },
];

const MOCK_OUTLETS: Outlet[] = [
    {
        id: "out-1",
        distributorId: "dist-1",
        name: "TB Sumber Jaya",
        address: "Jl. Asia Afrika",
        lat: -6.21,
        lng: 106.85,
        status: "ACTIVE",
    },
    {
        id: "out-2",
        distributorId: "dist-2",
        name: "Outlet Nusantara",
        address: "Jl. Ir. H. Juanda",
        lat: -6.22,
        lng: 107.01,
        status: "INACTIVE",
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

type FormState = Record<string, string>;

const FORM_DEFAULTS: Record<MasterTab, FormState> = {
    factories: { name: "", address: "", lat: "", lng: "", status: "ACTIVE" },
    warehouses: {
        name: "",
        factoryId: "",
        capacityTon: "",
        address: "",
        lat: "",
        lng: "",
        status: "ACTIVE",
    },
    distributors: {
        name: "",
        phone: "",
        address: "",
        lat: "",
        lng: "",
        regionId: "jakarta",
        status: "ACTIVE",
    },
    outlets: {
        distributorId: "",
        name: "",
        address: "",
        lat: "",
        lng: "",
        status: "ACTIVE",
    },
};

export function MasterDataView() {
    const [activeTab, setActiveTab] = useState<MasterTab>("factories");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const [factories, setFactories] = useState<Factory[]>(MOCK_FACTORIES);
    const [warehouses, setWarehouses] = useState<Warehouse[]>(MOCK_WAREHOUSES);
    const [distributors, setDistributors] = useState<DistributorEntity[]>(MOCK_DISTRIBUTORS);
    const [outlets, setOutlets] = useState<Outlet[]>(MOCK_OUTLETS);

    const [formOpen, setFormOpen] = useState(false);
    const [formTab, setFormTab] = useState<MasterTab>("factories");
    const [formState, setFormState] = useState<FormState>(FORM_DEFAULTS.factories);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);

    const factoryOptions = useMemo(
        () => factories.map((factory) => ({ value: factory.id, label: factory.name })),
        [factories],
    );

    const distributorOptions = useMemo(
        () => distributors.map((dist) => ({ value: dist.id, label: dist.name })),
        [distributors],
    );

    const filteredFactories = useMemo(() => {
        return factories.filter((item) => {
            const matchesSearch =
                item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.address.toLowerCase().includes(search.toLowerCase());
            const matchesStatus = statusFilter === "all" || item.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [factories, search, statusFilter]);

    const filteredWarehouses = useMemo(() => {
        return warehouses.filter((item) => {
            const matchesSearch =
                item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.address.toLowerCase().includes(search.toLowerCase());
            const matchesStatus = statusFilter === "all" || item.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [warehouses, search, statusFilter]);

    const filteredDistributors = useMemo(() => {
        return distributors.filter((item) => {
            const matchesSearch =
                item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.address.toLowerCase().includes(search.toLowerCase()) ||
                item.phone.toLowerCase().includes(search.toLowerCase());
            const matchesStatus = statusFilter === "all" || item.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [distributors, search, statusFilter]);

    const filteredOutlets = useMemo(() => {
        return outlets.filter((item) => {
            const matchesSearch =
                item.name.toLowerCase().includes(search.toLowerCase()) ||
                item.address.toLowerCase().includes(search.toLowerCase());
            const matchesStatus = statusFilter === "all" || item.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [outlets, search, statusFilter]);

    const openForm = (tab: MasterTab, id?: string) => {
        setFormTab(tab);
        setEditingId(id ?? null);
        if (!id) {
            setFormState(FORM_DEFAULTS[tab]);
            setFormOpen(true);
            return;
        }

        if (tab === "factories") {
            const item = factories.find((factory) => factory.id === id);
            if (!item) return;
            setFormState({
                name: item.name,
                address: item.address,
                lat: String(item.lat),
                lng: String(item.lng),
                status: item.status,
            });
        }

        if (tab === "warehouses") {
            const item = warehouses.find((warehouse) => warehouse.id === id);
            if (!item) return;
            setFormState({
                name: item.name,
                factoryId: item.factoryId ?? "",
                capacityTon: String(item.capacityTon),
                address: item.address,
                lat: String(item.lat),
                lng: String(item.lng),
                status: item.status,
            });
        }

        if (tab === "distributors") {
            const item = distributors.find((dist) => dist.id === id);
            if (!item) return;
            setFormState({
                name: item.name,
                phone: item.phone,
                address: item.address,
                lat: String(item.lat),
                lng: String(item.lng),
                regionId: item.regionId,
                status: item.status,
            });
        }

        if (tab === "outlets") {
            const item = outlets.find((outlet) => outlet.id === id);
            if (!item) return;
            setFormState({
                distributorId: item.distributorId,
                name: item.name,
                address: item.address,
                lat: String(item.lat),
                lng: String(item.lng),
                status: item.status,
            });
        }

        setFormOpen(true);
    };

    const saveForm = () => {
        const nextId = editingId ?? `${formTab}-${Date.now()}`;
        if (formTab === "factories") {
            const payload: Factory = {
                id: nextId,
                name: formState.name,
                address: formState.address,
                lat: Number(formState.lat) || 0,
                lng: Number(formState.lng) || 0,
                status: formState.status as Factory["status"],
            };
            setFactories((prev) =>
                editingId ? prev.map((item) => (item.id === editingId ? payload : item)) : [payload, ...prev],
            );
        }

        if (formTab === "warehouses") {
            const payload: Warehouse = {
                id: nextId,
                name: formState.name,
                factoryId: formState.factoryId || undefined,
                capacityTon: Number(formState.capacityTon) || 0,
                address: formState.address,
                lat: Number(formState.lat) || 0,
                lng: Number(formState.lng) || 0,
                status: formState.status as Warehouse["status"],
            };
            setWarehouses((prev) =>
                editingId ? prev.map((item) => (item.id === editingId ? payload : item)) : [payload, ...prev],
            );
        }

        if (formTab === "distributors") {
            const payload: DistributorEntity = {
                id: nextId,
                name: formState.name,
                phone: formState.phone,
                address: formState.address,
                lat: Number(formState.lat) || 0,
                lng: Number(formState.lng) || 0,
                regionId: formState.regionId,
                status: formState.status as DistributorEntity["status"],
            };
            setDistributors((prev) =>
                editingId ? prev.map((item) => (item.id === editingId ? payload : item)) : [payload, ...prev],
            );
        }

        if (formTab === "outlets") {
            const payload: Outlet = {
                id: nextId,
                distributorId: formState.distributorId,
                name: formState.name,
                address: formState.address,
                lat: Number(formState.lat) || 0,
                lng: Number(formState.lng) || 0,
                status: formState.status as Outlet["status"],
            };
            setOutlets((prev) =>
                editingId ? prev.map((item) => (item.id === editingId ? payload : item)) : [payload, ...prev],
            );
        }
        setFormOpen(false);
    };

    const requestDelete = (tab: MasterTab, id: string, label: string) => {
        setConfirm({
            open: true,
            title: "Delete record",
            description: `Remove ${label} from master data?`,
            confirmLabel: "Delete",
            tone: "danger",
            onConfirm: () => {
                if (tab === "factories") setFactories((prev) => prev.filter((item) => item.id !== id));
                if (tab === "warehouses") setWarehouses((prev) => prev.filter((item) => item.id !== id));
                if (tab === "distributors") setDistributors((prev) => prev.filter((item) => item.id !== id));
                if (tab === "outlets") setOutlets((prev) => prev.filter((item) => item.id !== id));
                setConfirm(null);
            },
        });
    };

    const toggleStatus = (tab: MasterTab, id: string) => {
        const flip = (status: "ACTIVE" | "INACTIVE") => (status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
        if (tab === "factories") {
            setFactories((prev) =>
                prev.map((item) => (item.id === id ? { ...item, status: flip(item.status) } : item)),
            );
        }
        if (tab === "warehouses") {
            setWarehouses((prev) =>
                prev.map((item) => (item.id === id ? { ...item, status: flip(item.status) } : item)),
            );
        }
        if (tab === "distributors") {
            setDistributors((prev) =>
                prev.map((item) => (item.id === id ? { ...item, status: flip(item.status) } : item)),
            );
        }
        if (tab === "outlets") {
            setOutlets((prev) =>
                prev.map((item) => (item.id === id ? { ...item, status: flip(item.status) } : item)),
            );
        }
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="Master Data"
                description="Maintain core entities used across planning and operations."
                actions={
                    <Button size="sm" onClick={() => openForm(activeTab)}>
                        <Plus className="h-4 w-4" />
                        Add
                    </Button>
                }
            />

            <FiltersBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search records">
                <Select options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} />
            </FiltersBar>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MasterTab)}>
                <TabsList>
                    <TabsTrigger value="factories">Factories</TabsTrigger>
                    <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
                    <TabsTrigger value="distributors">Distributors</TabsTrigger>
                    <TabsTrigger value="outlets">Outlets</TabsTrigger>
                </TabsList>

                <TabsContent value="factories">
                    <DataTable
                        columns={[
                            { key: "name", label: "Factory" },
                            { key: "address", label: "Address" },
                            { key: "coordinates", label: "Lat / Lng" },
                            { key: "status", label: "Status" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredFactories.length}
                        emptyLabel="No factories available."
                    >
                        {filteredFactories.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.address}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">
                                    {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                                </td>
                                <td className="px-3 py-2">
                                    <Badge variant={item.status === "ACTIVE" ? "success" : "outline"}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("factories", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button size="xs" variant="ghost" onClick={() => toggleStatus("factories", item.id)}>
                                            <Power className="h-4 w-4" />
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
                            { key: "factory", label: "Factory" },
                            { key: "capacity", label: "Capacity (ton)" },
                            { key: "status", label: "Status" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredWarehouses.length}
                        emptyLabel="No warehouses available."
                    >
                        {filteredWarehouses.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">
                                    {factoryOptions.find((factory) => factory.value === item.factoryId)?.label ??
                                        "Unassigned"}
                                </td>
                                <td className="px-3 py-2">{item.capacityTon.toLocaleString()}</td>
                                <td className="px-3 py-2">
                                    <Badge variant={item.status === "ACTIVE" ? "success" : "outline"}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("warehouses", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => toggleStatus("warehouses", item.id)}
                                        >
                                            <Power className="h-4 w-4" />
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
                            { key: "contact", label: "Contact" },
                            { key: "region", label: "Region" },
                            { key: "status", label: "Status" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredDistributors.length}
                        emptyLabel="No distributors available."
                    >
                        {filteredDistributors.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.phone}</td>
                                <td className="px-3 py-2 capitalize">
                                    {REGION_OPTIONS.find((region) => region.value === item.regionId)?.label ??
                                        item.regionId}
                                </td>
                                <td className="px-3 py-2">
                                    <Badge variant={item.status === "ACTIVE" ? "success" : "outline"}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => openForm("distributors", item.id)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => toggleStatus("distributors", item.id)}
                                        >
                                            <Power className="h-4 w-4" />
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
                            { key: "name", label: "Outlet" },
                            { key: "distributor", label: "Distributor" },
                            { key: "address", label: "Address" },
                            { key: "status", label: "Status" },
                            { key: "actions", label: "Actions", className: "text-right" },
                        ]}
                        rowCount={filteredOutlets.length}
                        emptyLabel="No outlets available."
                    >
                        {filteredOutlets.map((item) => (
                            <tr key={item.id} className="border-b border-border">
                                <td className="px-3 py-2 font-medium">{item.name}</td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">
                                    {distributorOptions.find((dist) => dist.value === item.distributorId)?.label ??
                                        "Unknown"}
                                </td>
                                <td className="px-3 py-2 text-sm text-muted-foreground">{item.address}</td>
                                <td className="px-3 py-2">
                                    <Badge variant={item.status === "ACTIVE" ? "success" : "outline"}>
                                        {item.status}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="xs" variant="ghost" onClick={() => openForm("outlets", item.id)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button size="xs" variant="ghost" onClick={() => toggleStatus("outlets", item.id)}>
                                            <Power className="h-4 w-4" />
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
                title={`${editingId ? "Edit" : "Add"} ${formTab.replace("-", " ")}`}
                description="Update master data attributes."
                submitLabel={editingId ? "Save changes" : "Create record"}
                onSubmit={saveForm}
                onClose={() => setFormOpen(false)}
            >
                <Form className="space-y-3">
                    {formTab === "factories" ? (
                        <>
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.name}
                                        onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.address}
                                        onChange={(event) =>
                                            setFormState({ ...formState, address: event.target.value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lat}
                                            onChange={(event) => setFormState({ ...formState, lat: event.target.value })}
                                        />
                                    </FormControl>
                                </FormItem>
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lng}
                                            onChange={(event) => setFormState({ ...formState, lng: event.target.value })}
                                        />
                                    </FormControl>
                                </FormItem>
                            </div>
                        </>
                    ) : null}

                    {formTab === "warehouses" ? (
                        <>
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.name}
                                        onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Factory</FormLabel>
                                <FormControl>
                                    <Select
                                        options={[{ value: "", label: "Unassigned" }, ...factoryOptions]}
                                        value={formState.factoryId}
                                        onValueChange={(value) => setFormState({ ...formState, factoryId: value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Capacity (ton)</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.capacityTon}
                                        onChange={(event) =>
                                            setFormState({ ...formState, capacityTon: event.target.value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.address}
                                        onChange={(event) =>
                                            setFormState({ ...formState, address: event.target.value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lat}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lat: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lng}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lng: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                            </div>
                        </>
                    ) : null}

                    {formTab === "distributors" ? (
                        <>
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.name}
                                        onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.phone}
                                        onChange={(event) => setFormState({ ...formState, phone: event.target.value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Region</FormLabel>
                                <FormControl>
                                    <Select
                                        options={REGION_OPTIONS}
                                        value={formState.regionId}
                                        onValueChange={(value) => setFormState({ ...formState, regionId: value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.address}
                                        onChange={(event) =>
                                            setFormState({ ...formState, address: event.target.value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lat}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lat: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lng}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lng: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                            </div>
                        </>
                    ) : null}

                    {formTab === "outlets" ? (
                        <>
                            <FormItem>
                                <FormLabel>Distributor</FormLabel>
                                <FormControl>
                                    <Select
                                        options={distributorOptions}
                                        value={formState.distributorId}
                                        onValueChange={(value) =>
                                            setFormState({ ...formState, distributorId: value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Outlet name</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.name}
                                        onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                                    />
                                </FormControl>
                            </FormItem>
                            <FormItem>
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                    <Input
                                        value={formState.address}
                                        onChange={(event) =>
                                            setFormState({ ...formState, address: event.target.value })
                                        }
                                    />
                                </FormControl>
                            </FormItem>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lat}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lat: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            value={formState.lng}
                                            onChange={(event) =>
                                                setFormState({ ...formState, lng: event.target.value })
                                            }
                                        />
                                    </FormControl>
                                </FormItem>
                            </div>
                        </>
                    ) : null}

                    <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                            <Select
                                options={STATUS_OPTIONS.filter((item) => item.value !== "all")}
                                value={formState.status}
                                onValueChange={(value) => setFormState({ ...formState, status: value })}
                            />
                        </FormControl>
                    </FormItem>
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
        </div>
    );
}
