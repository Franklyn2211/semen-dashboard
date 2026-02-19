"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";

export type PlanningFilters = {
    startDate: string;
    endDate: string;
    region: string;
    radiusKm: string;
};

export const DEFAULT_FILTERS: PlanningFilters = {
    startDate: "2025-08-01",
    endDate: "2026-01-31",
    region: "all",
    radiusKm: "20",
};

const DEFAULT_REGIONS: SelectOption[] = [
    { value: "all", label: "All regions" },
    { value: "jakarta", label: "Jakarta" },
    { value: "bekasi", label: "Bekasi" },
    { value: "tangerang", label: "Tangerang" },
    { value: "bogor", label: "Bogor" },
    { value: "depok", label: "Depok" },
];

const DEFAULT_RADII: SelectOption[] = [
    { value: "10", label: "10 km" },
    { value: "20", label: "20 km" },
    { value: "30", label: "30 km" },
];

type FiltersBarProps = {
    value: PlanningFilters;
    onChange: (value: PlanningFilters) => void;
    regions?: SelectOption[];
    radii?: SelectOption[];
    onApply?: () => void;
    onReset?: () => void;
};

export function FiltersBar({
    value,
    onChange,
    regions = DEFAULT_REGIONS,
    radii = DEFAULT_RADII,
    onApply,
    onReset,
}: FiltersBarProps) {
    const handleReset = () => {
        onChange(DEFAULT_FILTERS);
        onReset?.();
    };

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
            <Badge variant="outline">Filters</Badge>
            <div className="grid w-full max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Start date</div>
                    <Input
                        type="date"
                        value={value.startDate}
                        onChange={(event) => onChange({ ...value, startDate: event.target.value })}
                    />
                </div>
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">End date</div>
                    <Input
                        type="date"
                        value={value.endDate}
                        onChange={(event) => onChange({ ...value, endDate: event.target.value })}
                    />
                </div>
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Region</div>
                    <Select
                        options={regions}
                        value={value.region}
                        onValueChange={(next) => onChange({ ...value, region: next })}
                    />
                </div>
                <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Radius</div>
                    <Select
                        options={radii}
                        value={value.radiusKm}
                        onValueChange={(next) => onChange({ ...value, radiusKm: next })}
                    />
                </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                    Reset
                </Button>
                <Button size="sm" onClick={onApply}>
                    Apply
                </Button>
            </div>
        </div>
    );
}
