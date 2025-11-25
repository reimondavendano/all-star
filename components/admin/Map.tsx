'use client';

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix for default icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon using DivIcon to avoid external image issues
const userIcon = L.divIcon({
    className: 'custom-marker-icon',
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
        ">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

// Component to update map center
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

interface MapProps {
    center: [number, number];
    zoom: number;
    markers: Array<{
        id: string;
        position: [number, number];
        title: string;
        details: any;
    }>;
}

export default function Map({ center, zoom, markers }: MapProps) {
    return (
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}>
            <ChangeView center={center} zoom={zoom} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((marker) => (
                <Marker key={marker.id} position={marker.position} icon={userIcon}>
                    <Tooltip direction="top" offset={[0, -40]} opacity={1} className="custom-tooltip">
                        <div className="p-2 min-w-[200px]">
                            <h3 className="font-bold text-red-600 text-lg border-b border-gray-200 pb-1 mb-2">{marker.title}</h3>
                            <div className="text-sm text-gray-800 space-y-1">
                                <div className="flex justify-between">
                                    <span className="font-semibold">Plan:</span>
                                    <span>{marker.details.plan}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold">Status:</span>
                                    <span className={marker.details.status === 'Active' ? 'text-green-600 font-bold' : 'text-red-600'}>
                                        {marker.details.status}
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-gray-600 border-t pt-1">
                                    <p className="font-semibold">Address:</p>
                                    <p>{marker.details.address}</p>
                                </div>
                            </div>
                        </div>
                    </Tooltip>
                </Marker>
            ))}
        </MapContainer>
    );
}
