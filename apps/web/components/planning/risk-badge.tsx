import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "./types";

type RiskBadgeProps = {
    label: string;
    level: RiskLevel;
    detail?: string;
};

const LEVEL_VARIANTS: Record<RiskLevel, "success" | "warning" | "danger"> = {
    low: "success",
    medium: "warning",
    high: "danger",
};

const LEVEL_LABELS: Record<RiskLevel, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
};

export function RiskBadge({ label, level, detail }: RiskBadgeProps) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <div>
                <div className="text-sm font-medium">{label}</div>
                {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
            </div>
            <Badge variant={LEVEL_VARIANTS[level]}>{LEVEL_LABELS[level]}</Badge>
        </div>
    );
}
