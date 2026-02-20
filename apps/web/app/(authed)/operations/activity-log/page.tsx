import { requireMe } from "@/lib/server/auth";
import { ActivityLogClient } from "@/components/modules/operations/activity-log-client";

export default async function Page() {
    await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <ActivityLogClient />;
}
