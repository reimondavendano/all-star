'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
    { name: 'Jan', revenue: 4000 },
    { name: 'Feb', revenue: 3000 },
    { name: 'Mar', revenue: 2000 },
    { name: 'Apr', revenue: 2780 },
    { name: 'May', revenue: 1890 },
    { name: 'Jun', revenue: 2390 },
    { name: 'Jul', revenue: 3490 },
];

export default function RevenueChart() {
    return (
        <div className="tech-card p-6 h-[400px] rounded-xl">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                    System Revenue
                </h3>
                <div className="text-xs font-mono text-red-400 border border-red-900/30 px-2 py-1 rounded bg-red-900/10">
                    LIVE DATA
                </div>
            </div>
            <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff0000" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ff0000" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                        dataKey="name"
                        stroke="#666"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#666', fontSize: 12 }}
                    />
                    <YAxis
                        stroke="#666"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `₱${value}`}
                        tick={{ fill: '#666', fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(10, 10, 10, 0.9)',
                            border: '1px solid rgba(255, 0, 0, 0.3)',
                            borderRadius: '8px',
                            color: '#fff',
                            backdropFilter: 'blur(4px)'
                        }}
                        itemStyle={{ color: '#ff0000' }}
                    />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#ff0000"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
