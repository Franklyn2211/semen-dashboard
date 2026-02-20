import { requireMe } from "@/lib/server/auth";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";
import { OpsOverviewClient } from "@/components/modules/operations/overview-client";

export default async function DashboardPage() {
    const me = await requireMe();
    if (me.role === "OPERATOR") {
        return <OpsOverviewClient />;
    }
    return <DashboardClient role={me.role} name={me.name} />;
}
