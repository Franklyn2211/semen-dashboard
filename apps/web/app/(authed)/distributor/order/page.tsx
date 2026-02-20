import { requireMe } from "@/lib/server/auth";
import { DistributorOrderFormClient } from "@/components/modules/distributor/order-form-client";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);
    return <DistributorOrderFormClient />;
}
