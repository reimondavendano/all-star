import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string;
    change: string;
    icon: LucideIcon;
    trend: 'up' | 'down' | 'neutral';
}

export default function StatCard({ title, value, change, icon: Icon, trend }: StatCardProps) {
    return (
        <div className="tech-card p-6 rounded-xl group hover:shadow-[0_0_20px_rgba(255,0,0,0.15)] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-red-900/10 rounded-lg border border-red-900/30 group-hover:border-red-500/50 transition-colors">
                    <Icon className="w-6 h-6 text-red-500 group-hover:animate-pulse" />
                </div>
                <span className={`text-xs font-mono px-2 py-1 rounded border ${trend === 'up'
                        ? 'text-green-400 border-green-900/30 bg-green-900/10'
                        : trend === 'down'
                            ? 'text-red-400 border-red-900/30 bg-red-900/10'
                            : 'text-gray-400 border-gray-800 bg-gray-900/10'
                    }`}>
                    {change}
                </span>
            </div>
            <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-mono mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-white neon-text">{value}</h3>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
    );
}
