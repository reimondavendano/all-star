'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';

// Fix for default icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon for the picker
const pickerIcon = L.divIcon({
    className: 'custom-picker-icon',
    html: `
        <div style="
            background-color: #dc2626;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(220, 38, 38, 0.5);
            cursor: pointer;
        ">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
            </svg>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32], // Bottom center
    popupAnchor: [0, -32]
});

function LocationMarker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
    const map = useMapEvents({
        click(e) {
            setPosition([e.latlng.lat, e.latlng.lng]);
        },
    });

    return position === null ? null : (
        <Marker
            position={position}
            icon={pickerIcon}
            draggable={true}
            eventHandlers={{
                dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    setPosition([position.lat, position.lng]);
                },
            }}
        />
    );
}

function ChangeView({ center }: { center: [number, number] }) {
    const map = useMapEvents({});
    useEffect(() => {
        map.setView(center);
    }, [center, map]);
    return null;
}

interface MapPickerProps {
    center?: [number, number];
    zoom?: number;
    value?: { lat: number; lng: number } | null;
    onChange: (value: { lat: number; lng: number }) => void;
}

export default function MapPicker({ center = [14.3150, 121.0100], zoom = 13, value, onChange }: MapPickerProps) {
    const [position, setPosition] = useState<[number, number] | null>(
        value ? [value.lat, value.lng] : null
    );

    useEffect(() => {
        if (value) {
            setPosition([value.lat, value.lng]);
        }
    }, [value]);

    const handleSetPosition = (pos: [number, number]) => {
        setPosition(pos);
        onChange({ lat: pos[0], lng: pos[1] });
    };

    return (
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}>
            <ChangeView center={value ? [value.lat, value.lng] : center} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} setPosition={handleSetPosition} />
        </MapContainer>
    );
}
