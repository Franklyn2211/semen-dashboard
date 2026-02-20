import { requireMe } from "@/lib/server/auth";
import { DistributorTransactionsClient, type DistributorTxItem } from "@/components/modules/distributor/transactions-client";
import { fetchAuthedJSON } from "@/lib/server/api";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);

    const initial = await fetchAuthedJSON<{ items?: DistributorTxItem[] }>("/api/distributor/transactions").catch(() => ({ items: [] }));
    return <DistributorTransactionsClient initial={initial.items ?? []} />;
}
