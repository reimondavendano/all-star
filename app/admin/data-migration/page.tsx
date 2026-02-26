'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function DataMigrationPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string>('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
                setError('Please select an Excel file (.xlsx or .xls)');
                return;
            }
            setFile(selectedFile);
            setError('');
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        setIsProcessing(true);
        setError('');
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/admin/migrate-data', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Migration failed');
            }

            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Data Migration Tool</h1>
                    <p className="text-gray-400">
                        Upload Websitee.xlsx to auto-generate customer, subscription, and MikroTik data
                    </p>
                </div>

                {/* Upload Section */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 mb-6">
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
                            <FileSpreadsheet className="w-10 h-10 text-amber-500" />
                        </div>
                        
                        <h2 className="text-xl font-bold text-white mb-2">Upload Excel File</h2>
                        <p className="text-gray-400 text-sm mb-6 text-center">
                            Select the Websitee.xlsx file containing customer and MikroTik data
                        </p>

                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <div className="px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl transition-all font-bold flex items-center gap-2">
                                <Upload className="w-5 h-5" />
                                Select File
                            </div>
                        </label>

                        {file && (
                            <div className="mt-4 text-center">
                                <p className="text-green-400 text-sm">✓ {file.name}</p>
                                <p className="text-gray-500 text-xs mt-1">
                                    {(file.size / 1024).toFixed(2)} KB
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Process Button */}
                {file && !result && (
                    <button
                        onClick={handleUpload}
                        disabled={isProcessing}
                        className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-700 text-white rounded-xl transition-all font-bold flex items-center justify-center gap-2 text-lg shadow-lg"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Processing Migration...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-6 h-6" />
                                AutoGenerate Mikrotik + Data
                            </>
                        )}
                    </button>
                )}

                {/* Error Display */}
                {error && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-red-400 font-medium">Error</p>
                            <p className="text-red-300 text-sm mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {/* Success Result */}
                {result && (
                    <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <CheckCircle className="w-6 h-6 text-green-500" />
                            <h3 className="text-xl font-bold text-green-400">Migration Completed!</h3>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-gray-400 text-sm">Customers Created</p>
                                <p className="text-2xl font-bold text-white">{result.customersCreated || 0}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-gray-400 text-sm">Subscriptions Created</p>
                                <p className="text-2xl font-bold text-white">{result.subscriptionsCreated || 0}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-gray-400 text-sm">MikroTik Secrets</p>
                                <p className="text-2xl font-bold text-white">{result.mikrotikSecretsCreated || 0}</p>
                            </div>
                        </div>

                        {result.errors && result.errors.length > 0 && (
                            <div className="mt-4">
                                <p className="text-yellow-400 font-medium mb-2">Warnings ({result.errors.length}):</p>
                                <div className="max-h-60 overflow-y-auto bg-gray-900/50 rounded-lg p-3">
                                    <ul className="text-yellow-300 text-sm space-y-1">
                                        {result.errors.map((err: string, idx: number) => (
                                            <li key={idx} className="text-xs">• {err}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {result.columnsFound && (
                            <div className="mt-4">
                                <p className="text-blue-400 font-medium mb-2">Excel Columns Detected:</p>
                                <div className="bg-gray-900/50 rounded-lg p-3">
                                    <p className="text-blue-300 text-xs font-mono">
                                        {result.columnsFound.join(', ')}
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setFile(null);
                                setResult(null);
                                setError('');
                            }}
                            className="mt-6 w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors font-medium"
                        >
                            Upload Another File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
