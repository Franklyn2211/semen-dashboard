"use client";

import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function OpsMap({
    logistics,
    shipment,
    shipmentLines,
    onSelectShipment,
    selectedShipmentId,
    showRoutes = true,
}: {
    logistics: unknown;
    shipment: unknown;
    shipmentLines?: {
        id: number;
        status: string;
        from: { lat: number; lng: number };
        to: { lat: number; lng: number };
    }[];
    onSelectShipment?: (id: number) => void;
    selectedShipmentId?: number | null;
    showRoutes?: boolean;
}) {
    const typed = logistics as
        | {
            plant?: { lat: number; lng: number };
            warehouses?: { id: number; lat: number; lng: number }[];
            distributors?: { id: number; lat: number; lng: number }[];
            routes?: { polyline: { lat: number; lng: number }[] }[];
        }
        | null;
    const center: [number, number] = [-6.25, 106.9];

    const routes = typed?.routes ?? [];
    const plant = typed?.plant;
    const warehouses = typed?.warehouses ?? [];
    const distributors = typed?.distributors ?? [];

    const truckPos = (() => {
        if (!shipment || typeof shipment !== "object") return null;
        const s = shipment as { truck?: { lastLat?: number | null; lastLng?: number | null } };
        if (s.truck?.lastLat == null || s.truck?.lastLng == null) return null;
        return [s.truck.lastLat, s.truck.lastLng] as [number, number];
    })();

    const lineColor = (status: string) => {
        if (status === "SCHEDULED") return "#9ca3af";
        if (status === "ON_DELIVERY") return "#2563eb";
        if (status === "DELAYED") return "#f59e0b";
        return "#94a3b8";
    };

    return (
        <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {plant ? <Marker position={[plant.lat, plant.lng]} /> : null}
            {warehouses.map((w) => (
                <CircleMarker key={`w-${w.id}`} center={[w.lat, w.lng]} radius={8} pathOptions={{ color: "#2563eb" }} />
            ))}
            {distributors.map((d) => (
                <CircleMarker key={`d-${d.id}`} center={[d.lat, d.lng]} radius={6} pathOptions={{ color: "#16a34a" }} />
            ))}
            {showRoutes && routes.map((r, idx: number) => (
                <Polyline
                    key={idx}
                    positions={r.polyline.map((p) => [p.lat, p.lng])}
                    pathOptions={{ color: "#a1a1aa", weight: 2 }}
                />
            ))}
            {(shipmentLines ?? []).map((line) => (
                <Polyline
                    key={`shipment-${line.id}`}
                    positions={[
                        [line.from.lat, line.from.lng],
                        [line.to.lat, line.to.lng],
                    ]}
                    pathOptions={{
                        color: lineColor(line.status),
                        weight: selectedShipmentId === line.id ? 5 : 3,
                        opacity: 0.9,
                    }}
                    eventHandlers={
                        onSelectShipment
                            ? {
                                click: () => onSelectShipment(line.id),
                            }
                            : undefined
                    }
                />
            ))}
            {truckPos ? <Marker position={truckPos} /> : null}
        </MapContainer>
    );
}
