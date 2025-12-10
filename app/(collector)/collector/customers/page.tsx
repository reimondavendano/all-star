'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Users,
    Search,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    User,
    Wifi,
    Calendar,
    Phone,
    MapPin,
    RefreshCw,
    Building2,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { BalanceInline } from '@/components/BalanceDisplay';
import { useMultipleRealtimeSubscriptions } from '@/hooks/useRealtimeSubscription';

interface Customer {
    id: string;
    name: string;
    mobile_number: string;
    created_at: string;
}

interface Subscription {
    id: string;
    active: boolean;
    address: string;
    barangay: string;
    balance: number;
    date_installed: string;
    plan: { name: string; monthly_fee: number };
    business_unit: { name: string };
}

interface CustomerWithSubs extends Customer {
    subscriptions: Subscription[];
}

export default function CollectorCustomersPage() {
    const [customers, setCustomers] = useState<CustomerWithSubs[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        fetchBusinessUnits();
        fetchCustomers();
    }, [selectedBusinessUnit]);

    // Real-time subscriptions for customer data
    useMultipleRealtimeSubscriptions(
        ['customers', 'subscriptions'],
        (table, payload) => {
            console.log(`[Collector Customers Realtime] ${table} changed:`, payload.eventType);
            fetchCustomers();
        }
    );

    const fetchBusinessUnits = async () => {
        const { data } = await supabase.from('business_units').select('id, name').order('name');
        setBusinessUnits(data || []);
    };

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            // Fetch all customers with their subscriptions
            let query = supabase
                .from('customers')
                .select(`
                    id, name, mobile_number, created_at,
                    subscriptions (
                        id, active, address, barangay, balance, date_installed, business_unit_id,
                        plans (name, monthly_fee),
                        business_units (name)
                    )
                `)
                .order('name');

            const { data, error } = await query;

            if (error) throw error;

            // Filter by business unit if selected
            let result = (data || []).map((c: any) => ({
                ...c,
                subscriptions: (c.subscriptions || []).map((s: any) => ({
                    ...s,
                    plan: Array.isArray(s.plans) ? s.plans[0] : s.plans,
                    business_unit: Array.isArray(s.business_units) ? s.business_units[0] : s.business_units
                }))
            }));

            if (selectedBusinessUnit !== 'all') {
                result = result.map((c: any) => ({
                    ...c,
                    subscriptions: c.subscriptions.filter((s: any) => s.business_unit_id === selectedBusinessUnit)
                })).filter((c: any) => c.subscriptions.length > 0);
            }

            setCustomers(result);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCustomer = (id: string) => {
        const newSet = new Set(expandedCustomers);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedCustomers(newSet);
    };

    // Filter and paginate
    const filtered = customers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobile_number?.includes(searchQuery)
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Stats
    const totalCustomers = customers.length;
    const activeSubscriptions = customers.reduce((sum, c) => sum + c.subscriptions.filter(s => s.active).length, 0);
    const totalBalance = customers.reduce((sum, c) => sum + c.subscriptions.reduce((s, sub) => s + (sub.balance || 0), 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Users className="w-6 h-6 text-purple-500" />
                            Customers & Subscriptions
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">View customer information and subscription details</p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="px-4 py-2 bg-purple-900/30 rounded-xl border border-purple-700/50">
                            <div className="text-xs text-purple-400">Customers</div>
                            <div className="text-lg font-bold text-purple-300">{totalCustomers}</div>
                        </div>
                        <div className="px-4 py-2 bg-emerald-900/30 rounded-xl border border-emerald-700/50">
                            <div className="text-xs text-emerald-400">Active Subs</div>
                            <div className="text-lg font-bold text-emerald-300">{activeSubscriptions}</div>
                        </div>
                        <div className="px-4 py-2 bg-amber-900/30 rounded-xl border border-amber-700/50">
                            <div className="text-xs text-amber-400">Total Balance</div>
                            <div className="text-lg font-bold text-amber-300">₱{totalBalance.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-800">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search customer or phone..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                    </div>
                    <select
                        value={selectedBusinessUnit}
                        onChange={(e) => { setSelectedBusinessUnit(e.target.value); setCurrentPage(1); }}
                        className="bg-[#1a1a1a] border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    >
                        <option value="all">All Business Units</option>
                        {businessUnits.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                    </select>
                    <button onClick={fetchCustomers} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Customer List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : paginated.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No customers found matching "${searchQuery}"` : 'No customers found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {paginated.map((customer) => (
                            <div key={customer.id}>
                                {/* Customer Row */}
                                <div
                                    className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => toggleCustomer(customer.id)}
                                >
                                    {expandedCustomers.has(customer.id) ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
                                        <span className="text-white font-bold">{customer.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-white">{customer.name}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <Phone className="w-3 h-3" />
                                            {customer.mobile_number || 'No number'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-400">{customer.subscriptions.length} subscription(s)</div>
                                        <BalanceInline balance={customer.subscriptions.reduce((sum, s) => sum + (s.balance || 0), 0)} />
                                    </div>
                                </div>

                                {/* Expanded Subscriptions */}
                                {expandedCustomers.has(customer.id) && (
                                    <div className="bg-[#080808] border-t border-gray-800/50 pl-12 pr-4 py-4 space-y-3">
                                        {customer.subscriptions.map((sub) => (
                                            <div key={sub.id} className="bg-[#0f0f0f] rounded-xl p-4 border border-gray-800">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sub.active ? 'bg-emerald-900/30' : 'bg-red-900/30'}`}>
                                                            {sub.active ? (
                                                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                            ) : (
                                                                <XCircle className="w-4 h-4 text-red-400" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <Wifi className="w-4 h-4 text-purple-400" />
                                                                <span className="text-white font-medium">{sub.plan?.name || 'No Plan'}</span>
                                                                <span className={`text-xs px-2 py-0.5 rounded ${sub.active ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                                                                    {sub.active ? 'Active' : 'Inactive'}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {sub.address}, {sub.barangay}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm text-gray-400">
                                                            <Building2 className="w-3 h-3 inline mr-1" />
                                                            {sub.business_unit?.name}
                                                        </div>
                                                        <BalanceInline balance={sub.balance} />
                                                    </div>
                                                </div>
                                                {sub.date_installed && (
                                                    <div className="mt-3 pt-3 border-t border-gray-800/50 text-xs text-gray-500 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        Installed: {new Date(sub.date_installed).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 text-gray-400 hover:text-white disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 text-gray-400 hover:text-white disabled:opacity-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
