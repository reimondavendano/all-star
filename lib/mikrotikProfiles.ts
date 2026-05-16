export const PLAN_TO_MIKROTIK_PROFILE: Record<string, string> = {
    'Plan 799': '50MBPS-2',
    'Plan 999': '100MBPS-2',
    'Plan 1299': '130MBPS',
    'Plan 1499': '150MBPS',
};

export function getMikrotikProfileForPlan(planName?: string | null): string {
    if (!planName) return '50MBPS-2';

    const exactProfile = PLAN_TO_MIKROTIK_PROFILE[planName];
    if (exactProfile) return exactProfile;

    if (planName.includes('799') || planName.includes('50')) return '50MBPS-2';
    if (planName.includes('999') || planName.includes('100')) return '100MBPS-2';
    if (planName.includes('1299') || planName.includes('130')) return '130MBPS';
    if (planName.includes('1499') || planName.includes('150')) return '150MBPS';

    return '50MBPS-2';
}
