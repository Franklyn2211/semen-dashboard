"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type LogisticsMap = {
	warehouses: { id: number; name: string }[];
};

type Movement = {
	ts: string;
	movementType: string;
	quantityTons: number;
	reason: string;
};

type Thresholds = {
	minStock: number | null;
	safetyStock: number | null;
	warningLevel: number | null;
	criticalLevel: number | null;
	leadTimeDays: number | null;
};

type InventoryRow = {
	warehouseId: number;
	warehouseName: string;
	cementType: string;
	quantityTons: number;
	updatedAt: string;
	status: "OK" | "WARNING" | "CRITICAL" | string;
	thresholds?: Thresholds;
	recentMovements?: Movement[];
};

function formatThresholdValue(value: number | null | undefined) {
	if (value === null || value === undefined) return "—";
	return Number(value).toLocaleString("id");
}

function statusBadge(s: string) {
	if (s === "CRITICAL") return <Badge variant="danger">CRITICAL</Badge>;
	if (s === "WARNING") return <Badge variant="warning">WARNING</Badge>;
	if (s === "OK") return <Badge variant="success">OK</Badge>;
	return <Badge variant="secondary">{s}</Badge>;
}

export function InventoryClient({ role }: { role: string }) {
	const [items, setItems] = useState<InventoryRow[]>([]);
	const [logistics, setLogistics] = useState<LogisticsMap | null>(null);
	const canAdjust = role === "OPERATOR";

	const [adjustWarehouseId, setAdjustWarehouseId] = useState<string>("");
	const [adjustCementType, setAdjustCementType] = useState<string>("");
	const [adjustDelta, setAdjustDelta] = useState<string>("");
	const [adjustReason, setAdjustReason] = useState<string>("");
	const [adjustBusy, setAdjustBusy] = useState(false);
	const [adjustError, setAdjustError] = useState<string | null>(null);

	async function refresh() {
		try {
			const r = await fetch("/api/ops/inventory");
			const d = await r.json();
			setItems((d.items ?? []) as InventoryRow[]);
		} catch {
			setItems([]);
		}
	}

	useEffect(() => {
		refresh();
	}, []);

	useEffect(() => {
		fetch("/api/ops/logistics/map")
			.then((r) => r.json())
			.then((d) => setLogistics(d as LogisticsMap))
			.catch(() => setLogistics(null));
	}, []);

	const cementOptions: SelectOption[] = useMemo(() => {
		const set = new Set<string>();
		for (const it of items) {
			if (it.cementType) set.add(it.cementType);
		}
		const opts: SelectOption[] = [{ value: "", label: "Select cement type", disabled: true }];
		for (const ct of Array.from(set).sort()) {
			opts.push({ value: ct, label: ct });
		}
		return opts;
	}, [items]);

	const warehouseOptions: SelectOption[] = useMemo(() => {
		const opts: SelectOption[] = [{ value: "", label: "Select warehouse", disabled: true }];
		for (const w of logistics?.warehouses ?? []) {
			opts.push({ value: String(w.id), label: `${w.name} (#${w.id})` });
		}
		return opts;
	}, [logistics]);

	async function submitAdjust() {
		if (!canAdjust) return;
		setAdjustBusy(true);
		setAdjustError(null);
		try {
			const warehouseId = Number(adjustWarehouseId);
			const deltaTons = Number(adjustDelta);
			if (!warehouseId || !adjustCementType || !deltaTons) {
				setAdjustError("warehouse, cement type, and delta required");
				return;
			}
			const res = await fetch("/api/ops/inventory/adjust", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					warehouseId,
					cementType: adjustCementType,
					deltaTons,
					reason: adjustReason,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
				setAdjustError(body?.error?.message ?? "Failed to adjust stock");
				return;
			}
			await refresh();
			setAdjustDelta("");
			setAdjustReason("");
		} finally {
			setAdjustBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="All Inventory"
				description="Stok seluruh gudang + ringkasan movement terbaru."
			/>

			<Card>
				<CardHeader>
					<CardTitle>Inventory</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
						<div className="text-sm font-medium">Stock Adjustment (limited)</div>
						{!canAdjust ? (
							<div className="mt-1 text-xs text-muted-foreground">Read-only mode for {role}. Stock adjustments are OPERATOR-only.</div>
						) : null}
						<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
							<Select options={warehouseOptions} value={adjustWarehouseId} onValueChange={setAdjustWarehouseId} disabled={!canAdjust} />
							<Select options={cementOptions} value={adjustCementType} onValueChange={setAdjustCementType} disabled={!canAdjust} />
							<Input
								type="number"
								placeholder="Delta tons (e.g. 50 or -20)"
								value={adjustDelta}
								onChange={(e) => setAdjustDelta(e.target.value)}
								disabled={!canAdjust}
							/>
							<Input
								placeholder="Reason"
								value={adjustReason}
								onChange={(e) => setAdjustReason(e.target.value)}
								disabled={!canAdjust}
							/>
						</div>
						<div className="mt-2 flex items-center gap-2">
							<Button size="sm" variant="outline" disabled={!canAdjust || adjustBusy} onClick={submitAdjust}>
								Apply
							</Button>
							{adjustError ? <div className="text-xs text-red-600">{adjustError}</div> : null}
						</div>
					</div>

					<Table>
						<THead>
							<TR>
								<TH>Warehouse</TH>
								<TH>Cement</TH>
								<TH className="text-right">Qty (ton)</TH>
								<TH className="text-right">Thresholds</TH>
								<TH>Status</TH>
								<TH>Updated</TH>
								<TH>Recent Movements</TH>
							</TR>
						</THead>
						<TBody>
							{items.map((r) => {
								const movements = (r.recentMovements ?? []).slice(0, 3);
								return (
									<TR key={`${r.warehouseId}:${r.cementType}`}>
										<TD className="font-medium">{r.warehouseName}</TD>
										<TD>
											<Badge variant="secondary">{r.cementType}</Badge>
										</TD>
										<TD className="text-right font-mono font-semibold">{Number(r.quantityTons).toLocaleString("id")}</TD>
										<TD className="text-right text-xs text-muted-foreground">
											<div>
												<span className="font-medium text-foreground">Min</span>: {formatThresholdValue(r.thresholds?.minStock)}
											</div>
											<div>
												<span className="font-medium text-foreground">Safety</span>: {formatThresholdValue(r.thresholds?.safetyStock)}
											</div>
											<div>
												<span className="font-medium text-foreground">Warn</span>: {formatThresholdValue(r.thresholds?.warningLevel)}
												<span className="text-muted-foreground"> · </span>
												<span className="font-medium text-foreground">Crit</span>: {formatThresholdValue(r.thresholds?.criticalLevel)}
											</div>
											<div>
												<span className="font-medium text-foreground">Lead</span>: {r.thresholds?.leadTimeDays == null ? "—" : `${r.thresholds.leadTimeDays}d`}
											</div>
										</TD>
										<TD>{statusBadge(r.status)}</TD>
										<TD className="text-xs">{r.updatedAt ? new Date(r.updatedAt).toLocaleString("id-ID") : "—"}</TD>
										<TD className="text-xs text-muted-foreground">
											{movements.length > 0 ? (
												<div className="space-y-1">
													{movements.map((m, idx) => (
														<div key={`${m.ts}:${m.movementType}:${m.quantityTons}:${idx}`}>
															{m.movementType} {Number(m.quantityTons).toLocaleString("id")}t
														</div>
													))}
												</div>
											) : (
												"—"
											)}
										</TD>
									</TR>
								);
							})}
							{items.length === 0 ? (
								<TR>
									<TD colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
										Tidak ada data.
									</TD>
								</TR>
							) : null}
						</TBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

