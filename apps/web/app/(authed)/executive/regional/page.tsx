import { requireMe } from "@/lib/server/auth";
import { ExecutiveClient } from "@/components/modules/executive/executive-client";

export default async function ExecutiveRegionalPage() {
	await requireMe(["MANAGEMENT", "SUPER_ADMIN"]);
	return <ExecutiveClient mode="regional" />;
}
