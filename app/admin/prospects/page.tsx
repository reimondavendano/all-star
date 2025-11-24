'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SubscribeModal from '@/components/SubscribeModal';
import EditProspectModal from '@/components/admin/EditProspectModal';
import {
    Search, Filter, ChevronLeft, ChevronRight, Trash2, Edit, ChevronDown, ChevronUp,
    User, Phone, MapPin, Home, Landmark as LandmarkIcon, Wifi, Calendar,
    UserCheck, FileText
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
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);

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
            const { data, error } = await supabase
                .from('plans')
                .select('id, name, monthly_fee');

            if (error) throw error;

            const plansMap: { [key: string]: Plan } = {};
            data?.forEach(plan => {
                plansMap[plan.id] = plan;
            });
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
            const { error } = await supabase
                .from('prospects')
                .delete()
                .eq('id', id);

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
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    };

    const toggleRow = (id: string) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    const handleModalClose = () => {
        setShowModal(false);
        fetchProspects();
    };

    const handleEditClose = () => {
        setEditingProspect(null);
        fetchProspects();
    };

    const filteredProspects = prospects.filter(prospect =>
        prospect.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prospect.mobile_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prospect.barangay?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredProspects.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentProspects = filteredProspects.slice(startIndex, endIndex);

    return (
        <>
            <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-red-900/50">
                <div className="p-6 flex justify-between items-center border-b border-gray-900">
                    <h1 className="text-2xl font-bold text-white">Prospects</h1>
                    <div className="flex items-center gap-3">
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
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors font-medium"
                        >
                            Add Prospect
                        </button>
                    </div>
                </div>

                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-900">
                            <th className="w-10"></th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Mobile</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Barangay</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Address</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Created Date</th>
                            <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={8} className="text-center p-8 text-gray-500">
                                    Loading...
                                </td>
                            </tr>
                        ) : currentProspects.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center p-8 text-gray-500">
                                    No prospects found
                                </td>
                            </tr>
                        ) : (
                            currentProspects.map((prospect) => (
                                <React.Fragment key={prospect.id}>
                                    <tr className="border-b border-gray-900 hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                                        <td className="p-4">
                                            <button
                                                onClick={() => toggleRow(prospect.id)}
                                                className="text-gray-400 hover:text-white transition-colors"
                                            >
                                                {expandedRow === prospect.id ? (
                                                    <ChevronUp className="w-4 h-4" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="p-4 text-white" onClick={() => toggleRow(prospect.id)}>{prospect.name}</td>
                                        <td className="p-4 text-gray-400" onClick={() => toggleRow(prospect.id)}>{prospect.mobile_number || '-'}</td>
                                        <td className="p-4 text-gray-400" onClick={() => toggleRow(prospect.id)}>{prospect.barangay || '-'}</td>
                                        <td className="p-4 text-gray-400 max-w-xs truncate" onClick={() => toggleRow(prospect.id)}>{prospect.address || '-'}</td>
                                        <td className="p-4" onClick={() => toggleRow(prospect.id)}>
                                            <span className={`text-xs font-medium ${prospect.status === 'Open'
                                                    ? 'text-green-500'
                                                    : prospect.status === 'Converted'
                                                        ? 'text-blue-500'
                                                        : 'text-red-500'
                                                }`}>
                                                {prospect.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-400" onClick={() => toggleRow(prospect.id)}>{formatDate(prospect.created_at)}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingProspect(prospect);
                                                    }}
                                                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                                    title="Edit prospect"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirm(prospect.id);
                                                    }}
                                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Delete prospect"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {expandedRow === prospect.id && (
                                        <tr className="border-b border-gray-900 bg-[#0f0f0f]">
                                            <td colSpan={8} className="p-6">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Basic Information</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-start gap-3">
                                                                <User className="w-4 h-4 text-blue-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Name</label>
                                                                    <p className="text-sm text-white">{prospect.name}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <Phone className="w-4 h-4 text-green-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Mobile Number</label>
                                                                    <p className="text-sm text-gray-300">{prospect.mobile_number || '-'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <FileText className="w-4 h-4 text-purple-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Status</label>
                                                                    <p className={`text-sm font-medium ${prospect.status === 'Open'
                                                                            ? 'text-green-500'
                                                                            : prospect.status === 'Converted'
                                                                                ? 'text-blue-500'
                                                                                : 'text-red-500'
                                                                        }`}>
                                                                        {prospect.status}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Location Details</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-start gap-3">
                                                                <MapPin className="w-4 h-4 text-red-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Barangay</label>
                                                                    <p className="text-sm text-gray-300">{prospect.barangay || '-'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <Home className="w-4 h-4 text-orange-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Address</label>
                                                                    <p className="text-sm text-gray-300">{prospect.address || '-'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <LandmarkIcon className="w-4 h-4 text-yellow-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Landmark</label>
                                                                    <p className="text-sm text-gray-300">{prospect.landmark || '-'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Service Information</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-start gap-3">
                                                                <Wifi className="w-4 h-4 text-cyan-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Plan</label>
                                                                    <p className="text-sm text-gray-300">{getPlanDisplay(prospect.plan_id)}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Installation Date</label>
                                                                    <p className="text-sm text-gray-300">{formatDate(prospect.installation_date)}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase">Additional Details</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-start gap-3">
                                                                <UserCheck className="w-4 h-4 text-teal-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Referrer ID</label>
                                                                    <p className="text-sm text-gray-300 font-mono break-all">{prospect.referrer_id || '-'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <FileText className="w-4 h-4 text-amber-500 mt-0.5" />
                                                                <div className="flex-1">
                                                                    <label className="text-xs text-gray-500">Details / Notes</label>
                                                                    <p className="text-sm text-gray-300">{prospect.details || '-'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
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
                        Showing {startIndex + 1} to {Math.min(endIndex, filteredProspects.length)} of {filteredProspects.length} entries
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
                                Are you sure you want to delete this prospect? This action cannot be undone.
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
            </div>

            {showModal && (
                <SubscribeModal isOpen={showModal} onClose={handleModalClose} />
            )}

            {editingProspect && (
                <EditProspectModal
                    isOpen={true}
                    prospect={editingProspect}
                    onClose={handleEditClose}
                    onUpdate={handleEditClose}
                />
            )}
        </>
    );
}
