import { Customer } from './customer';
import { BusinessUnit } from './businessUnit';
import { Plan } from './plan';

export interface Subscription {
    id: string;
    subscriberId: string;
    businessUnitId: string;
    planId: string;
    active: boolean;
    dateInstalled: string;
    contactPerson: string;
    mobileNumber: string;
    address: string;
    landmark: string;
    invoiceDate: '15th' | '30th';
    balance: number;
    referralCreditApplied: boolean;

    // Expanded for UI convenience
    customer?: Customer;
    businessUnit?: BusinessUnit;
    plan?: Plan;
}
