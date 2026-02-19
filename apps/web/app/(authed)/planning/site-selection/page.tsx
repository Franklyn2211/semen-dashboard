import { requireMe } from "@/lib/server/auth";
import { SiteSelectionView } from "@/components/planning/site-selection-view";

export default async function SiteSelectionPage() {
    await requireMe(["ADMIN", "OPS", "EXEC"]);
    return <SiteSelectionView />;
}
