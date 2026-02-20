import { requireMe } from "@/lib/server/auth";
import { redirect } from "next/navigation";

export default async function ManagementPage() {
    const me = await requireMe(["MANAGEMENT", "SUPER_ADMIN"]);
    if (me.role === "SUPER_ADMIN") {
        redirect("/admin/master-data");
    }
    redirect("/dashboard");
}
