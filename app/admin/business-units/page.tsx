'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, Edit, Trash2, Plus, ChevronDown, ChevronUp, User, Wifi } from 'lucide-react';
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
    customer?: {
        name: string;
        mobile_number: string;
    };
    plan?: {
        name: string;
        monthly_fee: number;
    };
}

export default function BusinessUnitsPage() {
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [subscriptionsByUnit, setSubscriptionsByUnit] = useState<Record<string, Subscription[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [expandedPageByUnit, setExpandedPageByUnit] = useState<Record<string, number>>({});

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<BusinessUnit | null>(null);

    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const itemsPerPage = 10;
    const expandedItemsPerPage = 5; // Items per page in collapsed section

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    const fetchBusinessUnits = async () => {
        setIsLoading(true);
        try {
            // Fetch business units
            const { data: unitsData, error: unitsError } = await supabase
                .from('business_units')
                .select('*')
                .order('created_at', { ascending: false });

            if (unitsError) throw unitsError;

            // For each business unit, count active subscriptions
            const unitsWithCounts = await Promise.all(
                (unitsData || []).map(async (unit) => {
                    const { count, error: countError } = await supabase
                        .from('subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('business_unit_id', unit.id)
                        .eq('active', true);

                    if (countError) {
                        console.error('Error counting subscribers:', countError);
                        return { ...unit, subscribers: 0 };
                    }

                    return { ...unit, subscribers: count || 0 };
                })
            );

            setBusinessUnits(unitsWithCounts);
        } catch (error) {
            console.error('Error fetching business units:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSubscriptionsForUnit = async (unitId: string) => {
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    customer:customers(name, mobile_number),
                    plan:plans(name, monthly_fee)
                `)
                .eq('business_unit_id', unitId)
                .eq('active', true);

            if (error) throw error;

            setSubscriptionsByUnit(prev => ({
                ...prev,
                [unitId]: data || []
            }));
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        }
    };

    const toggleRow = async (unitId: string) => {
        if (expandedRow === unitId) {
            setExpandedRow(null);
        } else {
            setExpandedRow(unitId);
            // Initialize page to 1 for this unit if not set
            if (!expandedPageByUnit[unitId]) {
                setExpandedPageByUnit(prev => ({ ...prev, [unitId]: 1 }));
            }
            // Fetch subscriptions if not already loaded
            if (!subscriptionsByUnit[unitId]) {
                await fetchSubscriptionsForUnit(unitId);
            }
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('business_units')
                .delete()
                .eq('id', id);

            if (error) throw error;

            fetchBusinessUnits();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting business unit:', error);
            alert('Failed to delete business unit');
        }
    };

    const handleEdit = (businessUnit: BusinessUnit) => {
        setSelectedBusinessUnit(businessUnit);
        setIsEditModalOpen(true);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const filteredBusinessUnits = businessUnits.filter(unit =>
        unit.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredBusinessUnits.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentBusinessUnits = filteredBusinessUnits.slice(startIndex, endIndex);

    return (
        <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-red-900/50">
            <div className="p-6 flex justify-between items-center border-b border-gray-900">
                <h1 className="text-2xl font-bold text-white">Business Units</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Add Business Unit
                    </button>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-[#1a1a1a] border border-gray-800 rounded pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gray-700 w-64"
                        />
                    </div>
                    <button className="p-2 bg-[#1a1a1a] border border-gray-800 rounded text-gray-400 hover:text-white transition-colors">
                        <Filter className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-900">
                        <th className="w-10"></th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Active Subscribers</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Created Date</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {isLoading ? (
                        <tr>
                            <td colSpan={5} className="text-center p-8 text-gray-500">
                                Loading...
                            </td>
                        </tr>
                    ) : currentBusinessUnits.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="text-center p-8 text-gray-500">
                                No business units found
                            </td>
                        </tr>
                    ) : (
                        currentBusinessUnits.map((unit) => (
                            <React.Fragment key={unit.id}>
                                <tr className="border-b border-gray-900 hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                                    <td className="p-4">
                                        <button
                                            onClick={() => toggleRow(unit.id)}
                                            className="text-gray-400 hover:text-white transition-colors"
                                        >
                                            {expandedRow === unit.id ? (
                                                <ChevronUp className="w-4 h-4" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4" />
                                            )}
                                        </button>
                                    </td>
                                    <td className="p-4 text-white font-medium" onClick={() => toggleRow(unit.id)}>{unit.name}</td>
                                    <td className="p-4" onClick={() => toggleRow(unit.id)}>
                                        <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm font-semibold">
                                            {unit.subscribers || 0}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-400" onClick={() => toggleRow(unit.id)}>{formatDate(unit.created_at)}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEdit(unit);
                                                }}
                                                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                                title="Edit business unit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteConfirm(unit.id);
                                                }}
                                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                                title="Delete business unit"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {expandedRow === unit.id && (
                                    <tr className="border-b border-gray-900 bg-[#0f0f0f]">
                                        <td colSpan={5} className="p-6">
                                            <div className="space-y-4">
                                                {(() => {
                                                    const subs = subscriptionsByUnit[unit.id] || [];
                                                    const currentExpandedPage = expandedPageByUnit[unit.id] || 1;
                                                    const totalExpandedPages = Math.ceil(subs.length / expandedItemsPerPage);
                                                    const startIdx = (currentExpandedPage - 1) * expandedItemsPerPage;
                                                    const endIdx = startIdx + expandedItemsPerPage;
                                                    const paginatedSubs = subs.slice(startIdx, endIdx);

                                                    return (
                                                        <>
                                                            <div className="flex items-center justify-between">
                                                                <h3 className="text-sm font-semibold text-gray-400 uppercase">
                                                                    Customers & Subscriptions ({subs.length})
                                                                </h3>
                                                                {totalExpandedPages > 1 && (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => setExpandedPageByUnit(prev => ({
                                                                                ...prev,
                                                                                [unit.id]: Math.max(1, currentExpandedPage - 1)
                                                                            }))}
                                                                            disabled={currentExpandedPage === 1}
                                                                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                                        >
                                                                            <ChevronLeft className="w-4 h-4" />
                                                                        </button>
                                                                        <span className="text-xs text-gray-500">
                                                                            Page {currentExpandedPage} of {totalExpandedPages}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => setExpandedPageByUnit(prev => ({
                                                                                ...prev,
                                                                                [unit.id]: Math.min(totalExpandedPages, currentExpandedPage + 1)
                                                                            }))}
                                                                            disabled={currentExpandedPage === totalExpandedPages}
                                                                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                                        >
                                                                            <ChevronRight className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {paginatedSubs.length > 0 ? (
                                                                <div className="grid grid-cols-1 gap-3">
                                                                    {paginatedSubs.map((sub) => (
                                                                        <div
                                                                            key={sub.id}
                                                                            className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-4 flex items-center justify-between"
                                                                        >
                                                                            <div className="flex items-center gap-4">
                                                                                <User className="w-5 h-5 text-blue-500" />
                                                                                <div>
                                                                                    <p className="text-white font-medium">{sub.customer?.name || 'Unknown'}</p>
                                                                                    <p className="text-gray-500 text-sm">{sub.customer?.mobile_number || '-'}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-4">
                                                                                <Wifi className="w-5 h-5 text-cyan-500" />
                                                                                <div className="text-right">
                                                                                    <p className="text-gray-300 text-sm">{sub.plan?.name || 'No Plan'}</p>
                                                                                    <p className="text-green-400 text-sm font-semibold">
                                                                                        ₱{sub.plan?.monthly_fee?.toLocaleString() || 0}/mo
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-gray-500 text-sm">No active subscriptions for this business unit.</p>
                                                            )}
                                                            {totalExpandedPages > 1 && (
                                                                <div className="text-center text-xs text-gray-500 pt-2">
                                                                    Showing {startIdx + 1} to {Math.min(endIdx, subs.length)} of {subs.length}
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))
                    )}
                </tbody>
            </table>

            <div className="flex items-center justify-between p-4 border-t border-gray-900">
                <div className="text-sm text-gray-500">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredBusinessUnits.length)} of {filteredBusinessUnits.length} entries
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-400">
                        Page {currentPage} of {totalPages || 1}
                    </span>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 rounded-xl shadow-[0_0_50px_rgba(255,0,0,0.3)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete this business unit? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedBusinessUnit && (
                <EditBusinessUnitModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedBusinessUnit(null);
                    }}
                    businessUnit={selectedBusinessUnit}
                    onUpdate={fetchBusinessUnits}
                />
            )}

            <AddBusinessUnitModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={fetchBusinessUnits}
            />
        </div>
    );
}
