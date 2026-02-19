"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    Bell,
    BarChart3,
    Database,
    LayoutDashboard,
    LineChart,
    LogOut,
    MapPin,
    Menu,
    Route,
    ScrollText,
    Settings,
    ShieldCheck,
    Sliders,
    Truck,
    Users,
} from "lucide-react";
import type { Me } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
    href: string;
    label: string;
    icon: ReactNode;
    roles: Me["role"][];
};

const NAV: NavItem[] = [
    {
        href: "/dashboard",
        label: "Dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
        roles: ["ADMIN", "OPS", "EXEC", "SUPER_ADMIN"],
    },
    {
        href: "/planning/site-selection",
        label: "Site Selection",
        icon: <MapPin className="h-4 w-4" />,
        roles: ["ADMIN", "OPS", "EXEC"],
    },
    {
        href: "/planning/expansion-analysis",
        label: "Expansion Analysis",
        icon: <Route className="h-4 w-4" />,
        roles: ["ADMIN", "OPS", "EXEC"],
    },
    {
        href: "/planning/market-analysis",
        label: "Market Analysis",
        icon: <LineChart className="h-4 w-4" />,
        roles: ["ADMIN", "OPS", "EXEC"],
    },
    {
        href: "/admin/users",
        label: "User Management",
        icon: <Users className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/rbac",
        label: "Role & Access Control",
        icon: <ShieldCheck className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/master-data",
        label: "Master Data",
        icon: <Database className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/thresholds",
        label: "Threshold Settings",
        icon: <Sliders className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/alerts",
        label: "Alert Configuration",
        icon: <Bell className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/logs",
        label: "System Logs",
        icon: <ScrollText className="h-4 w-4" />,
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/operations",
        label: "Operations",
        icon: <Truck className="h-4 w-4" />,
        roles: ["ADMIN", "OPS"],
    },
    {
        href: "/executive",
        label: "Executive",
        icon: <BarChart3 className="h-4 w-4" />,
        roles: ["ADMIN", "EXEC"],
    },
    {
        href: "/management",
        label: "Management",
        icon: <Settings className="h-4 w-4" />,
        roles: ["ADMIN"],
    },
];

const ROLE_BADGE: Record<string, string> = {
    ADMIN: "bg-blue-500/20 text-blue-200",
    OPS: "bg-green-500/20 text-green-200",
    EXEC: "bg-purple-500/20 text-purple-200",
    SUPER_ADMIN: "bg-amber-500/20 text-amber-200",
    MANAGEMENT: "bg-slate-500/20 text-slate-200",
    OPERATOR: "bg-emerald-500/20 text-emerald-200",
    DISTRIBUTOR: "bg-indigo-500/20 text-indigo-200",
};

export function AppShell({ user, children }: { user: Me; children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const items = useMemo(
        () => NAV.filter((n) => n.roles.includes(user.role)),
        [user.role],
    );

    const dashboardItems = useMemo(() => items.filter((i) => i.href === "/dashboard"), [items]);
    const planningItems = useMemo(() => items.filter((i) => i.href.startsWith("/planning/")), [items]);
    const adminItems = useMemo(() => items.filter((i) => i.href.startsWith("/admin/")), [items]);
    const otherItems = useMemo(
        () =>
            items.filter(
                (i) =>
                    i.href !== "/dashboard" &&
                    !i.href.startsWith("/planning/") &&
                    !i.href.startsWith("/admin/"),
            ),
        [items],
    );

    async function logout() {
        setBusy(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            router.push("/login");
            router.refresh();
            setBusy(false);
        }
    }

    const SidebarContent = () => (
        <div className="flex h-full flex-col" style={{ background: "var(--sidebar-bg)" }}>
            <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
                    C
                </div>
                <div>
                    <div className="text-sm font-semibold text-white">CementOps</div>
                    <div className="text-xs text-slate-400">Dashboard</div>
                </div>
            </div>

            <nav className="flex-1 space-y-0.5 px-3 py-3">
                {[...dashboardItems, ...planningItems, ...adminItems, ...otherItems].map((n, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showPlanningHeader =
                        n.href.startsWith("/planning/") && (!prev || !prev.href.startsWith("/planning/"));
                    const showAdminHeader =
                        n.href.startsWith("/admin/") && (!prev || !prev.href.startsWith("/admin/"));
                    const showOtherHeader =
                        !n.href.startsWith("/planning/") &&
                        !n.href.startsWith("/admin/") &&
                        n.href !== "/dashboard" &&
                        (!prev ||
                            prev.href.startsWith("/planning/") ||
                            prev.href.startsWith("/admin/") ||
                            prev.href === "/dashboard");
                    const active = pathname?.startsWith(n.href);

                    return (
                        <div key={n.href} className="space-y-1">
                            {showPlanningHeader ? (
                                <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                                    Planning
                                </div>
                            ) : null}

                            {showAdminHeader ? (
                                <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                                    Administration
                                </div>
                            ) : null}

                            {showOtherHeader ? (
                                <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                                    Modules
                                </div>
                            ) : null}

                            <Link
                                href={n.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                                    active
                                        ? "bg-blue-600 text-white font-medium"
                                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                <span className="text-base leading-none text-slate-200">{n.icon}</span>
                                {n.label}
                            </Link>
                        </div>
                    );
                })}
            </nav>

            <div className="border-t border-white/10 px-4 py-3">
                <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        {user.name?.charAt(0).toUpperCase() ?? "U"}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-white">{user.name}</div>
                        <div className="truncate text-xs text-slate-400">{user.email}</div>
                    </div>
                    <span
                        className={cn(
                            "ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                            ROLE_BADGE[user.role] ?? "bg-white/10 text-white",
                        )}
                    >
                        {user.role}
                    </span>
                </div>
                <button
                    onClick={logout}
                    disabled={busy}
                    className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                    <LogOut className="h-4 w-4" />
                    {busy ? "Signing out..." : "Sign out"}
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <aside className="hidden w-64 shrink-0 md:flex md:flex-col">
                <SidebarContent />
            </aside>

            {mobileOpen && (
                <>
                    <div
                        className="fixed inset-0 z-30 bg-black/50 md:hidden"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="fixed inset-y-0 left-0 z-40 w-64 md:hidden">
                        <SidebarContent />
                    </aside>
                </>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 items-center gap-3 border-b border-border bg-white px-4 shadow-sm">
                    <button
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
                        onClick={() => setMobileOpen((v) => !v)}
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="flex-1" />
                    <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                        <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                        {user.email}
                    </div>
                    <Button variant="outline" size="sm" onClick={logout} disabled={busy}>
                        <LogOut className="h-4 w-4" />
                        Sign out
                    </Button>
                </header>

                <main className="min-w-0 flex-1 p-5">{children}</main>
            </div>
        </div>
    );
}
