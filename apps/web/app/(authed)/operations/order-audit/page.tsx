import { requireMe } from "@/lib/server/auth";
import { OrderAuditClient } from "@/components/modules/operations/order-audit-client";

export default async function Page() {
    await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <OrderAuditClient />;
}

