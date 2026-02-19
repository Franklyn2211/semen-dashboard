"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer as LeafletMap, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function BBoxWatcher({ onBBoxChange }: { onBBoxChange?: (bbox: string) => void }) {
    const map = useMap();
    useEffect(() => {
        if (!onBBoxChange) return;
        const emit = () => {
            const bounds = map.getBounds();
            onBBoxChange(
                `${bounds.getSouthWest().lat.toFixed(5)},${bounds
                    .getSouthWest()
                    .lng.toFixed(5)},${bounds.getNorthEast().lat.toFixed(5)},${bounds
                    .getNorthEast()
                    .lng.toFixed(5)}`,
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

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(event) {
            onMapClick?.(event.latlng.lat, event.latlng.lng);
        },
    });
    return null;
}

type MapContainerProps = {
    center?: [number, number];
    zoom?: number;
    className?: string;
    children?: React.ReactNode;
    onMapClick?: (lat: number, lng: number) => void;
    onBBoxChange?: (bbox: string) => void;
};

export function MapContainer({
    center = [-6.25, 106.9],
    zoom = 10,
    className,
    children,
    onMapClick,
    onBBoxChange,
}: MapContainerProps) {
    return (
        <div className={cn("h-[520px] w-full overflow-hidden rounded-lg border border-border", className)}>
            <LeafletMap center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {onBBoxChange ? <BBoxWatcher onBBoxChange={onBBoxChange} /> : null}
                {onMapClick ? <ClickHandler onMapClick={onMapClick} /> : null}
                {children}
            </LeafletMap>
        </div>
    );
}
