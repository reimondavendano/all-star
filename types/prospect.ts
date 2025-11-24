export type ProspectStatus = 'Open' | 'Closed Lost' | 'Closed Won';

export interface Prospect {
    id: string;
    name: string; // Customer Name
    planId: string; // Lookup -> Plan Catalog
    businessUnitId: string; // Lookup -> Business Unit
    landmark: string;
    barangay: string;
    address: string;
    mobileNumber: string;
    installationDate: string; // Date
    referrerId?: string; // Lookup -> Customer
    details?: string;
    status: ProspectStatus;
}
