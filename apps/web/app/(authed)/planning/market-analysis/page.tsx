import { requireMe } from "@/lib/server/auth";
import { MarketAnalysisView } from "@/components/planning/market-analysis-view";

export default async function MarketAnalysisPage() {
    await requireMe(["ADMIN", "OPS", "EXEC"]);
    return <MarketAnalysisView />;
}
