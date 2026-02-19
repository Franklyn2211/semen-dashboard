import { Badge } from "@/components/ui/badge";

type AdminPageHeaderProps = {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    meta?: React.ReactNode;
};

export function AdminPageHeader({ title, description, actions, meta }: AdminPageHeaderProps) {
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
                    {meta ?? <Badge variant="secondary">SuperAdmin</Badge>}
                    {actions}
                </div>
            </div>
        </div>
    );
}
