"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
    Circle,
    CircleMarker,
    MapContainer,
    Rectangle,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { useEffect, useMemo } from "react";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function BBoxWatcher({ onBBoxChange }: { onBBoxChange: (bbox: string) => void }) {
    const map = useMap();
    useEffect(() => {
        const emit = () => {
            const b = map.getBounds();
            onBBoxChange(
                `${b.getSouthWest().lat.toFixed(5)},${b.getSouthWest().lng.toFixed(
                    5,
                )},${b.getNorthEast().lat.toFixed(5)},${b.getNorthEast().lng.toFixed(5)}`,
            );
        };
        emit();
        map.on("moveend", emit);
        return () => {
            map.off("moveend", emit);
        };
    }, [map, onBBoxChange]);
    return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onClick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export default function PlanningMap({
    cells,
    whitespace,
    onBBoxChange,
    onMapClick,
    catchment,
}: {
    cells: {
        cellLat: number;
        cellLng: number;
        centerLat: number;
        centerLng: number;
        size: number;
        score: number;
    }[];
    whitespace: {
        cellLat: number;
        cellLng: number;
        size: number;
        score: number;
    }[];
    onBBoxChange: (bbox: string) => void;
    onMapClick: (lat: number, lng: number) => void;
    catchment:
    | {
        entity: { lat: number; lng: number; radiusKm: number };
        conflicts: unknown[];
    }
    | null;
}) {
    const center: [number, number] = [-6.25, 106.9];
    const maxScore = useMemo(() => Math.max(1, ...cells.map((c) => c.score)), [cells]);

    const catchmentCircle = catchment?.entity
        ? {
            center: [catchment.entity.lat, catchment.entity.lng] as [number, number],
            radiusM: Number(catchment.entity.radiusKm) * 1000,
        }
        : null;

    return (
        <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <BBoxWatcher onBBoxChange={onBBoxChange} />
            <ClickHandler onClick={onMapClick} />

            {cells.map((c, idx) => {
                const score = c.score;
                const t = Math.min(1, score / maxScore);
                const color = `rgba(255, 69, 0, ${0.1 + 0.6 * t})`;
                return (
                    <CircleMarker
                        key={idx}
                        center={[c.centerLat, c.centerLng]}
                        radius={10}
                        pathOptions={{ color: "transparent", fillColor: color, fillOpacity: 1 }}
                    />
                );
            })}

            {whitespace.map((a, idx) => {
                const size = a.size ?? 0.02;
                const bounds: [[number, number], [number, number]] = [
                    [a.cellLat, a.cellLng],
                    [a.cellLat + size, a.cellLng + size],
                ];
                return (
                    <Rectangle
                        key={idx}
                        bounds={bounds}
                        pathOptions={{ color: "#ef4444", weight: 1, fillOpacity: 0.08 }}
                    />
                );
            })}

            {catchmentCircle ? (
                <Circle
                    center={catchmentCircle.center}
                    radius={catchmentCircle.radiusM}
                    pathOptions={{ color: "#2563eb", weight: 2 }}
                />
            ) : null}
        </MapContainer>
    );
}
