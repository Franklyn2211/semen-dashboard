import { requireMe } from "@/lib/server/auth";
import { ExecutiveClient } from "@/components/modules/executive/executive-client";

export default async function ExecutivePage() {
    await requireMe(["ADMIN", "EXEC"]);
    return <ExecutiveClient />;
}
