import { Customer } from './customer';
import { BusinessUnit } from './businessUnit';
import { Plan } from './plan';

export interface Subscription {
    id: string;
    subscriberId: string; // Lookup -> Customer
    businessUnitId: string; // Lookup -> Business Unit
    planId: string; // Lookup -> Plan Catalog
    active: boolean;
    dateInstalled: string; // Date
    contactPerson: string;
    address: string; // Long Text
    landmark: string; // Long Text
    invoiceDate: '15th' | '30th';
    balance: number; // Formula: Total Invoices – Total Payments
    referralCreditApplied: boolean;

    // Expanded for UI convenience
    customer?: Customer;
    businessUnit?: BusinessUnit;
    plan?: Plan;
}
