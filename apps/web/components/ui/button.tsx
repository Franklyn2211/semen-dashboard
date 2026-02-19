import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "outline" | "ghost" | "danger" | "success";
    size?: "xs" | "sm" | "md" | "lg";
};

export function Button({
    className,
    variant = "default",
    size = "md",
    ...props
}: ButtonProps) {
    const base =
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none select-none";
    const variants: Record<string, string> = {
        default:
            "bg-primary text-white shadow-sm hover:bg-blue-700 active:scale-[0.98]",
        outline:
            "border border-border bg-white text-foreground shadow-sm hover:bg-muted active:scale-[0.98]",
        ghost: "text-foreground hover:bg-muted active:scale-[0.98]",
        danger:
            "bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.98]",
        success:
            "bg-green-600 text-white shadow-sm hover:bg-green-700 active:scale-[0.98]",
    };
    const sizes: Record<string, string> = {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-5 text-base",
    };
    return (
        <button
            className={cn(base, variants[variant], sizes[size], className)}
            {...props}
        />
    );
}
