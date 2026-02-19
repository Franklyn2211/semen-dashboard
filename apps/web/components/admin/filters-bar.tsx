import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type FiltersBarProps = {
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    children?: React.ReactNode;
    actions?: React.ReactNode;
    label?: string;
};

export function FiltersBar({
    searchValue,
    onSearchChange,
    searchPlaceholder = "Search...",
    children,
    actions,
    label = "Filters",
}: FiltersBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
            <Badge variant="outline">{label}</Badge>
            {onSearchChange ? (
                <div className="w-full max-w-xs">
                    <Input
                        value={searchValue ?? ""}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={searchPlaceholder}
                    />
                </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">{children}</div>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
    );
}
