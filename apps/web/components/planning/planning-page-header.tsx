import { Badge } from "@/components/ui/badge";

type PlanningPageHeaderProps = {
    title: string;
    description?: string;
    meta?: React.ReactNode;
    children?: React.ReactNode;
};

export function PlanningPageHeader({ title, description, meta, children }: PlanningPageHeaderProps) {
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold">{title}</h1>
                    {description ? (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {meta ?? <Badge variant="secondary">Mock data</Badge>}
                </div>
            </div>
            {children}
        </div>
    );
}
