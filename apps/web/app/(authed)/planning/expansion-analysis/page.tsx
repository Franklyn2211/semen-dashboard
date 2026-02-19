import { requireMe } from "@/lib/server/auth";
import { ExpansionAnalysisView } from "@/components/planning/expansion-analysis-view";

export default async function ExpansionAnalysisPage() {
    await requireMe(["ADMIN", "OPS", "EXEC"]);
    return <ExpansionAnalysisView />;
}
