import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Check, User, Wifi, MapPin, ChevronDown, ChevronRight } from 'lucide-react';

interface Subscriber {
    id: string; // subscription_id
    subscriber_id: string;
    customers: {
        name: string;
        mobile_number: string;
    };
    plans: {
        name: string;
        monthly_fee: number;
    };
    business_units: {
        name: string;
    };
    balance?: number;
    address?: string;
}

interface GroupedSubscriber {
    customerId: string;
    customerName: string;
    mobileNumber: string;
    subscriptions: Subscriber[];
}

interface SubscriberSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (subscriber: Subscriber) => void;
}

export default function SubscriberSelectModal({ isOpen, onClose, onSelect }: SubscriberSelectModalProps) {
    const [groupedSubscribers, setGroupedSubscribers] = useState<GroupedSubscriber[]>([]);
    const [filteredGroups, setFilteredGroups] = useState<GroupedSubscriber[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            fetchSubscribers();
        }
    }, [isOpen]);

    useEffect(() => {
        const lowerQuery = searchQuery.toLowerCase();

        if (!lowerQuery) {
            setFilteredGroups(groupedSubscribers);
            return;
        }

        const filtered = groupedSubscribers.map(group => {
            // Check if customer matches
            const customerMatch = group.customerName.toLowerCase().includes(lowerQuery);

            // Check if any subscription matches
            const matchingSubs = group.subscriptions.filter(sub =>
                sub.plans.name.toLowerCase().includes(lowerQuery) ||
                sub.business_units.name.toLowerCase().includes(lowerQuery) ||
                (sub.address && sub.address.toLowerCase().includes(lowerQuery))
            );

            if (customerMatch) {
                // If customer matches, show all subs (or maybe just matching ones? Let's show all for context)
                return group;
            } else if (matchingSubs.length > 0) {
                // If only subs match, return group with only matching subs
                return { ...group, subscriptions: matchingSubs };
            }
            return null;
        }).filter(Boolean) as GroupedSubscriber[];

        setFilteredGroups(filtered);

        // Auto-expand if searching
        if (lowerQuery.length > 0) {
            const allCustomerIds = new Set(filtered.map(g => g.customerId));
            setExpandedCustomers(allCustomerIds);
        }

    }, [searchQuery, groupedSubscribers]);

    const fetchSubscribers = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    id,
                    subscriber_id,
                    customers!inner (id, name, mobile_number),
                    plans (name, monthly_fee),
                    business_units (name),
                    address
                `)
                .eq('active', true)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Handle array responses from Supabase joins
            const formattedData = (data as any[]).map(sub => ({
                ...sub,
                customers: Array.isArray(sub.customers) ? sub.customers[0] : sub.customers,
                plans: Array.isArray(sub.plans) ? sub.plans[0] : sub.plans,
                business_units: Array.isArray(sub.business_units) ? sub.business_units[0] : sub.business_units,
            }));

            // Fetch balances
            const subsWithBalance = await Promise.all(formattedData.map(async (sub) => {
                const { data: balanceData } = await supabase
                    .from('subscription_balance_view')
                    .select('balance')
                    .eq('subscription_id', sub.id)
                    .single();
                return { ...sub, balance: balanceData?.balance || 0 };
            }));

            // Group by Customer
            const groups: { [key: string]: GroupedSubscriber } = {};

            subsWithBalance.forEach(sub => {
                const custId = sub.customers.id; // Assuming customer object has ID, if not use subscriber_id
                if (!groups[custId]) {
                    groups[custId] = {
                        customerId: custId,
                        customerName: sub.customers.name,
                        mobileNumber: sub.customers.mobile_number,
                        subscriptions: []
                    };
                }
                groups[custId].subscriptions.push(sub);
            });

            const groupArray = Object.values(groups).sort((a, b) => a.customerName.localeCompare(b.customerName));

            setGroupedSubscribers(groupArray);
            setFilteredGroups(groupArray);
        } catch (error) {
            console.error('Error fetching subscribers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpand = (customerId: string) => {
        const newExpanded = new Set(expandedCustomers);
        if (newExpanded.has(customerId)) {
            newExpanded.delete(customerId);
        } else {
            newExpanded.add(customerId);
        }
        setExpandedCustomers(newExpanded);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-gray-800 rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Select Subscriber</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, plan, or area..."
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading subscribers...</div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No subscribers found</div>
                    ) : (
                        <div className="space-y-4">
                            {filteredGroups.map((group) => (
                                <div key={group.customerId} className="bg-[#1a1a1a] border border-gray-800 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => toggleExpand(group.customerId)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-[#202020] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-900/20 flex items-center justify-center text-blue-500">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div className="text-left">
                                                <h3 className="text-white font-medium">{group.customerName}</h3>
                                                <p className="text-xs text-gray-500">{group.mobileNumber || 'No mobile'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-500">
                                            <span className="text-xs">{group.subscriptions.length} Subscriptions</span>
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
                                                <button
                                                    key={sub.id}
                                                    onClick={() => onSelect(sub)}
                                                    className="w-full flex items-center justify-between p-3 pl-12 hover:bg-[#1a1a1a] border-b border-gray-800 last:border-0 transition-colors group text-left"
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-2 text-sm text-gray-300 group-hover:text-white">
                                                            <Wifi className="w-3 h-3" />
                                                            {sub.plans.name}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                            <MapPin className="w-3 h-3" />
                                                            {sub.business_units.name}
                                                            {sub.address && ` • ${sub.address}`}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`font-mono text-sm font-medium ${sub.balance && sub.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                            ₱{sub.balance?.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
