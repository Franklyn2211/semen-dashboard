import { requireMe } from "@/lib/server/auth";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";

export default async function DashboardPage() {
    const me = await requireMe();
    return <DashboardClient role={me.role} name={me.name} />;
}
