import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Me, Role } from "../types";

async function getBaseURL() {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
}

export async function getMe(): Promise<Me | null> {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader.includes("cementops_session=")) {
        return null;
    }

    const base = await getBaseURL();
    const url = `${base}/api/auth/me`;
    const res = await fetch(url, {
        method: "GET",
        headers: {
            cookie: cookieHeader,
        },
        cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: Me };
    return data.user;
}

export async function requireMe(roles?: Role[]): Promise<Me> {
    const me = await getMe();
    if (!me) {
        redirect("/login");
    }
    if (roles && roles.length > 0 && !roles.includes(me.role)) {
        redirect("/planning");
    }
    return me;
}
