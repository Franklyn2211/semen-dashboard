"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
    value: string;
    setValue: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    children: React.ReactNode;
};

export function Tabs({ defaultValue, value: valueProp, onValueChange, className, children }: TabsProps) {
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
    const isControlled = valueProp !== undefined;
    const value = isControlled ? (valueProp as string) : internalValue;

    const setValue = React.useCallback(
        (next: string) => {
            if (!isControlled) setInternalValue(next);
            onValueChange?.(next);
        },
        [isControlled, onValueChange],
    );

    return (
        <TabsContext.Provider value={{ value, setValue }}>
            <div className={cn("space-y-3", className)}>{children}</div>
        </TabsContext.Provider>
    );
}

type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

export function TabsList({ className, ...props }: TabsListProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1 text-sm",
                className,
            )}
            {...props}
        />
    );
}

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string };

export function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
    const ctx = React.useContext(TabsContext);
    if (!ctx) return null;
    const active = ctx.value === value;

    return (
        <button
            type="button"
            className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                className,
            )}
            onClick={() => ctx.setValue(value)}
            {...props}
        />
    );
}

type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & { value: string };

export function TabsContent({ className, value, ...props }: TabsContentProps) {
    const ctx = React.useContext(TabsContext);
    if (!ctx || ctx.value !== value) return null;
    return <div className={cn("space-y-3", className)} {...props} />;
}
