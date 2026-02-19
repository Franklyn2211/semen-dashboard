import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
    return (
        <div className="w-full overflow-auto">
            <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
        </div>
    );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead className={cn("border-b border-border", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    return (
        <tr
            className={cn("border-b border-border hover:bg-muted/50", className)}
            {...props}
        />
    );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return (
        <th
            className={cn("px-3 py-2 text-left font-medium text-muted-foreground", className)}
            {...props}
        />
    );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={cn("px-3 py-2", className)} {...props} />;
}
