'use client';

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';

// Fix for default icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create color-based icons for payment status
const createIcon = (color: string, bgColor: string, shadowColor: string) => L.divIcon({
    className: 'custom-marker-icon',
    html: `
        <div style="
            background-color: ${bgColor};
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px ${shadowColor};
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

// Pre-create icons for each color
const icons: Record<string, L.DivIcon> = {
    green: createIcon('green', '#10b981', 'rgba(16, 185, 129, 0.5)'),
    red: createIcon('red', '#ef4444', 'rgba(239, 68, 68, 0.5)'),
    orange: createIcon('orange', '#f59e0b', 'rgba(245, 158, 11, 0.5)'),
    gray: createIcon('gray', '#6b7280', 'rgba(107, 114, 128, 0.5)'),
    purple: createIcon('purple', '#8b5cf6', 'rgba(139, 92, 246, 0.5)')
};

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
        color?: string;
    }>;
}

export default function Map({ center, zoom, markers }: MapProps) {
    // Get payment status color and label
    const getPaymentStatusStyle = (status: string) => {
        switch (status) {
            case 'Paid':
                return { color: 'text-green-600', bg: 'bg-green-100', label: '✓ Paid' };
            case 'Unpaid':
                return { color: 'text-red-600', bg: 'bg-red-100', label: '✗ Unpaid' };
            case 'Partially Paid':
                return { color: 'text-amber-600', bg: 'bg-amber-100', label: '◐ Partial' };
            default:
                return { color: 'text-gray-600', bg: 'bg-gray-100', label: status || 'Unknown' };
        }
    };

    return (
        <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}>
            <ChangeView center={center} zoom={zoom} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((marker) => {
                const icon = icons[marker.color || 'purple'] || icons.purple;
                const paymentStyle = getPaymentStatusStyle(marker.details.paymentStatus);

                return (
                    <Marker key={marker.id} position={marker.position} icon={icon}>
                        <Tooltip direction="top" offset={[0, -40]} opacity={1} className="custom-tooltip">
                            <div className="p-2 min-w-[220px]">
                                <h3 className="font-bold text-gray-800 text-lg border-b border-gray-200 pb-1 mb-2">{marker.title}</h3>
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
                                    {marker.details.paymentStatus && (
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold">Payment:</span>
                                            <span className={`${paymentStyle.color} ${paymentStyle.bg} px-2 py-0.5 rounded-full text-xs font-bold`}>
                                                {paymentStyle.label}
                                            </span>
                                        </div>
                                    )}
                                    <div className="mt-2 text-xs text-gray-600 border-t pt-1">
                                        <p className="font-semibold">Address:</p>
                                        <p>{marker.details.address}</p>
                                    </div>
                                </div>
                            </div>
                        </Tooltip>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
