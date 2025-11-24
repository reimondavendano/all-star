export interface BusinessUnit {
    id: string;
    name: string;
    activeSubscriptions: number; // Rollup: count of Active Subscriptions
}
