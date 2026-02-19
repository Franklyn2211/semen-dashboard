import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
                className,
            )}
            style={{ boxShadow: "var(--shadow)" }}
            {...props}
        />
    );
}

export function CardHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex items-center justify-between border-b border-border px-5 py-3.5",
                className,
            )}
            {...props}
        />
    );
}

export function CardTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            className={cn("text-sm font-semibold text-foreground", className)}
            {...props}
        />
    );
}

export function CardContent({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("px-5 py-4", className)} {...props} />;
}
