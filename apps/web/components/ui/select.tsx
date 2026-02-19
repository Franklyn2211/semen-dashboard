import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
    options: SelectOption[];
    onValueChange?: (value: string) => void;
};

export function Select({ className, options, onValueChange, ...props }: SelectProps) {
    return (
        <select
            {...props}
            className={cn(
                "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:opacity-50",
                className,
            )}
            onChange={(event) => onValueChange?.(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
