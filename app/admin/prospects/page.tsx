'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SubscribeModal from '@/components/SubscribeModal';
import EditProspectModal from '@/components/admin/EditProspectModal';
import {
    Search, ChevronLeft, ChevronRight, Trash2, Edit, ChevronDown,
    User, Phone, MapPin, Home, Landmark as LandmarkIcon, Wifi, Calendar,
    UserCheck, FileText, Plus, RefreshCw, UserPlus
} from 'lucide-react';

interface Prospect {
    id: string;
    name: string;
    plan_id: string;
    business_unit_id: string;
    landmark: string;
    barangay: string;
    address: string;
    mobile_number: string;
    installation_date: string;
    referrer_id: string;
    details: string;
    status: string;
    created_at: string;
}

interface Plan {
    id: string;
    name: string;
    monthly_fee: number;
}

export default function ProspectsPage() {
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [plans, setPlans] = useState<{ [key: string]: Plan }>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [showModal, setShowModal] = useState(false);
    const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
    const [activeTab, setActiveTab] = useState<'Open' | 'Closed Lost'>('Open');

    const itemsPerPage = 10;

    useEffect(() => {
        fetchProspects();
        fetchPlans();
    }, []);

    const fetchProspects = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('prospects')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProspects(data || []);
        } catch (error) {
            console.error('Error fetching prospects:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPlans = async () => {
        try {
            const { data, error } = await supabase.from('plans').select('id, name, monthly_fee');
            if (error) throw error;
            const plansMap: { [key: string]: Plan } = {};
            data?.forEach(plan => { plansMap[plan.id] = plan; });
            setPlans(plansMap);
        } catch (error) {
            console.error('Error fetching plans:', error);
        }
    };

    const getPlanDisplay = (planId: string) => {
        if (!planId || !plans[planId]) return '-';
        const plan = plans[planId];
        return `${plan.name} - ₱${plan.monthly_fee.toLocaleString()}`;
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.from('prospects').delete().eq('id', id);
            if (error) throw error;
            fetchProspects();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting prospect:', error);
            alert('Failed to delete prospect');
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        newSet.has(id) ? newSet.delete(id) : newSet.add(id);
        setExpandedRows(newSet);
    };

    const filteredProspects = prospects.filter(prospect =>
        (prospect.status === activeTab) &&
        (prospect.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            prospect.mobile_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            prospect.barangay?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const totalPages = Math.ceil(filteredProspects.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProspects = filteredProspects.slice(startIndex, startIndex + itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <UserPlus className="w-6 h-6 text-orange-500" />
                            Prospects
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Track and manage potential customers
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Tab Switcher */}
                        <div className="flex bg-gray-900/50 rounded-xl p-1 border border-gray-800">
                            <button
                                onClick={() => { setActiveTab('Open'); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Open'
                                        ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Open
                            </button>
                            <button
                                onClick={() => { setActiveTab('Closed Lost'); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Closed Lost'
                                        ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Closed Lost
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search prospects..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="bg-[#1a1a1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-orange-500 w-64"
                            />
                        </div>

                        <button onClick={fetchProspects} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-orange-900/30"
                        >
                            <Plus className="w-4 h-4" />
                            Add Prospect
                        </button>
                    </div>
                </div>
            </div>

            {/* Prospect List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Loading...
                    </div>
                ) : currentProspects.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <UserPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>{searchQuery ? `No prospects found matching "${searchQuery}"` : 'No prospects found'}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {currentProspects.map((prospect) => (
                            <div key={prospect.id}>
                                {/* Prospect Row */}
                                <div
                                    className="p-4 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => toggleRow(prospect.id)}
                                >
                                    {expandedRows.has(prospect.id) ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-900/30">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-white truncate">{prospect.name}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            {prospect.mobile_number && <><Phone className="w-3 h-3" />{prospect.mobile_number}</>}
                                            {prospect.barangay && <><span className="text-gray-700">•</span><MapPin className="w-3 h-3" />{prospect.barangay}</>}
                                        </div>
                                    </div>
                                    <div className="hidden md:flex items-center gap-4 text-sm">
                                        <div className="text-gray-400">{getPlanDisplay(prospect.plan_id)}</div>
                                        <div className="text-gray-500">{formatDate(prospect.installation_date)}</div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${prospect.status === 'Open'
                                            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                            : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                        }`}>
                                        {prospect.status}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingProspect(prospect); }}
                                            className="p-2 text-blue-400 hover:text-blue-300 rounded-lg transition-colors"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(prospect.id); }}
                                            className="p-2 text-red-400 hover:text-red-300 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedRows.has(prospect.id) && (
                                    <div className="bg-[#080808] border-t border-gray-800/50 p-6 pl-16">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                            <div className="flex items-start gap-3">
                                                <Phone className="w-4 h-4 text-green-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Mobile</div><div className="text-gray-300">{prospect.mobile_number || '-'}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Barangay</div><div className="text-gray-300">{prospect.barangay || '-'}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <Home className="w-4 h-4 text-orange-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Address</div><div className="text-gray-300">{prospect.address || '-'}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <LandmarkIcon className="w-4 h-4 text-yellow-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Landmark</div><div className="text-gray-300">{prospect.landmark || '-'}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <Wifi className="w-4 h-4 text-cyan-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Plan</div><div className="text-gray-300">{getPlanDisplay(prospect.plan_id)}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Installation Date</div><div className="text-gray-300">{formatDate(prospect.installation_date)}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <UserCheck className="w-4 h-4 text-teal-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Referrer</div><div className="text-gray-300 font-mono text-xs">{prospect.referrer_id || '-'}</div></div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <FileText className="w-4 h-4 text-amber-500 mt-0.5" />
                                                <div><div className="text-xs text-gray-500">Details</div><div className="text-gray-300">{prospect.details || '-'}</div></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {filteredProspects.length > itemsPerPage && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <div className="text-sm text-gray-500">
                            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredProspects.length)} of {filteredProspects.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-50">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-gray-400">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-white disabled:opacity-50">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
                    <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-red-900/50 rounded-2xl shadow-[0_0_60px_rgba(239,68,68,0.15)] w-full max-w-md p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Confirm Delete</h3>
                        <p className="text-gray-400 mb-6">Are you sure you want to delete this prospect? This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl font-medium transition-all">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModal && <SubscribeModal isOpen={showModal} onClose={() => { setShowModal(false); fetchProspects(); }} isAdmin={true} />}

            {editingProspect && (
                <EditProspectModal
                    isOpen={true}
                    prospect={editingProspect}
                    onClose={() => { setEditingProspect(null); fetchProspects(); }}
                    onUpdate={() => { setEditingProspect(null); fetchProspects(); }}
                />
            )}
        </div>
    );
}
