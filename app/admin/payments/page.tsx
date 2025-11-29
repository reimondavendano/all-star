'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import RecordPaymentModal from '@/components/admin/RecordPaymentModal';
import { ChevronDown, ChevronRight, User, Building2, Plus } from 'lucide-react';

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
    is_virtual?: boolean; // For ad-hoc payments
}

interface Subscription {
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
    invoices: Invoice[];
}

interface GroupedData {
    customerId: string;
    customerName: string;
    businessUnitId: string;
    businessUnitName: string;
    subscriptions: Subscription[];
}

export default function PaymentsPage() {
    const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetchBusinessUnits();
    }, []);

    useEffect(() => {
        fetchData();
    }, [selectedMonth, selectedBusinessUnit, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedMonth, selectedBusinessUnit]);

    const fetchBusinessUnits = async () => {
        const { data } = await supabase
            .from('business_units')
            .select('id, name')
            .order('name');
        setBusinessUnits(data || []);
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedMonth.split('-');
            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

            // 1. Fetch Invoices for the month
            let invoiceQuery = supabase
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

            const { data: invoicesData, error: invoiceError } = await invoiceQuery;
            if (invoiceError) throw invoiceError;

            // Calculate date range for payments
            let minDate = startDate;
            let maxDate = endDate; // Default to end of month to capture late payments

            if (invoicesData && invoicesData.length > 0) {
                const fromDates = invoicesData.map((i: any) => i.from_date).sort();
                if (fromDates[0] < minDate) minDate = fromDates[0];
                // We keep maxDate as endDate (end of month) to capture late payments
            }

            // 2. Fetch Payments in the range
            const subscriptionIds = new Set((invoicesData as any[]).map(inv => inv.subscription_id));

            const { data: paymentsData } = await supabase
                .from('payments')
                .select('id, subscription_id, amount, settlement_date, mode, notes')
                .in('subscription_id', Array.from(subscriptionIds))
                .gte('settlement_date', minDate)
                .lte('settlement_date', maxDate);

            // 3. Merge Data
            const subscriptionMap = new Map<string, Subscription>();

            // Process Invoices
            (invoicesData as any[]).forEach(inv => {
                const subId = inv.subscription_id;
                if (!subscriptionMap.has(subId)) {
                    subscriptionMap.set(subId, {
                        id: subId,
                        address: inv.subscriptions.address,
                        label: inv.subscriptions.label,
                        balance: inv.subscriptions.balance,
                        customers: Array.isArray(inv.subscriptions.customers) ? inv.subscriptions.customers[0] : inv.subscriptions.customers,
                        plans: Array.isArray(inv.subscriptions.plans) ? inv.subscriptions.plans[0] : inv.subscriptions.plans,
                        business_units: Array.isArray(inv.subscriptions.business_units) ? inv.subscriptions.business_units[0] : inv.subscriptions.business_units,
                        invoices: []
                    });
                }

                const paymentsForInvoice = (paymentsData || []).filter((p: any) =>
                    p.subscription_id === subId &&
                    p.settlement_date >= inv.from_date
                    // Removed p.settlement_date <= inv.to_date to allow late payments
                );

                const totalPaid = paymentsForInvoice.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
                const remainingBalance = Math.max(0, inv.amount_due - totalPaid);

                subscriptionMap.get(subId)?.invoices.push({
                    ...inv,
                    total_paid: totalPaid,
                    remaining_balance: remainingBalance,
                    is_virtual: false
                });
            });

            // Process "Virtual" Invoices (Ad-hoc payments not matched to any invoice)
            (paymentsData || []).forEach((p: any) => {
                const subId = p.subscription_id;
                // Check if this payment was already counted in an invoice
                const isMatched = (invoicesData as any[]).some(inv =>
                    inv.subscription_id === subId &&
                    p.settlement_date >= inv.from_date
                );

                if (!isMatched) {
                    // This is an ad-hoc payment (or for a previous invoice not in view)
                    if (subscriptionMap.has(subId)) {
                        subscriptionMap.get(subId)?.invoices.push({
                            id: p.id,
                            subscription_id: subId,
                            due_date: p.settlement_date,
                            from_date: p.settlement_date,
                            to_date: p.settlement_date,
                            amount_due: 0, // No amount due for ad-hoc
                            payment_status: 'Paid',
                            total_paid: p.amount,
                            remaining_balance: 0,
                            is_virtual: true
                        });
                    }
                }
            });

            const allSubscriptions = Array.from(subscriptionMap.values());
            groupDataByCustomer(allSubscriptions);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const groupDataByCustomer = (subscriptions: Subscription[]) => {
        const groups: { [key: string]: GroupedData } = {};

        // Filter by business unit
        const filteredSubs = selectedBusinessUnit === 'all'
            ? subscriptions
            : subscriptions.filter(sub => sub.business_units.id === selectedBusinessUnit);

        filteredSubs.forEach(sub => {
            const custId = sub.customers.id;

            if (!groups[custId]) {
                groups[custId] = {
                    customerId: custId,
                    customerName: sub.customers.name,
                    businessUnitId: sub.business_units.id,
                    businessUnitName: sub.business_units.name,
                    subscriptions: []
                };
            }
            groups[custId].subscriptions.push(sub);
        });

        const allGroups = Object.values(groups);
        setTotalPages(Math.ceil(allGroups.length / itemsPerPage));

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        setGroupedData(allGroups.slice(startIndex, endIndex));
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
                    <h2 className="text-xl font-semibold text-white">Payments</h2>

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
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Pay Bills
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading payments...</div>
                    ) : groupedData.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No payments found for {selectedMonth}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groupedData.map((group) => (
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
                                                <div key={sub.id} className="border-b border-gray-800 last:border-0">
                                                    <div className="p-4 bg-[#151515]">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    {sub.label && (
                                                                        <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-400">
                                                                            {sub.label}
                                                                        </span>
                                                                    )}
                                                                    <h4 className="text-sm font-medium text-white">{sub.plans.name}</h4>
                                                                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                                                                        {sub.business_units.name}
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
                                                                            {!invoice.is_virtual && (() => {
                                                                                const dueDate = new Date(invoice.due_date);
                                                                                const discDate = new Date(dueDate);
                                                                                discDate.setDate(discDate.getDate() + 5);
                                                                                return (
                                                                                    <div className="text-xs text-red-400 mt-0.5">
                                                                                        Disconnection: {discDate.toLocaleDateString()}
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                                {invoice.is_virtual ? 'Ad-hoc Payment' : `${new Date(invoice.from_date).toLocaleDateString()} - ${new Date(invoice.to_date).toLocaleDateString()}`}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-8">
                                                                        {!invoice.is_virtual && (
                                                                            <>
                                                                                <div className="text-right">
                                                                                    <div className="text-xs text-gray-400">Amount Due</div>
                                                                                    <div className="text-sm font-bold text-white">
                                                                                        ₱{((Number(invoice.amount_due) || 0) + Math.max(0, (Number(sub.balance) || 0))).toLocaleString()}
                                                                                    </div>
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                        <div className="text-right">
                                                                            <div className="text-xs text-gray-400">Amount Paid</div>
                                                                            <div className="text-sm text-green-400">
                                                                                ₱{(invoice.total_paid || 0).toLocaleString()}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="text-xs text-gray-400">
                                                                                {Number(sub.balance) > 0 ? 'Balance' : Number(sub.balance) < 0 ? 'Extra Balance' : 'Balance'}
                                                                            </div>
                                                                            <div className={`text-sm font-bold ${Number(sub.balance) > 0 ? 'text-red-400' : Number(sub.balance) < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                                                                                ₱{Math.abs(Number(sub.balance) || 0).toLocaleString()}
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <span className={`px-2 py-1 rounded-full text-xs ${invoice.payment_status === 'Paid' ? 'bg-green-900/30 text-green-400' :
                                                                                    invoice.payment_status === 'Partially Paid' ? 'bg-yellow-900/30 text-yellow-400' :
                                                                                        'bg-red-900/30 text-red-400'
                                                                                }`}>
                                                                                {invoice.payment_status}
                                                                            </span>
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

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-4 pt-4 border-t border-gray-800">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-white disabled:opacity-50 hover:bg-[#252525]"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-gray-400">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-white disabled:opacity-50 hover:bg-[#252525]"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <RecordPaymentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    fetchData();
                    setIsModalOpen(false);
                }}
            />
        </>
    );
}
