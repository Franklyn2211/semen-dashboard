import { requireMe } from "@/lib/server/auth";
import { IssuesClient } from "@/components/modules/issues/issues-client";

export default async function Page() {
    await requireMe(["OPERATOR"]);
    return <IssuesClient />;
}
