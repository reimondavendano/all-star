'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Edit, Trash2, Plus, RefreshCw, Package, DollarSign, ChevronDown } from 'lucide-react';
import EditPlanModal from '@/components/admin/EditPlanModal';
import AddPlanModal from '@/components/admin/AddPlanModal';

interface Plan {
    id: string;
    name: string;
    monthly_fee: number;
    details: string;
    created_at: string;
}

export default function PlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const itemsPerPage = 10;

    useEffect(() => { fetchPlans(); }, []);

    const fetchPlans = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('plans').select('*').order('monthly_fee', { ascending: true });
            if (error) throw error;
            setPlans(data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('plans').delete().eq('id', id);
            fetchPlans();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedRows(newSet);
    };

    const filteredPlans = plans.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
    const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentPlans = filteredPlans.slice(startIndex, startIndex + itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Package className="w-6 h-6 text-teal-500" />
                            Plans
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Manage internet service plans and pricing</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search plans..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500 w-64"
                            />
                        </div>
                        <button onClick={fetchPlans} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-teal-900/30"
                        >
                            <Plus className="w-4 h-4" />
                            Add Plan
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
                ) : currentPlans.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No plans found matching "${searchQuery}"` : 'No plans found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {currentPlans.map((plan) => (
                            <div key={plan.id}>
                                <div className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors" onClick={() => toggleRow(plan.id)}>
                                    {expandedRows.has(plan.id) ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-900/30">
                                        <Package className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-white">{plan.name}</div>
                                        <div className="text-xs text-gray-500">Created {new Date(plan.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <span className="px-4 py-2 rounded-xl text-lg font-bold bg-gradient-to-r from-emerald-900/40 to-teal-900/40 text-emerald-400 border border-emerald-700/50 flex items-center gap-1">
                                        <DollarSign className="w-4 h-4" />₱{plan.monthly_fee.toLocaleString()}<span className="text-xs font-normal text-gray-500">/mo</span>
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedPlan(plan); setIsEditModalOpen(true); }} className="p-2 text-blue-400 hover:text-blue-300 rounded-lg transition-colors">
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(plan.id); }} className="p-2 text-red-400 hover:text-red-300 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {expandedRows.has(plan.id) && (
                                    <div className="bg-[#080808] border-t border-gray-800/50 p-4 pl-16">
                                        <div className="text-xs text-gray-500 uppercase mb-2">Plan Details</div>
                                        <p className="text-gray-300 text-sm">{plan.details || 'No details provided'}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {filteredPlans.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredPlans.length)} of {filteredPlans.length}</div>
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
                        <p className="text-gray-400 mb-6">Are you sure you want to delete this plan?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedPlan && <EditPlanModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedPlan(null); }} plan={selectedPlan} onUpdate={fetchPlans} />}
            <AddPlanModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={fetchPlans} />
        </div>
    );
}
