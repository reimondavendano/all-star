'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { BusinessUnit } from '@/types/businessUnit';
import { MapPin, Loader2, RefreshCw, Users, Wifi, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';

const Map = dynamic(() => import('@/components/admin/Map'), {
    ssr: false,
    loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-900/50 rounded-lg"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
});

const LOCATION_CENTERS: Record<string, [number, number]> = {
    'Bulihan': [14.8430, 120.8120],
    'Malanggam': [14.3367, 121.0633],
    'Default': [14.8430, 120.8120]
};

type PaymentStatus = 'all' | 'Paid' | 'Unpaid' | 'Partially Paid';

export default function LocationsContent() {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string>('all');
    const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<PaymentStatus>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: buData } = await supabase.from('business_units').select('*');
            setBusinessUnits(buData || []);

            // Fetch subscriptions with their latest invoice payment status
            const { data: subData } = await supabase
                .from('subscriptions')
                .select(`
                    *, 
                    customer:customers!subscriptions_subscriber_id_fkey(*), 
                    plan:plans(*), 
                    business_unit:business_units(*),
                    invoices(id, payment_status, due_date)
                `)
                .eq('active', true);

            // Process subscriptions to get latest payment status
            const processedSubs = (subData || []).map(sub => {
                // Get the latest invoice's payment status
                const invoices = sub.invoices || [];
                const sortedInvoices = invoices.sort((a: any, b: any) =>
                    new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
                );
                const latestInvoice = sortedInvoices[0];

                return {
                    ...sub,
                    latestPaymentStatus: latestInvoice?.payment_status || 'No Invoice',
                    unpaidCount: invoices.filter((inv: any) => inv.payment_status === 'Unpaid').length,
                    paidCount: invoices.filter((inv: any) => inv.payment_status === 'Paid').length
                };
            });

            setSubscriptions(processedSubs);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter subscriptions by business unit and payment status
    const filteredSubscriptions = useMemo(() => {
        let filtered = subscriptions;

        // Filter by business unit
        if (selectedUnit !== 'all') {
            filtered = filtered.filter(s => s.business_unit_id === selectedUnit);
        }

        // Filter by payment status
        if (selectedPaymentStatus !== 'all') {
            filtered = filtered.filter(s => s.latestPaymentStatus === selectedPaymentStatus);
        }

        return filtered;
    }, [subscriptions, selectedUnit, selectedPaymentStatus]);

    // Get counts for stats
    const statusCounts = useMemo(() => {
        let subs = selectedUnit === 'all' ? subscriptions : subscriptions.filter(s => s.business_unit_id === selectedUnit);
        return {
            paid: subs.filter(s => s.latestPaymentStatus === 'Paid').length,
            unpaid: subs.filter(s => s.latestPaymentStatus === 'Unpaid').length,
            partial: subs.filter(s => s.latestPaymentStatus === 'Partially Paid').length,
            noInvoice: subs.filter(s => s.latestPaymentStatus === 'No Invoice').length
        };
    }, [subscriptions, selectedUnit]);

    const markers = useMemo(() => {
        return filteredSubscriptions
            .filter(sub => sub['x-coordinates'] != null && sub['y-coordinates'] != null)
            .map(sub => ({
                id: sub.id,
                position: [sub['y-coordinates'], sub['x-coordinates']] as [number, number],
                title: sub.customer?.name || 'Unknown Customer',
                details: {
                    plan: sub.plan?.name || 'No Plan',
                    status: sub.active ? 'Active' : 'Inactive',
                    address: [sub.address, sub.barangay, sub.landmark].filter(Boolean).join(', '),
                    paymentStatus: sub.latestPaymentStatus || 'Unknown'
                },
                color: sub.latestPaymentStatus === 'Paid' ? 'green' :
                    sub.latestPaymentStatus === 'Partially Paid' ? 'orange' :
                        sub.latestPaymentStatus === 'Unpaid' ? 'red' : 'gray'
            }));
    }, [filteredSubscriptions]);

    const mapCenter = useMemo((): [number, number] => {
        if (selectedUnit === 'all') return LOCATION_CENTERS['Default'];
        const unit = businessUnits.find(u => u.id === selectedUnit);
        if (!unit) return LOCATION_CENTERS['Default'];
        const unitName = unit.name.toLowerCase();
        if (unitName.includes('bulihan') || unitName.includes('extension')) return LOCATION_CENTERS['Bulihan'];
        return LOCATION_CENTERS['Default'];
    }, [selectedUnit, businessUnits]);

    const mapZoom = selectedUnit === 'all' ? 12 : 14;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <MapPin className="w-6 h-6 text-purple-500" />
                            Locations Map
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">View customer locations across business units</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Stats Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/30 border border-purple-700/50">
                                <Users className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-medium text-purple-400">{markers.length} on map</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
                                <Wifi className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-400">{subscriptions.length} total active</span>
                            </div>
                        </div>

                        {/* Business Unit Filter */}
                        <select
                            value={selectedUnit}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                            className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                            <option value="all">All Business Units</option>
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.id}>{bu.name}</option>
                            ))}
                        </select>

                        {/* Payment Status Filter */}
                        <select
                            value={selectedPaymentStatus}
                            onChange={(e) => setSelectedPaymentStatus(e.target.value as PaymentStatus)}
                            className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                            <option value="all">All Status</option>
                            <option value="Paid">✓ Paid</option>
                            <option value="Unpaid">✗ Unpaid</option>
                            <option value="Partially Paid">◐ Partially Paid</option>
                        </select>

                        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Payment Status Summary Row */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-800">
                    <span className="text-xs text-gray-500 uppercase">Payment Status:</span>
                    <button
                        onClick={() => setSelectedPaymentStatus('all')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedPaymentStatus === 'all'
                                ? 'bg-purple-900/40 border border-purple-700/50 text-purple-400'
                                : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        All ({statusCounts.paid + statusCounts.unpaid + statusCounts.partial})
                    </button>
                    <button
                        onClick={() => setSelectedPaymentStatus('Paid')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedPaymentStatus === 'Paid'
                                ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-400'
                                : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Paid ({statusCounts.paid})
                    </button>
                    <button
                        onClick={() => setSelectedPaymentStatus('Unpaid')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedPaymentStatus === 'Unpaid'
                                ? 'bg-red-900/40 border border-red-700/50 text-red-400'
                                : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        Unpaid ({statusCounts.unpaid})
                    </button>
                    <button
                        onClick={() => setSelectedPaymentStatus('Partially Paid')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedPaymentStatus === 'Partially Paid'
                                ? 'bg-amber-900/40 border border-amber-700/50 text-amber-400'
                                : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-800'
                            }`}
                    >
                        <Clock className="w-3.5 h-3.5" />
                        Partial ({statusCounts.partial})
                    </button>
                </div>
            </div>

            {/* Map Container */}
            <div className="glass-card overflow-hidden">
                <div className="h-[calc(100vh-320px)] w-full relative">
                    {loading ? (
                        <div className="h-full w-full flex items-center justify-center bg-[#0a0a0a]">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                                </div>
                                <span className="text-gray-400 font-medium">Loading Map Data...</span>
                            </div>
                        </div>
                    ) : markers.length === 0 ? (
                        <div className="h-full w-full flex items-center justify-center bg-[#0a0a0a]">
                            <div className="text-center">
                                <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                                <p className="text-gray-400">No locations found matching your filters</p>
                                <p className="text-sm text-gray-500 mt-1">Try changing the business unit or payment status filter</p>
                            </div>
                        </div>
                    ) : (
                        <Map center={mapCenter} zoom={mapZoom} markers={markers} />
                    )}
                </div>
            </div>

            {/* Legend */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap items-center justify-center gap-6">
                    <span className="text-xs text-gray-500 uppercase">Map Legend:</span>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-sm text-gray-400">Paid</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-sm text-gray-400">Unpaid</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span className="text-sm text-gray-400">Partially Paid</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-500" />
                        <span className="text-sm text-gray-400">No Invoice</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
