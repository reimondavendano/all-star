'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Edit, Trash2, Plus, ChevronDown, RefreshCw, Building2, User, Wifi, Users } from 'lucide-react';
import EditBusinessUnitModal from '@/components/admin/EditBusinessUnitModal';
import AddBusinessUnitModal from '@/components/admin/AddBusinessUnitModal';

interface BusinessUnit {
    id: string;
    name: string;
    subscribers: number;
    created_at: string;
}

interface Subscription {
    id: string;
    subscriber_id: string;
    plan_id: string;
    active: boolean;
    customer?: { name: string; mobile_number: string };
    plan?: { name: string; monthly_fee: number };
}

export default function BusinessUnitsPage() {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [subscriptionsByUnit, setSubscriptionsByUnit] = useState<Record<string, Subscription[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<BusinessUnit | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Pagination state for subscriptions per business unit
    const [subPages, setSubPages] = useState<Record<string, number>>({});
    const subsPerPage = 10;

    const itemsPerPage = 10;

    useEffect(() => { fetchBusinessUnits(); }, []);

    const fetchBusinessUnits = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('business_units').select('*').order('created_at', { ascending: false });
            if (error) throw error;

            const unitsWithCounts = await Promise.all(
                (data || []).map(async (unit) => {
                    const { count } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('business_unit_id', unit.id).eq('active', true);
                    return { ...unit, subscribers: count || 0 };
                })
            );
            setBusinessUnits(unitsWithCounts);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSubscriptionsForUnit = async (unitId: string) => {
        if (subscriptionsByUnit[unitId]) return;
        try {
            const { data } = await supabase
                .from('subscriptions')
                .select('*, customer:customers!subscriptions_subscriber_id_fkey(name, mobile_number), plan:plans(name, monthly_fee)')
                .eq('business_unit_id', unitId)
                .eq('active', true)
                .order('created_at', { ascending: false });
            setSubscriptionsByUnit(prev => ({ ...prev, [unitId]: data || [] }));
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('business_units').delete().eq('id', id);
            fetchBusinessUnits();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
            fetchSubscriptionsForUnit(id);
            // Reset to page 1 when expanding
            setSubPages(prev => ({ ...prev, [id]: 1 }));
        }
        setExpandedRows(newSet);
    };

    // Get current page for a unit's subscriptions
    const getSubPage = (unitId: string) => subPages[unitId] || 1;
    const setSubPage = (unitId: string, page: number) => setSubPages(prev => ({ ...prev, [unitId]: page }));

    const filteredUnits = businessUnits.filter(u => u.name?.toLowerCase().includes(searchQuery.toLowerCase()));
    const totalPages = Math.ceil(filteredUnits.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentUnits = filteredUnits.slice(startIndex, startIndex + itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Building2 className="w-6 h-6 text-indigo-500" />
                            Business Units
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Manage service areas and their subscriptions</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-64"
                            />
                        </div>
                        <button onClick={fetchBusinessUnits} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-indigo-900/30"
                        >
                            <Plus className="w-4 h-4" />
                            Add Business Unit
                        </button>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : currentUnits.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No business units found matching "${searchQuery}"` : 'No business units found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {currentUnits.map((unit) => {
                            const subs = subscriptionsByUnit[unit.id] || [];
                            const subPage = getSubPage(unit.id);
                            const subTotalPages = Math.ceil(subs.length / subsPerPage);
                            const subStartIndex = (subPage - 1) * subsPerPage;
                            const currentSubs = subs.slice(subStartIndex, subStartIndex + subsPerPage);

                            return (
                                <div key={unit.id}>
                                    <div className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors" onClick={() => toggleRow(unit.id)}>
                                        {expandedRows.has(unit.id) ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-900/30">
                                            <Building2 className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-semibold text-white">{unit.name}</div>
                                            <div className="text-xs text-gray-500">Created {new Date(unit.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {unit.subscribers} active
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedBusinessUnit(unit); setIsEditModalOpen(true); }} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg transition-colors">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(unit.id); }} className="p-2 text-red-400 hover:text-red-300 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {expandedRows.has(unit.id) && (
                                        <div className="bg-[#080808] border-t border-gray-800/50 p-4 pl-16">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-xs text-gray-500 uppercase">Active Subscriptions</div>
                                                {subs.length > 0 && (
                                                    <div className="text-xs text-gray-500">
                                                        Showing {subStartIndex + 1}-{Math.min(subStartIndex + subsPerPage, subs.length)} of {subs.length}
                                                    </div>
                                                )}
                                            </div>
                                            {!subscriptionsByUnit[unit.id] ? (
                                                <div className="text-gray-500 text-sm">Loading...</div>
                                            ) : subs.length === 0 ? (
                                                <div className="text-gray-500 text-sm">No active subscriptions</div>
                                            ) : (
                                                <>
                                                    <div className="space-y-2">
                                                        {currentSubs.map((sub) => (
                                                            <div key={sub.id} className="flex items-center gap-3 p-3 bg-[#151515] rounded-lg border border-gray-800">
                                                                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                                                                    <User className="w-4 h-4 text-gray-400" />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="text-sm text-white">{sub.customer?.name || 'Unknown'}</div>
                                                                    <div className="text-xs text-gray-500">{sub.plan?.name} • ₱{sub.plan?.monthly_fee?.toLocaleString()}/mo</div>
                                                                </div>
                                                                <Wifi className={`w-4 h-4 ${sub.active ? 'text-green-500' : 'text-red-500'}`} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {/* Subscription Pagination */}
                                                    {subTotalPages > 1 && (
                                                        <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-gray-800/50">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSubPage(unit.id, Math.max(1, subPage - 1)); }}
                                                                disabled={subPage === 1}
                                                                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                                            >
                                                                <ChevronLeft className="w-4 h-4" />
                                                            </button>
                                                            <span className="text-xs text-gray-500">Page {subPage} of {subTotalPages}</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSubPage(unit.id, Math.min(subTotalPages, subPage + 1)); }}
                                                                disabled={subPage === subTotalPages}
                                                                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                                            >
                                                                <ChevronRight className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {filteredUnits.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredUnits.length)} of {filteredUnits.length}</div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-red-900/50 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 mb-6">Are you sure you want to delete this business unit?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedBusinessUnit && <EditBusinessUnitModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedBusinessUnit(null); }} businessUnit={selectedBusinessUnit} onUpdate={fetchBusinessUnits} />}
            <AddBusinessUnitModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={fetchBusinessUnits} />
        </div>
    );
}
