import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceData {
    invoiceNumber: string;
    date: string;
    dueDate: string;
    customerName: string;
    customerAddress: string;
    accountNumber: string;
    billingPeriod: string;
    items: {
        description: string;
        amount: number;
    }[];
    totalAmount: number;
    status: string;
}

export const generateInvoicePDF = async (data: InvoiceData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Load Logo
    const logoUrl = '/logo/allstar.jpg';
    const logoImg = await fetchImage(logoUrl);

    // --- Header ---
    // Red accent bar at top
    doc.setFillColor(220, 38, 38); // Red #DC2626
    doc.rect(0, 0, pageWidth, 5, 'F');

    // Logo
    if (logoImg) {
        doc.addImage(logoImg, 'JPEG', 15, 15, 30, 30);
    }

    // Company Info (Right aligned)
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0); // Black
    doc.setFont('helvetica', 'bold');
    doc.text('ALLSTAR TECH', pageWidth - 15, 25, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100); // Gray
    doc.text('Next-Generation Fiber Internet', pageWidth - 15, 32, { align: 'right' });
    doc.text('support@allstartech.ph', pageWidth - 15, 37, { align: 'right' });
    // doc.text('123 Fiber Street, Tech City', pageWidth - 15, 42, { align: 'right' });

    // --- Invoice Title & Details ---
    doc.setFontSize(36);
    doc.setTextColor(220, 38, 38); // Red
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 15, 60);

    // Invoice Meta Data
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');

    const metaStartX = pageWidth - 70;
    const metaStartY = 60;
    const lineHeight = 6;

    doc.text('Invoice #:', metaStartX, metaStartY);
    doc.setFont('helvetica', 'normal');
    doc.text(data.invoiceNumber, pageWidth - 15, metaStartY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', metaStartX, metaStartY + lineHeight);
    doc.setFont('helvetica', 'normal');
    doc.text(data.date, pageWidth - 15, metaStartY + lineHeight, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('Due Date:', metaStartX, metaStartY + lineHeight * 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 38, 38); // Red for Due Date
    doc.text(data.dueDate, pageWidth - 15, metaStartY + lineHeight * 2, { align: 'right' });

    // --- Bill To ---
    const billToY = 85;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 15, billToY);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(data.customerName, 15, billToY + 6);

    // Handle multi-line address
    const splitAddress = doc.splitTextToSize(data.customerAddress || '', 80);
    doc.text(splitAddress, 15, billToY + 11);

    // Account Number
    doc.setFont('helvetica', 'bold');
    doc.text('Account ID:', 15, billToY + 11 + (splitAddress.length * 5) + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(data.accountNumber, 40, billToY + 11 + (splitAddress.length * 5) + 5);

    // --- Table ---
    const tableStartY = billToY + 35;

    autoTable(doc, {
        startY: tableStartY,
        head: [['Description', 'Amount']],
        body: [
            ...data.items.map(item => [item.description, formatCurrency(item.amount)]),
            ['', ''], // Spacer
            [{ content: 'Total Amount Due', styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }, { content: formatCurrency(data.totalAmount), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }]
        ],
        theme: 'grid',
        headStyles: {
            fillColor: [20, 20, 20], // Dark Gray/Black header
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left' // Default header alignment
        },
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 6
        },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 60, halign: 'right' } // Increased width and ensured right alignment
        },
        footStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold'
        }
    });

    // --- Footer / Payment Info ---
    const finalY = (doc as any).lastAutoTable.finalY + 20;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Instructions:', 15, finalY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Please pay via GCash, PayMaya, or Bank Transfer using the details below or via your Customer Portal.', 15, finalY + 6);

    // Payment Methods Box
    doc.setDrawColor(200, 200, 200);
    doc.rect(15, finalY + 10, pageWidth - 30, 25);

    doc.text('GCash / PayMaya: 0912 345 6789 (AllStar Tech)', 20, finalY + 20);
    doc.text('Bank Transfer (BPI): 1234 5678 90', 20, finalY + 27);

    // Thank you message
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Thank you for choosing AllStar Tech!', pageWidth / 2, pageWidth - 20, { align: 'center' });

    // Save
    doc.save(`Invoice-${data.invoiceNumber}.pdf`);
};

// Helper to fetch image and convert to base64/blob for PDF
const fetchImage = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            } else {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
    });
};

const formatCurrency = (amount: number) => {
    // Use PHP code instead of symbol to avoid font encoding issues in PDF
    return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
