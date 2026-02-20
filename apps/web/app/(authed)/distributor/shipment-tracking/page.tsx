import { requireMe } from "@/lib/server/auth";
import { DistributorShipmentTrackingClient, type DistributorShipmentItem } from "@/components/modules/distributor/shipment-tracking-client";
import { fetchAuthedJSON } from "@/lib/server/api";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);

    const initial = await fetchAuthedJSON<{ items?: DistributorShipmentItem[] }>("/api/distributor/shipments").catch(() => ({ items: [] }));
    return <DistributorShipmentTrackingClient initial={initial.items ?? []} />;
}
