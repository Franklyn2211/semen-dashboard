import { requireMe } from "@/lib/server/auth";
import { OperationsClient } from "@/components/modules/operations/operations-client";

export default async function OperationsPage() {
    await requireMe(["OPERATOR"]);
    return <OperationsClient />;
}
