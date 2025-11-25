'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { BusinessUnit } from '@/types/businessUnit';
import { Filter, Loader2 } from 'lucide-react';

const Map = dynamic(() => import('@/components/admin/Map'), {
    ssr: false,
    loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-900/50 rounded-lg"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>
});

// Center points for known locations (approximate)
const LOCATION_CENTERS: Record<string, [number, number]> = {
    'Bulihan': [14.8430, 120.8120], // Malolos, Bulacan
    'Malanggam': [14.3367, 121.0633],
    'Default': [14.8430, 120.8120] // Malolos, Bulacan
};

export default function LocationsContent() {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            // Fetch Business Units
            const { data: buData, error: buError } = await supabase
                .from('business_units')
                .select('*');

            if (buError) throw buError;
            setBusinessUnits(buData || []);

            // Fetch Subscriptions with relations
            const { data: subData, error: subError } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    customer:customers(*),
                    plan:plans(*),
                    business_unit:business_units(*)
                `)
                .eq('active', true);

            if (subError) throw subError;
            setSubscriptions(subData || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const markers = useMemo(() => {
        const filtered = selectedUnit === 'all'
            ? subscriptions
            : subscriptions.filter(s => s.business_unit_id === selectedUnit);

        return filtered
            .filter(sub => {
                // Only include subscriptions that have valid coordinates
                return sub['x-coordinates'] != null && sub['y-coordinates'] != null;
            })
            .map(sub => {
                return {
                    id: sub.id,
                    position: [sub['y-coordinates'], sub['x-coordinates']] as [number, number], // [lat, lng]
                    title: sub.customer?.name || 'Unknown Customer',
                    details: {
                        plan: sub.plan?.name || 'No Plan',
                        status: sub.active ? 'Active' : 'Inactive',
                        address: [sub.address, sub.barangay, sub.landmark].filter(Boolean).join(', ')
                    }
                };
            });
    }, [subscriptions, selectedUnit]);

    const mapCenter = useMemo((): [number, number] => {
        if (selectedUnit === 'all') return LOCATION_CENTERS['Default'];
        const unit = businessUnits.find(u => u.id === selectedUnit);
        if (!unit) return LOCATION_CENTERS['Default'];

        const unitName = unit.name.toLowerCase();
        if (unitName.includes('bulihan') || unitName.includes('extension')) {
            return LOCATION_CENTERS['Bulihan'];
        }
        if (unitName.includes('malanggam')) {
            return LOCATION_CENTERS['Default']; // Malolos for Malanggam
        }
        return LOCATION_CENTERS['Default'];
    }, [selectedUnit, businessUnits]);

    const mapZoom = selectedUnit === 'all' ? 12 : 14;

    return (
        <div className="p-6 space-y-6 min-h-screen bg-[#050505] text-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-white">
                        Locations Map
                    </h1>
                    <p className="text-gray-400 mt-1">
                        View customer locations and subscription details across business units
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-red-900/20 backdrop-blur-sm">
                    <Filter className="w-5 h-5 text-red-500" />
                    <select
                        value={selectedUnit}
                        onChange={(e) => setSelectedUnit(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-white min-w-[200px] outline-none cursor-pointer [&>option]:bg-black [&>option]:text-white"
                    >
                        <option value="all">All Business Units</option>
                        {businessUnits.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="h-[calc(100vh-200px)] w-full rounded-xl overflow-hidden border border-red-900/30 shadow-[0_0_20px_rgba(255,0,0,0.1)] relative group bg-[#1a1a1a]">
                <div className="absolute inset-0 bg-gradient-to-b from-red-900/5 to-transparent pointer-events-none z-10" />

                {loading ? (
                    <div className="h-full w-full flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                            <span className="text-red-400 font-medium">Loading Map Data...</span>
                        </div>
                    </div>
                ) : (
                    <Map center={mapCenter} zoom={mapZoom} markers={markers} />
                )}
            </div>
        </div>
    );
}
