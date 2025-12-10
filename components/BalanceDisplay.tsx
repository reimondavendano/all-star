'use client';

import { formatBalanceDisplay } from '@/lib/billing';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface BalanceDisplayProps {
    balance: number;
    size?: 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    className?: string;
}

/**
 * Balance Display Component
 * Shows balance as "Balance" (amount owed) or "Credits" (advance payment)
 * 
 * Positive value = Balance (debt)
 * Negative value = Credits (advance payment)
 * Zero = Fully paid
 */
export default function BalanceDisplay({
    balance,
    size = 'md',
    showIcon = true,
    className = ''
}: BalanceDisplayProps) {
    const display = formatBalanceDisplay(balance);

    const sizeClasses = {
        sm: {
            container: 'text-xs',
            amount: 'text-sm font-medium',
            label: 'text-[10px]',
            icon: 'w-3 h-3',
        },
        md: {
            container: 'text-sm',
            amount: 'text-lg font-bold',
            label: 'text-xs',
            icon: 'w-4 h-4',
        },
        lg: {
            container: 'text-base',
            amount: 'text-2xl font-bold',
            label: 'text-sm',
            icon: 'w-5 h-5',
        },
    };

    const styles = sizeClasses[size];

    const isCredit = balance < 0;
    const isZero = balance === 0;

    const colorClasses = isZero
        ? 'text-gray-400'
        : isCredit
            ? 'text-green-400'
            : 'text-red-400';

    const bgClasses = isZero
        ? 'bg-gray-900/30 border-gray-700/50'
        : isCredit
            ? 'bg-green-900/20 border-green-700/30'
            : 'bg-red-900/20 border-red-700/30';

    const Icon = isZero ? Minus : isCredit ? TrendingDown : TrendingUp;

    return (
        <div className={`flex items-center gap-2 ${styles.container} ${className}`}>
            {showIcon && (
                <div className={`p-1.5 rounded-full ${bgClasses} border`}>
                    <Icon className={`${styles.icon} ${colorClasses}`} />
                </div>
            )}
            <div>
                <div className={`${styles.label} ${isZero ? 'text-gray-500' : isCredit ? 'text-green-500/70' : 'text-red-500/70'} uppercase tracking-wider`}>
                    {isZero ? 'Status' : display.label}
                </div>
                <div className={`${styles.amount} ${colorClasses}`}>
                    {isZero ? 'Fully Paid' : display.display}
                </div>
            </div>
        </div>
    );
}

/**
 * Inline Balance Display for tables and lists
 */
export function BalanceInline({ balance, className = '' }: { balance: number; className?: string }) {
    const display = formatBalanceDisplay(balance);
    const isCredit = balance < 0;
    const isZero = balance === 0;

    if (isZero) {
        return <span className={`text-gray-400 ${className}`}>₱0</span>;
    }

    return (
        <span className={`${isCredit ? 'text-green-400' : 'text-red-400'} ${className}`}>
            {isCredit && <span className="text-green-600 text-xs mr-1">(Credit)</span>}
            {display.display}
        </span>
    );
}

/**
 * Balance Badge for compact display
 */
export function BalanceBadge({ balance, className = '' }: { balance: number; className?: string }) {
    const display = formatBalanceDisplay(balance);
    const isCredit = balance < 0;
    const isZero = balance === 0;

    const bgClasses = isZero
        ? 'bg-gray-800 text-gray-400'
        : isCredit
            ? 'bg-green-900/30 text-green-400'
            : 'bg-red-900/30 text-red-400';

    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${bgClasses} ${className}`}>
            {isZero ? 'Paid' : `${display.label}: ${display.display}`}
        </span>
    );
}
