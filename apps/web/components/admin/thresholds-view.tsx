"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DataTable } from "@/components/admin/data-table";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ThresholdSetting } from "@/lib/types/admin";

const MOCK_THRESHOLDS: ThresholdSetting[] = [
    {
        id: "thr-1",
        warehouseId: "wh-1",
        warehouseName: "Cikarang Warehouse",
        product: "Cement",
        minStock: 500,
        safetyStock: 800,
        warningLevel: 400,
        criticalLevel: 250,
        leadTimeDays: 3,
        updatedAt: "2026-02-15 09:20",
    },
    {
        id: "thr-2",
        warehouseId: "wh-2",
        warehouseName: "Priok Depot",
        product: "Cement",
        minStock: 420,
        safetyStock: 700,
        warningLevel: 350,
        criticalLevel: 220,
        leadTimeDays: 4,
        updatedAt: "2026-02-12 10:45",
    },
];

type FormState = {
    minStock: string;
    safetyStock: string;
    warningLevel: string;
    criticalLevel: string;
    leadTimeDays: string;
};

export function ThresholdsView() {
    const [thresholds, setThresholds] = useState<ThresholdSetting[]>(MOCK_THRESHOLDS);
    const [search, setSearch] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ThresholdSetting | null>(null);
    const [formState, setFormState] = useState<FormState>({
        minStock: "",
        safetyStock: "",
        warningLevel: "",
        criticalLevel: "",
        leadTimeDays: "",
    });
    const [formError, setFormError] = useState<string | null>(null);

    const filteredThresholds = useMemo(() => {
        return thresholds.filter((item) =>
            item.warehouseName.toLowerCase().includes(search.toLowerCase()),
        );
    }, [thresholds, search]);

    const openEdit = (item: ThresholdSetting) => {
        setEditing(item);
        setFormState({
            minStock: String(item.minStock),
            safetyStock: String(item.safetyStock),
            warningLevel: String(item.warningLevel),
            criticalLevel: String(item.criticalLevel),
            leadTimeDays: String(item.leadTimeDays),
        });
        setFormError(null);
        setFormOpen(true);
    };

    const saveThreshold = () => {
        const minStock = Number(formState.minStock);
        const safetyStock = Number(formState.safetyStock);
        const warningLevel = Number(formState.warningLevel);
        const criticalLevel = Number(formState.criticalLevel);

        if (criticalLevel > warningLevel || warningLevel > minStock || minStock > safetyStock) {
            setFormError("Ensure: Critical <= Warning <= Min <= Safety.");
            return;
        }

        if (!editing) return;
        const updated: ThresholdSetting = {
            ...editing,
            minStock,
            safetyStock,
            warningLevel,
            criticalLevel,
            leadTimeDays: Number(formState.leadTimeDays),
            updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        };
        setThresholds((prev) => prev.map((item) => (item.id === editing.id ? updated : item)));
        setFormOpen(false);
    };

    return (
        <div className="space-y-5">
            <AdminPageHeader
                title="Threshold Settings"
                description="Configure minimum and safety stock alert thresholds per warehouse."
            />

            <FiltersBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search warehouse"
            />

            <DataTable
                columns={[
                    { key: "warehouse", label: "Warehouse" },
                    { key: "product", label: "Product" },
                    { key: "min", label: "Min Stock" },
                    { key: "safety", label: "Safety Stock" },
                    { key: "warning", label: "Warning Level" },
                    { key: "critical", label: "Critical Level" },
                    { key: "lead", label: "Lead Time" },
                    { key: "updated", label: "Updated At" },
                    { key: "actions", label: "Actions", className: "text-right" },
                ]}
                rowCount={filteredThresholds.length}
                emptyLabel="No thresholds configured."
            >
                {filteredThresholds.map((item) => (
                    <tr key={item.id} className="border-b border-border">
                        <td className="px-3 py-2 font-medium">{item.warehouseName}</td>
                        <td className="px-3 py-2">
                            <Badge variant="secondary">{item.product}</Badge>
                        </td>
                        <td className="px-3 py-2">{item.minStock}</td>
                        <td className="px-3 py-2">{item.safetyStock}</td>
                        <td className="px-3 py-2">{item.warningLevel}</td>
                        <td className="px-3 py-2">{item.criticalLevel}</td>
                        <td className="px-3 py-2">{item.leadTimeDays} days</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{item.updatedAt}</td>
                        <td className="px-3 py-2">
                            <div className="flex items-center justify-end">
                                <Button size="xs" variant="ghost" onClick={() => openEdit(item)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                ))}
            </DataTable>

            <EntityFormDialog
                open={formOpen}
                title={`Edit thresholds - ${editing?.warehouseName ?? ""}`}
                description="Keep alert levels consistent across each tier."
                submitLabel="Save thresholds"
                onSubmit={saveThreshold}
                onClose={() => setFormOpen(false)}
            >
                <Form className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormItem>
                            <FormLabel>Min Stock</FormLabel>
                            <FormControl>
                                <Input
                                    value={formState.minStock}
                                    onChange={(event) =>
                                        setFormState({ ...formState, minStock: event.target.value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Safety Stock</FormLabel>
                            <FormControl>
                                <Input
                                    value={formState.safetyStock}
                                    onChange={(event) =>
                                        setFormState({ ...formState, safetyStock: event.target.value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Warning Level</FormLabel>
                            <FormControl>
                                <Input
                                    value={formState.warningLevel}
                                    onChange={(event) =>
                                        setFormState({ ...formState, warningLevel: event.target.value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                        <FormItem>
                            <FormLabel>Critical Level</FormLabel>
                            <FormControl>
                                <Input
                                    value={formState.criticalLevel}
                                    onChange={(event) =>
                                        setFormState({ ...formState, criticalLevel: event.target.value })
                                    }
                                />
                            </FormControl>
                        </FormItem>
                    </div>
                    <FormItem>
                        <FormLabel>Lead Time (days)</FormLabel>
                        <FormControl>
                            <Input
                                value={formState.leadTimeDays}
                                onChange={(event) =>
                                    setFormState({ ...formState, leadTimeDays: event.target.value })
                                }
                            />
                        </FormControl>
                    </FormItem>
                    {formError ? <FormMessage>{formError}</FormMessage> : null}
                </Form>
            </EntityFormDialog>
        </div>
    );
}
