'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, Edit, Trash2, Plus } from 'lucide-react';
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

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const itemsPerPage = 10;

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPlans(data || []);
        } catch (error) {
            console.error('Error fetching plans:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('plans')
                .delete()
                .eq('id', id);

            if (error) throw error;

            fetchPlans();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting plan:', error);
            alert('Failed to delete plan');
        }
    };

    const handleEdit = (plan: Plan) => {
        setSelectedPlan(plan);
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

    const filteredPlans = plans.filter(plan =>
        plan.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.details?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPlans = filteredPlans.slice(startIndex, endIndex);

    return (
        <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-red-900/50">
            <div className="p-6 flex justify-between items-center border-b border-gray-900">
                <h1 className="text-2xl font-bold text-white">Plans</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Add Plan
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
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Monthly Fee</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Details</th>
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
                    ) : currentPlans.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="text-center p-8 text-gray-500">
                                No plans found
                            </td>
                        </tr>
                    ) : (
                        currentPlans.map((plan) => (
                            <tr
                                key={plan.id}
                                className="border-b border-gray-900 hover:bg-[#1a1a1a] transition-colors"
                            >
                                <td className="p-4 text-white font-medium">{plan.name}</td>
                                <td className="p-4 text-green-400 font-semibold">₱{plan.monthly_fee.toLocaleString()}</td>
                                <td className="p-4 text-gray-400 max-w-xs truncate">{plan.details || '-'}</td>
                                <td className="p-4 text-gray-400">{formatDate(plan.created_at)}</td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleEdit(plan)}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                            title="Edit plan"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(plan.id)}
                                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                            title="Delete plan"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            <div className="flex items-center justify-between p-4 border-t border-gray-900">
                <div className="text-sm text-gray-500">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredPlans.length)} of {filteredPlans.length} entries
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
                            Are you sure you want to delete this plan? This action cannot be undone.
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

            {selectedPlan && (
                <EditPlanModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedPlan(null);
                    }}
                    plan={selectedPlan}
                    onUpdate={fetchPlans}
                />
            )}

            <AddPlanModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={fetchPlans}
            />
        </div>
    );
}
