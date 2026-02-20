"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    Bell,
    Boxes,
    ClipboardList,
    Database,
    Globe,
    LayoutDashboard,
    LineChart,
    LogOut,
    MapPin,
    Map,
    PanelLeft,
    PieChart,
    Route,
    ScrollText,
    ShieldCheck,
    Sliders,
    TrendingUp,
    Truck,
    Users,
} from "lucide-react";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = {
    href: string;
    label: string;
    icon: ReactNode;
};

type NavSection = {
    id: string;
    label: string;
    items: NavItem[];
};

const NAV_DASHBOARD: NavSection = {
    id: "dashboard",
    label: "Dashboard",
    items: [
        {
            href: "/dashboard",
            label: "Dashboard",
            icon: <LayoutDashboard className="h-4 w-4" />,
        },
    ],
};

const NAV_PLANNING: NavSection = {
    id: "planning",
    label: "Planning",
    items: [
        {
            href: "/planning/site-selection",
            label: "Site Selection",
            icon: <MapPin className="h-4 w-4" />,
        },
        {
            href: "/planning/expansion-analysis",
            label: "Expansion Analysis",
            icon: <Route className="h-4 w-4" />,
        },
        {
            href: "/planning/market-analysis",
            label: "Market Analysis",
            icon: <LineChart className="h-4 w-4" />,
        },
    ],
};

const NAV_OPERATIONS_ADMIN_MONITORING: NavSection = {
    id: "operations",
    label: "Operations",
    items: [
        {
            href: "/operations/global-overview",
            label: "Global Operations Overview",
            icon: <Globe className="h-4 w-4" />,
        },
        {
            href: "/operations/shipments",
            label: "All Shipments",
            icon: <Truck className="h-4 w-4" />,
        },
        {
            href: "/operations/inventory",
            label: "All Inventory",
            icon: <Boxes className="h-4 w-4" />,
        },
        {
            href: "/operations/order-audit",
            label: "Order Audit",
            icon: <ClipboardList className="h-4 w-4" />,
        },
        {
            href: "/operations/activity-log",
            label: "Activity & System Log",
            icon: <ScrollText className="h-4 w-4" />,
        },
    ],
};

const NAV_OPERATIONS_OPERATOR: NavSection = {
    id: "operations",
    label: "Operations",
    items: [
        {
            href: "/operations/inventory",
            label: "Inventory",
            icon: <Boxes className="h-4 w-4" />,
        },
        {
            href: "/operations/orders",
            label: "Order",
            icon: <ClipboardList className="h-4 w-4" />,
        },
        {
            href: "/operations/shipments",
            label: "Shipment",
            icon: <Truck className="h-4 w-4" />,
        },
        {
            href: "/operations/logistics-map",
            label: "Live Logistic",
            icon: <Map className="h-4 w-4" />,
        },
    ],
};

const NAV_ISSUES: NavSection = {
    id: "issues",
    label: "Issues",
    items: [
        {
            href: "/issues",
            label: "Issues",
            icon: <ScrollText className="h-4 w-4" />,
        },
    ],
};

const NAV_DISTRIBUTOR: NavSection = {
    id: "distributor",
    label: "Distributor",
    items: [
        {
            href: "/distributor/inventory",
            label: "My Inventory",
            icon: <Boxes className="h-4 w-4" />,
        },
        {
            href: "/distributor/order",
            label: "Order Semen",
            icon: <ClipboardList className="h-4 w-4" />,
        },
        {
            href: "/distributor/orders",
            label: "My Orders",
            icon: <ScrollText className="h-4 w-4" />,
        },
        {
            href: "/distributor/shipment-tracking",
            label: "Shipment Tracking",
            icon: <Truck className="h-4 w-4" />,
        },
        {
            href: "/distributor/transactions",
            label: "Transaction History",
            icon: <LineChart className="h-4 w-4" />,
        },
    ],
};

