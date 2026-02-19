"use client";

import * as React from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function Dialog({ open, onClose, children }: DialogProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-lg">{children}</div>
        </div>
    );
}

export function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex items-center justify-between border-b border-border px-5 py-4",
                className,
            )}
            {...props}
        />
    );
}

export function DialogTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2
            className={cn("text-base font-semibold text-foreground", className)}
            {...props}
        />
    );
}

export function DialogBody({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("px-5 py-4 space-y-4", className)} {...props} />;
}

export function DialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex items-center justify-end gap-2 border-t border-border px-5 py-3",
                className,
            )}
            {...props}
        />
    );
}

export function DialogCard({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-xl border border-border bg-white shadow-lg overflow-hidden",
                className,
            )}
            {...props}
        />
    );
}
