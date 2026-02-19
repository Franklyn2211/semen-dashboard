import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
    label: string;
    value: string | number;
    helper?: string;
    tone?: "neutral" | "positive" | "negative" | "warning";
};

export function MetricCard({ label, value, helper, tone = "neutral" }: MetricCardProps) {
    const toneClass = {
        neutral: "text-foreground",
        positive: "text-emerald-600",
        negative: "text-red-600",
        warning: "text-amber-600",
    }[tone];

    return (
        <Card className="shadow-sm">
            <CardContent className="space-y-1 p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className={cn("text-lg font-semibold", toneClass)}>{value}</div>
                {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
            </CardContent>
        </Card>
    );
}
