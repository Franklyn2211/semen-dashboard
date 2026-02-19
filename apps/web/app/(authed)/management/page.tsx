import { requireMe } from "@/lib/server/auth";
import { ManagementClient } from "@/components/modules/management/management-client";

export default async function ManagementPage() {
    await requireMe(["ADMIN"]);
    return <ManagementClient />;
}
