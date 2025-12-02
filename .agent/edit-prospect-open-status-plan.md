# Edit Prospect Modal - Open Status Editable Fields Implementation Plan

## Overview
Make all prospect information fields editable when status is "Open" in the Verify Prospect modal.

## Changes Required

### 1. Add State for Editable Prospect Fields (after line 67)
```typescript
const [prospectData, setProspectData] = useState({
    name: prospect.name || '',
    mobile_number: prospect.mobile_number || '',
    barangay: prospect.barangay || '',
    address: prospect.address || '',
    landmark: prospect.landmark || '',
    label: prospect.label || '',
    details: prospect.details || ''
});
```

### 2. Update useEffect to Initialize Prospect Data (around line 95-100)
Add to the existing useEffect:
```typescript
setProspectData({
    name: prospect.name || '',
    mobile_number: prospect.mobile_number || '',
    barangay: prospect.barangay || '',
    address: prospect.address || '',
    landmark: prospect.landmark || '',
    label: prospect.label || '',
    details: prospect.details || ''
});
```

### 3. Update handleOpenUpdate Function (around line 236-259)
Add prospect data fields to the update:
```typescript
const handleOpenUpdate = async () => {
    setIsLoading(true);
    try {
        const { error } = await supabase
            .from('prospects')
            .update({
                status: formData.status,
                business_unit_id: formData.business_unit_id || null,
                installation_date: formData.installation_date || null,
                router_serial_number: formData.router_serial_number || null,
                // Add editable prospect fields
                name: prospectData.name,
                mobile_number: prospectData.mobile_number,
                barangay: prospectData.barangay,
                address: prospectData.address,
                landmark: prospectData.landmark,
                label: prospectData.label,
                details: prospectData.details,
                'x-coordinates': coordinates?.lng || null,
                'y-coordinates': coordinates?.lat || null
            })
            .eq('id', prospect.id);

        if (error) throw error;
        setShowSuccess(true);
    } catch (error) {
        console.error('Error updating prospect:', error);
        alert('Failed to update prospect');
    } finally {
        setIsLoading(false);
    }
};
```

### 4. Update Display Sections to Show Input Fields for "Open" Status

#### BASIC INFORMATION Section (around line 538-560)
Replace static `<p>` tags with conditional rendering:
- Name: Input field when status === 'Open'
- Mobile Number: Input field when status === 'Open'

#### LOCATION DETAILS Section (around line 562-590)
Replace static `<p>` tags with conditional rendering:
- Barangay: Input field when status === 'Open'
- Address: Textarea when status === 'Open'
- Landmark: Input field when status === 'Open'

#### SERVICE INFORMATION Section (around line 592-614)
- Plan: Keep as read-only (not editable)
- Label: Input field when status === 'Open'

#### ADDITIONAL DETAILS Section (around line 616-642)
- Referrer: Keep as read-only (not editable)
- Notes/Details: Textarea when status === 'Open'

## Implementation Notes
- Use conditional rendering: `{formData.status === 'Open' ? <input /> : <p />}`
- Input fields should have same styling as existing inputs in the modal
- Textarea fields should use `rows={2}` or `rows={4}` depending on expected content length
- All inputs should update `prospectData` state using `setProspectData({ ...prospectData, field: value })`
