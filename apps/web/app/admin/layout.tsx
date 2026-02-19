import { AppShell } from "@/components/app-shell";
import { requireMe } from "@/lib/server/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const me = await requireMe(["SUPER_ADMIN"]);
    return <AppShell user={me}>{children}</AppShell>;
}
