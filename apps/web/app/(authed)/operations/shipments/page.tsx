import { requireMe } from "@/lib/server/auth";
import { ShipmentsClient } from "@/components/modules/operations/shipments-client";

export default async function Page() {
	const me = await requireMe(["OPERATOR", "SUPER_ADMIN", "MANAGEMENT"]);
	return <ShipmentsClient role={me.role} />;
}

