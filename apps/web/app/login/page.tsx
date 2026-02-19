"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEMO_ACCOUNTS = [
    { email: "admin@cementops.local", password: "admin123", role: "ADMIN" },
    { email: "ops@cementops.local", password: "ops123", role: "OPS" },
    { email: "exec@cementops.local", password: "exec123", role: "EXEC" },
];

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("admin@cementops.local");
    const [password, setPassword] = useState("admin123");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => null)) as
                    | { error?: { message?: string } }
                    | null;
                setError(data?.error?.message ?? "Login failed");
                return;
            }
            router.push("/dashboard");
            router.refresh();
        } catch {
            setError("Network error");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
            <div className="w-full max-w-sm">
                {/* Logo + title */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-600/30">
                        C
                    </div>
                    <h1 className="text-2xl font-bold text-white">CementOps</h1>
                    <p className="mt-1 text-sm text-slate-400">Sign in to your dashboard</p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-sm">
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-300">Email</label>
                            <Input
                                type="email"
                                value={email}
                                autoComplete="email"
                                onChange={(e) => setEmail(e.target.value)}
                                className="border-white/15 bg-white/10 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-300">Password</label>
                            <Input
                                type="password"
                                value={password}
                                autoComplete="current-password"
                                onChange={(e) => setPassword(e.target.value)}
                                className="border-white/15 bg-white/10 text-white placeholder:text-slate-500 focus-visible:border-blue-500"
                            />
                        </div>

                        {error && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        <Button className="w-full" size="lg" disabled={busy}>
                            {busy ? "Signing in…" : "Sign in"}
                        </Button>
                    </form>

                    {/* Demo accounts */}
                    <div className="mt-5 space-y-2">
                        <p className="text-xs font-medium text-slate-500">Demo accounts</p>
                        <div className="flex gap-1.5 flex-wrap">
                            {DEMO_ACCOUNTS.map((a) => (
                                <button
                                    key={a.role}
                                    type="button"
                                    onClick={() => { setEmail(a.email); setPassword(a.password); setError(null); }}
                                    className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:border-blue-500/50 hover:text-white transition-colors"
                                >
                                    {a.role}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
