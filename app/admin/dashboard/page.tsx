import StatCard from '@/components/admin/StatCard';
import RevenueChart from '@/components/admin/RevenueChart';
import { Users, CreditCard, DollarSign, Activity, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white neon-text">System Overview</h1>
                    <p className="text-xs text-gray-500 font-mono mt-1">STATUS: ONLINE | LATENCY: 24ms</p>
                </div>
                <div className="flex space-x-2">
                    <select className="bg-black/50 border border-red-900/30 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-red-500 font-mono">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                        <option>This Year</option>
                    </select>
                    <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-[0_0_15px_rgba(255,0,0,0.4)] flex items-center">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Data
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue"
                    value="₱124,500"
                    change="+12.5%"
                    trend="up"
                    icon={DollarSign}
                />
                <StatCard
                    title="Active Nodes"
                    value="1,234"
                    change="+5.2%"
                    trend="up"
                    icon={Users}
                />
                <StatCard
                    title="Pending Tx"
                    value="₱45,200"
                    change="-2.4%"
                    trend="down"
                    icon={CreditCard}
                />
                <StatCard
                    title="System Load"
                    value="68%"
                    change="+1.8%"
                    trend="up"
                    icon={Activity}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <RevenueChart />
                </div>
                <div className="tech-card p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center">
                            <Activity className="w-4 h-4 mr-2 text-red-500" />
                            System Logs
                        </h3>
                        <span className="text-xs text-gray-500 font-mono">LIVE</span>
                    </div>
                    <div className="space-y-2 font-mono text-sm h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="flex items-center justify-between p-2 hover:bg-white/5 rounded transition-colors border-l-2 border-transparent hover:border-red-500">
                                <div className="flex items-center">
                                    <span className="text-gray-600 mr-3 text-xs">10:42:{10 + i}</span>
                                    <div>
                                        <p className="text-gray-300">New connection established</p>
                                        <p className="text-xs text-red-500/70">Node ID: #{Math.floor(Math.random() * 9000) + 1000}</p>
                                    </div>
                                </div>
                                <span className="text-xs text-green-500">[OK]</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
