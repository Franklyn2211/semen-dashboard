import { requireMe } from "@/lib/server/auth";
import { LogisticsMapClient } from "@/components/modules/operations/logistics-map-client";

export default async function Page() {
    await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <LogisticsMapClient />;
}
