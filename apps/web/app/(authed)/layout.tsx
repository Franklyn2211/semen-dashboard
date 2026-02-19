import { AppShell } from "@/components/app-shell";
import { requireMe } from "@/lib/server/auth";

export default async function AuthedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const me = await requireMe();
    return <AppShell user={me}>{children}</AppShell>;
}