const NAV_EXECUTIVE: NavSection = {
    id: "executive",
    label: "Executive",
    items: [
        {
            href: "/executive/performance",
            label: "Performance Overview",
            icon: <TrendingUp className="h-4 w-4" />,
        },
        {
            href: "/executive/regional",
            label: "Regional Performance",
            icon: <Map className="h-4 w-4" />,
        },
        {
            href: "/executive/sales-summary",
            label: "Sales Summary",
            icon: <PieChart className="h-4 w-4" />,
        },
    ],
};

const NAV_ADMIN: NavSection = {
    id: "administration",
    label: "Administration",
    items: [
        {
            href: "/admin/users",
            label: "User Management",
            icon: <Users className="h-4 w-4" />,
        },
        {
            href: "/admin/rbac",
            label: "Role & Access Control",
            icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
            href: "/admin/master-data",
            label: "Master Data",
            icon: <Database className="h-4 w-4" />,
        },
        {
            href: "/admin/thresholds",
            label: "Threshold Settings",
            icon: <Sliders className="h-4 w-4" />,
        },
        {
            href: "/admin/alerts",
            label: "Alert Configuration",
            icon: <Bell className="h-4 w-4" />,
        },
        {
            href: "/admin/logs",
            label: "System Logs",
            icon: <ScrollText className="h-4 w-4" />,
        },
    ],
};

const ROLE_BADGE: Record<string, string> = {
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
    // undefined = loading, null = no config / failed to load (fail-open)
    const [sidebar, setSidebar] = useState<string[] | null | undefined>(undefined);

    useEffect(() => {
        setSidebar(undefined);
        let alive = true;
        fetch("/api/rbac/me")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!alive || !d) return;
                const config = (d as { config?: { sidebar?: string[] } }).config;
                if (Array.isArray(config?.sidebar)) {
                    setSidebar(config.sidebar);
                } else {
                    setSidebar(null);
                }
            })
            .catch(() => {
                // If RBAC endpoint is unavailable, fall back to showing all sections.
                if (alive) setSidebar(null);
            });
        return () => {
            alive = false;
        };
    }, [user.id]);

    const sections = useMemo(() => {
        if (sidebar === undefined) return [];

        const byRole: Record<string, NavSection[]> = {
            SUPER_ADMIN: [NAV_DASHBOARD, NAV_PLANNING, NAV_OPERATIONS_ADMIN_MONITORING, NAV_EXECUTIVE, NAV_ADMIN],
            MANAGEMENT: [NAV_DASHBOARD, NAV_PLANNING, NAV_OPERATIONS_ADMIN_MONITORING, NAV_EXECUTIVE],
            OPERATOR: [NAV_DASHBOARD, NAV_OPERATIONS_OPERATOR, NAV_ISSUES],
            DISTRIBUTOR: [NAV_DASHBOARD, NAV_DISTRIBUTOR],
        };
        const base = byRole[user.role] ?? [NAV_DASHBOARD];

        const allowed = Array.isArray(sidebar) ? new Set(sidebar) : null;
        return base.filter((section) => (allowed ? allowed.has(section.label) : true));
    }, [sidebar, user.role]);

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

            <nav className="flex-1 space-y-3 px-3 py-3">
                {sections.map((section) => (
                    <div key={section.id} className="space-y-1">
                        <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                            {section.label}
                        </div>
                        {section.items.map((item) => {
                            const active = pathname?.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                                        active
                                            ? "bg-blue-600 text-white font-medium"
                                            : "text-slate-300 hover:bg-white/10 hover:text-white",
                                    )}
                                >
                                    <span className="text-base leading-none text-slate-200">{item.icon}</span>
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                ))}
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
        <div className="flex min-h-dvh">
            <aside className="hidden w-64 shrink-0 md:block">
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
                        <PanelLeft className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation</span>
                    </button>
                    <div className="flex-1" />
                    <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                        <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                        {user.email}
                    </div>
                </header>

                <main className="min-w-0 flex-1 p-5">{children}</main>
            </div>
        </div>
    );
}
