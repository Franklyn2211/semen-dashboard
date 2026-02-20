import { requirePermission } from "@/lib/server/auth";
import { PlanningClient } from "@/components/modules/planning/planning-client";

export default async function MarketAnalysisPage() {
    await requirePermission("Planning", "view");
    return <PlanningClient mode="market" />;
}
