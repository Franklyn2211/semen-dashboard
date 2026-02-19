import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
    variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
    const base =
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
    const variants: Record<string, string> = {
        default: "bg-blue-50 text-blue-700 ring-blue-200",
        secondary: "bg-slate-100 text-slate-700 ring-slate-200",
        outline: "bg-transparent text-foreground ring-border",
        success: "bg-green-50 text-green-700 ring-green-200",
        warning: "bg-amber-50 text-amber-700 ring-amber-200",
        danger: "bg-red-50 text-red-700 ring-red-200",
    };
    return <span className={cn(base, variants[variant], className)} {...props} />;
}
