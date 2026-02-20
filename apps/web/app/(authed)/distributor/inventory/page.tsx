import { requireMe } from "@/lib/server/auth";
import { DistributorInventoryClient, type DistributorInventoryResponse } from "@/components/modules/distributor/inventory-client";
import { fetchAuthedJSON } from "@/lib/server/api";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);

    const initial = await fetchAuthedJSON<DistributorInventoryResponse>("/api/distributor/inventory").catch(() => null);
    return <DistributorInventoryClient initial={initial} />;
}
