import { cookies, headers } from "next/headers";

async function getBaseURL() {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
}

export async function fetchAuthedJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const base = await getBaseURL();
    const url = path.startsWith("http") ? path : `${base}${path}`;

    const res = await fetch(url, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            cookie: cookieHeader,
        },
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${path}: ${res.status}`);
    }

    return (await res.json()) as T;
}
