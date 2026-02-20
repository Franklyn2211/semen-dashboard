import { requireMe } from "@/lib/server/auth";
import { OrdersManagementClient } from "@/components/modules/operations/orders-management-client";

export default async function Page() {
    await requireMe(["OPERATOR"]);
    return <OrdersManagementClient />;
}
