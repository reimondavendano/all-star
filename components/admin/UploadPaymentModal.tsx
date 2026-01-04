import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, X, Banknote, CreditCard, Loader2 } from 'lucide-react'; // Added Loader2
import { uploadPaymentQR } from '@/app/actions/verification';
import jsQR from 'jsqr';

interface UploadPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function UploadPaymentModal({ isOpen, onClose }: UploadPaymentModalProps) {
    const [uploadUnit, setUploadUnit] = useState('malanggam');
    const [uploadProvider, setUploadProvider] = useState('gcash');
    const [uploadAccountName, setUploadAccountName] = useState('');
    const [uploadAccountNumber, setUploadAccountNumber] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    // New processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setPreviewUrl(null);
        setUploadFile(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    finishProcessing(file, event.target?.result as string);
                    return;
                }

                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    const loc = code.location;
                    const minX = Math.min(loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x);
                    const minY = Math.min(loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y);
                    const maxX = Math.max(loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x);
                    const maxY = Math.max(loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y);

                    const padding = 30; // 30px padding
                    const cropX = Math.max(0, minX - padding);
                    const cropY = Math.max(0, minY - padding);
                    const cropWidth = Math.min(canvas.width - cropX, (maxX - minX) + (padding * 2));
                    const cropHeight = Math.min(canvas.height - cropY, (maxY - minY) + (padding * 2));

                    const croppedCanvas = document.createElement('canvas');
                    croppedCanvas.width = cropWidth;
                    croppedCanvas.height = cropHeight;
                    const croppedCtx = croppedCanvas.getContext('2d');

                    if (croppedCtx) {
                        croppedCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                        croppedCanvas.toBlob((blob) => {
                            if (blob) {
                                const newFile = new File([blob], "cropped_" + file.name, { type: "image/png" });
                                setUploadFile(newFile);
                                setPreviewUrl(URL.createObjectURL(blob));
                                setIsProcessing(false);
                            } else {
                                finishProcessing(file, event.target?.result as string);
                            }
                        }, 'image/png');
                    } else {
                        finishProcessing(file, event.target?.result as string);
                    }
                } else {
                    // No QR found
                    finishProcessing(file, event.target?.result as string);
                }
            };
            img.onerror = () => finishProcessing(file, null);
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const finishProcessing = (file: File, preview: string | null) => {
        setUploadFile(file);
        setPreviewUrl(preview);
        setIsProcessing(false);
    };

    if (!isOpen) return null;

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;

        setIsUploading(true);
        setStatus('idle');
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('businessUnit', uploadUnit);
            formData.append('provider', uploadProvider);
            formData.append('accountName', uploadAccountName);
            formData.append('accountNumber', uploadAccountNumber);

            const result = await uploadPaymentQR(formData);
            if (result.success) {
                setStatus('success');
                setMessage(`QR Code and details for ${uploadProvider} (${uploadUnit}) saved successfully.`);
                setUploadFile(null);
                setUploadAccountName('');
                setUploadAccountNumber('');
            } else {
                alert('Upload failed: ' + result.error);
            }
        } catch (e) {
            alert('Upload error');
        } finally {
            setIsUploading(false);
        }
    };

    if (status === 'success') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
                <div className="relative bg-[#0a0a0a] border border-emerald-900/50 rounded-2xl p-8 max-w-sm w-full shadow-[0_0_60px_rgba(16,185,129,0.15)] animate-in fade-in zoom-in duration-300 text-center">
                    <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Success!</h2>
                    <p className="text-gray-400 mb-6 text-sm">{message}</p>

                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors"
                        >
                            Done
                        </button>
                        <button
                            onClick={() => setStatus('idle')}
                            className="w-full py-2.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 hover:text-white font-medium rounded-xl transition-colors text-sm"
                        >
                            Upload Another
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-violet-900/50 rounded-2xl p-6 max-w-md w-full shadow-[0_0_60px_rgba(139,92,246,0.15)] animate-in fade-in zoom-in duration-300">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-violet-500" />
                    Add Payment Method
                </h2>

                <form onSubmit={handleUpload} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Business Unit</label>
                        <select
                            value={uploadUnit}
                            onChange={(e) => setUploadUnit(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none"
                        >
                            <option value="malanggam">Malanggam</option>
                            <option value="bulihan">Bulihan</option>
                            <option value="extension">Extension</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Payment Provider</label>
                        <select
                            value={uploadProvider}
                            onChange={(e) => setUploadProvider(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none"
                        >
                            {/* E-Wallets */}
                            <optgroup label="E-Wallets">
                                <option value="gcash">GCash</option>
                                <option value="maya">Maya</option>
                                <option value="coinsph">Coins.ph</option>
                                <option value="grabpay">GrabPay</option>
                            </optgroup>
                            {/* Banks */}
                            <optgroup label="Banks">
                                <option value="bpi">BPI</option>
                                <option value="bdo">BDO</option>
                                <option value="metrobank">Metrobank</option>
                                <option value="rcbc">RCBC</option>
                                <option value="unionbank">UnionBank</option>
                                <option value="landbank">LandBank</option>
                                <option value="securitybank">Security Bank</option>
                                <option value="pnb">PNB</option>
                                <option value="chinabank">China Bank</option>
                                <option value="eastwest">EastWest Bank</option>
                            </optgroup>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Account Name</label>
                        <input
                            type="text"
                            value={uploadAccountName}
                            onChange={(e) => setUploadAccountName(e.target.value)}
                            placeholder="e.g. Juan A. dela Cruz"
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Account Number (Required for text display)</label>
                        <input
                            type="text"
                            value={uploadAccountNumber}
                            onChange={(e) => setUploadAccountNumber(e.target.value)}
                            placeholder="e.g. 0917-XXX-XXXX or 1234-5678-90"
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">QR Image File</label>
                        <div className="border-2 border-dashed border-gray-800 rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors bg-gray-900/20 relative overflow-hidden group">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                id="qr-upload-modal"
                                disabled={isProcessing}
                            />
                            <label htmlFor="qr-upload-modal" className="cursor-pointer block">
                                {isProcessing ? (
                                    <div className="flex flex-col items-center justify-center py-4 text-violet-400">
                                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                        <p className="text-sm">Processing QR Code...</p>
                                        <p className="text-xs text-violet-500/60 mt-1">Detecting and cropping...</p>
                                    </div>
                                ) : previewUrl ? (
                                    <div className="relative">
                                        <div className="w-48 h-48 mx-auto relative rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
                                            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                                        </div>
                                        <p className="text-emerald-400 text-xs mt-3 flex items-center justify-center gap-1.5 font-medium">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            {uploadFile?.name.startsWith('cropped_') ? 'QR Code Detected & Cropped' : 'Image Selected'}
                                        </p>
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                            <p className="text-white text-sm font-medium">Click to change</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-gray-500 py-4">
                                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                                        <p className="font-medium text-gray-400">Click to upload QR Image</p>
                                        <p className="text-xs mt-1 text-gray-600">We will auto-crop the QR code for you</p>
                                    </div>
                                )}
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isUploading || !uploadFile}
                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-violet-900/20"
                    >
                        {isUploading ? 'Uploading...' : 'Save Payment Method'}
                    </button>
                </form>
            </div>
        </div>
    );
}
