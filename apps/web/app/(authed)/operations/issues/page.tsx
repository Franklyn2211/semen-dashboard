import { requireMe } from "@/lib/server/auth";
import { OpsIssuesClient } from "@/components/modules/operations/issues-client";

export default async function Page() {
    const me = await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <OpsIssuesClient role={me.role} />;
}
