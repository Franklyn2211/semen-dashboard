import { requireMe } from "@/lib/server/auth";
import { OpsOverviewClient } from "@/components/modules/operations/overview-client";

export default async function Page() {
    await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <OpsOverviewClient />;
}

