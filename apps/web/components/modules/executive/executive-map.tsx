"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

export default function ExecMap({ stores }: { stores: unknown }) {
    const typedStores = stores as {
        id: number;
        name: string;
        lat: number;
        lng: number;
        competitorSharePct: number;
    }[];
    const center: [number, number] = [-6.25, 106.9];

    return (
        <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {typedStores.map((s) => {
                const comp = Number(s.competitorSharePct ?? 0);
                const color = comp >= 60 ? "#dc2626" : comp >= 40 ? "#f59e0b" : "#16a34a";
                return (
                    <CircleMarker
                        key={s.id}
                        center={[s.lat, s.lng]}
                        radius={6}
                        pathOptions={{ color, fillOpacity: 0.7 }}
                    >
                        <Tooltip>
                            {s.name} — comp {comp.toFixed(0)}%
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
