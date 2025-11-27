'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import GenerateInvoiceModal from '@/components/admin/GenerateInvoiceModal';
import { ChevronDown, ChevronRight, User, Building2 } from 'lucide-react';

interface Invoice {
    id: string;
    subscription_id: string;
    due_date: string;
    from_date: string;
    to_date: string;
    amount_due: number;
    payment_status: 'Paid' | 'Unpaid' | 'Partially Paid';
    total_paid?: number;
    remaining_balance?: number;
    subscriptions: {
        id: string;
        address?: string;
        label?: string;
        balance?: number;
        customers: {
            id: string;
            name: string;
        };
        plans: {
            name: string;
        };
        business_units: {
            id: string;
            name: string;
        };
    };
}

interface GroupedInvoice {
    customerId: string;
    customerName: string;
    businessUnitId: string;
    businessUnitName: string;
    subscriptions: {
        subscriptionId: string;
        planName: string;
        address?: string;
        label?: string;
        businessUnitName: string;
        invoices: Invoice[];
    }[];
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 10; // 10 customers per page

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    useEffect(() => {
        fetchInvoices();
    }, [selectedMonth, selectedBusinessUnit, currentPage]);

    useEffect(() => {
        setCurrentPage(1); // Reset to page 1 when filters change
    }, [selectedMonth, selectedBusinessUnit]);

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
    };

    const fetchInvoices = async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            let query = supabase
                .from('invoices')
                .select(`
                    *,
                    subscriptions (
                        id,
                        address,
                        label,
                        balance,
                        customers (
                            id,
                            name
                        ),
                        plans (
                            name
                        ),
                        business_units (
                            id,
                            name
                        )
                    )
                `)
                .gte('due_date', startDate)
                .lte('due_date', endDate)
                .order('due_date', { ascending: false });

            const { data: invoicesData, error } = await query;

            if (error) throw error;

            // Fetch payments for these subscriptions in this date range
            const subscriptionIds = (invoicesData as any[]).map(inv => inv.subscription_id);

            const { data: paymentsData } = await supabase
                .from('payments')
                .select('subscription_id, amount')
                .in('subscription_id', subscriptionIds)
                .gte('settlement_date', startDate)
                .lte('settlement_date', endDate);

            const paymentsMap = (paymentsData || []).reduce((acc: { [key: string]: number }, payment) => {
                acc[payment.subscription_id] = (acc[payment.subscription_id] || 0) + Number(payment.amount);
                return acc;
            }, {});

            const formattedInvoices = (invoicesData as any[]).map(inv => {
                const totalPaid = paymentsMap[inv.subscription_id] || 0;
                const remainingBalance = Math.max(0, inv.amount_due - totalPaid);

                return {
                    ...inv,
                    total_paid: totalPaid,
                    remaining_balance: remainingBalance,
                    subscriptions: {
                        id: inv.subscriptions.id,
                        address: inv.subscriptions.address,
                        label: inv.subscriptions.label,
                        balance: inv.subscriptions.balance,
                        customers: Array.isArray(inv.subscriptions.customers)
                            ? inv.subscriptions.customers[0]
                            : inv.subscriptions.customers,
                        plans: Array.isArray(inv.subscriptions.plans)
                            ? inv.subscriptions.plans[0]
                            : inv.subscriptions.plans,
                        business_units: Array.isArray(inv.subscriptions.business_units)
                            ? inv.subscriptions.business_units[0]
                            : inv.subscriptions.business_units,
                    }
                };
            });

            setInvoices(formattedInvoices);
            groupInvoicesByCustomer(formattedInvoices);

        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const groupInvoicesByCustomer = (invoicesData: Invoice[]) => {
        const groups: { [key: string]: GroupedInvoice } = {};

        // Filter by business unit first
        const filteredInvoices = selectedBusinessUnit === 'all'
            ? invoicesData
            : invoicesData.filter(inv => inv.subscriptions.business_units.id === selectedBusinessUnit);

        filteredInvoices.forEach(invoice => {
            const custId = invoice.subscriptions.customers.id;
            const custName = invoice.subscriptions.customers.name;
            const subId = invoice.subscription_id;
            const planName = invoice.subscriptions.plans.name;
            const address = invoice.subscriptions.address;
            const label = invoice.subscriptions.label;
            const businessUnitId = invoice.subscriptions.business_units.id;
            const businessUnitName = invoice.subscriptions.business_units.name;

            if (!groups[custId]) {
                groups[custId] = {
                    customerId: custId,
                    customerName: custName,
                    businessUnitId: businessUnitId,
                    businessUnitName: businessUnitName,
                    subscriptions: []
                };
            }

            let subscription = groups[custId].subscriptions.find(s => s.subscriptionId === subId);
            if (!subscription) {
                subscription = {
                    subscriptionId: subId,
                    planName: planName,
                    address: address,
                    label: label,
                    businessUnitName: businessUnitName,
                    invoices: []
                };
                groups[custId].subscriptions.push(subscription);
            }

            subscription.invoices.push(invoice);
        });

        const allGroups = Object.values(groups);

        // Calculate total pages
        const total = Math.ceil(allGroups.length / itemsPerPage);
        setTotalPages(total);

        // Paginate
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedGroups = allGroups.slice(startIndex, endIndex);

        setGroupedInvoices(paginatedGroups);
    };

    const toggleCustomer = (customerId: string) => {
        const newExpanded = new Set(expandedCustomers);
        if (newExpanded.has(customerId)) {
            newExpanded.delete(customerId);
        } else {
            newExpanded.add(customerId);
        }
        setExpandedCustomers(newExpanded);
    };

    return (
        <>
            <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-white">Invoices</h2>

                    <div className="flex items-center gap-3">
                        <select
                            value={selectedBusinessUnit}
                            onChange={(e) => setSelectedBusinessUnit(e.target.value)}
                            className="bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                        >
                            <option value="all">All Business Units</option>
                            {businessUnits.map(unit => (
                                <option key={unit.id} value={unit.id}>{unit.name}</option>
                            ))}
                        </select>

                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                        />

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                            Generate Invoices
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading invoices...</div>
                    ) : groupedInvoices.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No invoices found for {selectedMonth}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groupedInvoices.map((group) => (
                                <div key={group.customerId} className="bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => toggleCustomer(group.customerId)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-[#202020] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-900/20 flex items-center justify-center text-purple-500">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div className="text-left">
                                                <h3 className="text-white font-medium">{group.customerName}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Building2 className="w-3 h-3 text-gray-500" />
                                                    <p className="text-xs text-gray-500">{group.businessUnitName} • {group.subscriptions.length} Subscription(s)</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-500">
                                            {expandedCustomers.has(group.customerId) ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </div>
                                    </button>

                                    {expandedCustomers.has(group.customerId) && (
                                        <div className="border-t border-gray-800 bg-[#0f0f0f]">
                                            {group.subscriptions.map((sub) => (
                                                <div key={sub.subscriptionId} className="border-b border-gray-800 last:border-0">
                                                    <div className="p-4 bg-[#151515]">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    {sub.label && (
                                                                        <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-400">
                                                                            {sub.label}
                                                                        </span>
                                                                    )}
                                                                    <h4 className="text-sm font-medium text-white">{sub.planName}</h4>
                                                                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                                                                        {sub.businessUnitName}
                                                                    </span>
                                                                </div>
                                                                {sub.address && <p className="text-xs text-gray-500 mt-1">{sub.address}</p>}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {sub.invoices.map((invoice) => (
                                                                <div key={invoice.id} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
                                                                    <div className="flex items-center gap-3">
                                                                        <div>
                                                                            <div className="text-sm text-white">
                                                                                {new Date(invoice.due_date).toLocaleDateString()}
                                                                            </div>
                                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                                {new Date(invoice.from_date).toLocaleDateString()} - {new Date(invoice.to_date).toLocaleDateString()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-right">
                                                                            {invoice.payment_status === 'Partially Paid' || invoice.payment_status === 'Paid' ? (
                                                                                <div className="flex flex-col items-end gap-0.5">
                                                                                    <div className="text-xs text-gray-400">
                                                                                        Amount Due: <span className="text-white font-medium">₱{invoice.amount_due.toLocaleString()}</span>
                                                                                    </div>
                                                                                    <div className="text-xs text-green-400">
                                                                                        Paid: ₱{(invoice.total_paid || 0).toLocaleString()}
                                                                                    </div>
                                                                                    <div className={`text-xs font-medium ${(invoice.remaining_balance || 0) > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                                                                        Balance: ₱{(invoice.remaining_balance || 0).toLocaleString()}
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="text-sm font-medium text-white">
                                                                                        ₱{invoice.amount_due.toLocaleString()}
                                                                                    </div>
                                                                                    {invoice.subscriptions.balance !== undefined && invoice.subscriptions.balance !== 0 && (
                                                                                        <div className="text-xs text-gray-500 mt-0.5">
                                                                                            Balance: ₱{Math.abs(invoice.subscriptions.balance).toLocaleString()}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${invoice.payment_status === 'Paid'
                                                                            ? 'bg-green-900/30 text-green-400 border border-green-700/50'
                                                                            : invoice.payment_status === 'Partially Paid'
                                                                                ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50'
                                                                                : 'bg-red-900/30 text-red-400 border border-red-700/50'
                                                                            }`}>
                                                                            {invoice.payment_status}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {!isLoading && totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-800">
                            <div className="text-sm text-gray-400">
                                Page {currentPage} of {totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-white text-sm hover:bg-[#202020] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Previous
                                </button>

                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-[#1a1a1a] border border-gray-800 text-gray-400 hover:bg-[#202020]'
                                                    }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-white text-sm hover:bg-[#202020] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <GenerateInvoiceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchInvoices}
            />
        </>
    );
}
