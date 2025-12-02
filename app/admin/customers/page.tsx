'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, Edit, Trash2, Copy, Check, User } from 'lucide-react';
import EditCustomerModal from '@/components/admin/EditCustomerModal';

interface Customer {
    id: string;
    name: string;
    mobile_number: string;
    created_at: string;
    subscriptions?: { id: string; active: boolean }[];
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const itemsPerPage = 10;

    const handleCopyLink = (customerId: string) => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const url = `${origin}/portal/${customerId}`;
        navigator.clipboard.writeText(url);
        setCopiedId(customerId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*, subscriptions(id, active)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            // First, delete all subscriptions associated with this customer
            const { error: subscriptionsError } = await supabase
                .from('subscriptions')
                .delete()
                .eq('subscriber_id', id);

            if (subscriptionsError) {
                console.error('Error deleting subscriptions:', subscriptionsError);
                // Continue anyway to delete the customer
            }

            // Then delete the customer
            const { error: customerError } = await supabase
                .from('customers')
                .delete()
                .eq('id', id);

            if (customerError) throw customerError;

            fetchCustomers();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting customer:', error);
            alert('Failed to delete customer');
        }
    };

    const handleEdit = (customer: Customer) => {
        setSelectedCustomer(customer);
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

    const filteredCustomers = customers.filter(customer =>
        customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.mobile_number?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentCustomers = filteredCustomers.slice(startIndex, endIndex);

    return (
        <div className="bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-red-900/50">
            <div className="p-6 flex justify-between items-center border-b border-gray-900">
                <h1 className="text-2xl font-bold text-white">Customers</h1>
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
                </div>
            </div>

            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-900">
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Mobile Number</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Subscriptions</th>
                        <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Portal</th>
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
                    ) : currentCustomers.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="text-center p-8 text-gray-500">
                                No customers found
                            </td>
                        </tr>
                    ) : (
                        currentCustomers.map((customer) => (
                            <tr
                                key={customer.id}
                                className="border-b border-gray-900 hover:bg-[#1a1a1a] transition-colors"
                            >
                                <td className="p-4 text-white">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-blue-500" />
                                        {customer.name}
                                    </div>
                                </td>
                                <td className="p-4 text-gray-400">{customer.mobile_number || '-'}</td>
                                <td className="p-4 text-gray-400">
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const totalSubs = customer.subscriptions?.length || 0;
                                            const activeSubs = customer.subscriptions?.filter(sub => sub.active).length || 0;
                                            const disconnectedSubs = totalSubs - activeSubs;

                                            return (
                                                <>
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${totalSubs > 0
                                                        ? 'bg-blue-900/30 text-blue-400 border border-blue-800'
                                                        : 'bg-gray-800 text-gray-400 border border-gray-700'
                                                        }`}>
                                                        {totalSubs} Total
                                                    </span>
                                                    {activeSubs > 0 && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                                                            {activeSubs} Active
                                                        </span>
                                                    )}
                                                    {disconnectedSubs > 0 && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-800">
                                                            {disconnectedSubs} Disconnected
                                                        </span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={`/portal/${customer.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline text-sm"
                                        >
                                            View Portal
                                        </a>
                                        <button
                                            onClick={() => handleCopyLink(customer.id)}
                                            className="p-1 text-gray-400 hover:text-white transition-colors"
                                            title="Copy Portal Link"
                                        >
                                            {copiedId === customer.id ? (
                                                <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleEdit(customer)}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                            title="Edit customer"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        {/* <button
                                            onClick={() => setDeleteConfirm(customer.id)}
                                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                            title="Delete customer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button> */}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            <div className="flex items-center justify-between p-4 border-t border-gray-900">
                <div className="text-sm text-gray-500">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredCustomers.length)} of {filteredCustomers.length} entries
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
                            Are you sure you want to delete this customer? This action cannot be undone.
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

            {selectedCustomer && (
                <EditCustomerModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedCustomer(null);
                    }}
                    customer={selectedCustomer}
                    onUpdate={fetchCustomers}
                />
            )}
        </div>
    );
}
