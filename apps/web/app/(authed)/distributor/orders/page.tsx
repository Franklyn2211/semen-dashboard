import { requireMe } from "@/lib/server/auth";
import { DistributorOrdersClient, type DistributorOrderItem } from "@/components/modules/distributor/orders-client";
import { fetchAuthedJSON } from "@/lib/server/api";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);

    const initial = await fetchAuthedJSON<{ items?: DistributorOrderItem[] }>("/api/distributor/orders").catch(() => ({ items: [] }));
    return <DistributorOrdersClient initial={initial.items ?? []} />;
}
