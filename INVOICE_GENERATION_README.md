# Invoice Generation on Status Change - Quick Reference

## 📋 Overview

This feature automatically generates prorated invoices when subscription status changes:
- **Disconnection**: Invoice from last billing date to disconnection date
- **Activation**: Invoice from activation date to next billing date

## 🚀 Quick Start

### For Users
Read the **[User Guide](docs/USER_GUIDE_INVOICE_GENERATION.md)** for step-by-step instructions.

### For Developers
Read the **[Technical Documentation](docs/INVOICE_GENERATION_ON_STATUS_CHANGE.md)** for implementation details.

### For Project Managers
Read the **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** for overview and requirements verification.

## 📁 Documentation Files

| File | Purpose | Audience |
|------|---------|----------|
| [USER_GUIDE_INVOICE_GENERATION.md](docs/USER_GUIDE_INVOICE_GENERATION.md) | Step-by-step user instructions | End Users, Admins |
| [INVOICE_GENERATION_ON_STATUS_CHANGE.md](docs/INVOICE_GENERATION_ON_STATUS_CHANGE.md) | Technical documentation | Developers |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | Implementation overview | Project Managers, Developers |
| [CHANGELOG_INVOICE_GENERATION.md](CHANGELOG_INVOICE_GENERATION.md) | Version history and changes | All |

## ✨ Key Features

✅ **Automatic Calculation** - System calculates prorated amounts automatically  
✅ **Optional** - Can be enabled/disabled per operation  
✅ **Smart Dates** - Respects business unit billing schedules  
✅ **Balance Updates** - Automatically updates customer balances  
✅ **SMS Notifications** - Sends notifications to customers  
✅ **MikroTik Sync** - Maintains network access control  

## 🎯 Client Requirements Met

### Requirement 1: Invoice on Disconnection ✅
> When a Subscription status is set to Disconnected, automatically generate an invoice covering the usage period from the last Billing Date up to the Disconnection Date.

**Example:**
- Billing Date: 15th
- Disconnection Date: 25th
- Invoice Period: 15th–25th (10 days)

### Requirement 2: Invoice on Activation ✅
> When a Subscription is Activated or Reconnected and Generate Invoice is triggered, invoice should cover the period from the Activation Date up to the next Billing Date.

**Example:**
- Activation Date: 28th
- Billing Date: 15th (following month)
- Invoice Period: 28th–15th

## 🔧 Technical Implementation

### New Components
- `ActivationModal.tsx` - Activation dialog with invoice option
- `DisconnectionModal.tsx` - Enhanced disconnection dialog

### New Services
- `generateDisconnectionInvoice()` - Creates disconnection invoice
- `generateActivationInvoice()` - Creates activation invoice

### New API
- `POST /api/invoices/generate` - Manual invoice generation endpoint

### Modified Pages
- `app/admin/subscriptions/page.tsx` - Integrated modals
- `app/admin/customers/page.tsx` - Integrated modals

## 📊 Calculation Formula

```
Daily Rate = Monthly Fee ÷ 30
Prorated Amount = Daily Rate × Number of Days
```

**Example:**
- Monthly Fee: ₱900
- Days Used: 10
- Daily Rate: ₱30
- Invoice Amount: ₱300

## 🏢 Business Unit Schedules

### Bulihan & Extension
- Billing: 15th of month
- Period: Mid-month (Nov 15 - Dec 15)

### Malanggam
- Billing: 30th of month
- Period: Full month (Dec 1 - Dec 30)

## 🧪 Testing

All tests passed:
- ✅ TypeScript compilation
- ✅ No diagnostic errors
- ✅ Invoice calculations
- ✅ Balance updates
- ✅ SMS notifications
- ✅ MikroTik sync

## 📞 Support

For questions or issues:
1. Check the [User Guide](docs/USER_GUIDE_INVOICE_GENERATION.md)
2. Review the [Technical Docs](docs/INVOICE_GENERATION_ON_STATUS_CHANGE.md)
3. Contact system administrator

## 🔄 Version

**Current Version:** 1.0.0  
**Release Date:** January 27, 2025  
**Status:** ✅ Ready for Production

## 📝 Quick Links

- [User Guide](docs/USER_GUIDE_INVOICE_GENERATION.md) - How to use the feature
- [Technical Docs](docs/INVOICE_GENERATION_ON_STATUS_CHANGE.md) - Implementation details
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Overview and checklist
- [Changelog](CHANGELOG_INVOICE_GENERATION.md) - Version history

---

**Last Updated:** January 27, 2025  
**Implemented By:** AI Assistant (Kiro)  
**Requested By:** Client
