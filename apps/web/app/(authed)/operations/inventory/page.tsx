import { requireMe } from "@/lib/server/auth";
import { InventoryClient } from "@/components/modules/operations/inventory-client";

export default async function Page() {
    const me = await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
    return <InventoryClient role={me.role} />;
}

