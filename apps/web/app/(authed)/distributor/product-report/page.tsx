import { requireMe } from "@/lib/server/auth";
import { DistributorProductReportClient } from "@/components/modules/distributor/product-report-client";

export default async function Page() {
    await requireMe(["DISTRIBUTOR"]);
    return <DistributorProductReportClient />;
}
