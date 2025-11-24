export type ProspectStatus = 'Prospect' | 'Converted';

export interface Prospect {
    id: string;
    name: string;
    planId: string;
    businessUnitId: string;
    landmark: string;
    address: string;
    mobileNumber: string;
    installationDate: string;
    referrerId?: string;
    status: ProspectStatus;
    email?: string;
}
