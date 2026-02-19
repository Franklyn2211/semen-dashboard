import { requireMe } from "@/lib/server/auth";
import { PlanningClient } from "@/components/modules/planning/planning-client";

export default async function PlanningSitePage() {
    await requireMe(["ADMIN", "OPS", "EXEC"]);
    return <PlanningClient mode="site" />;
}
