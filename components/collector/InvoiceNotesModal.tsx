'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface InvoiceNote {
    id: string;
    note: string;
    created_at: string;
    users: {
        full_name: string;
        role: string;
    };
}

interface InvoiceNotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    customerName: string;
}

export default function InvoiceNotesModal({
    isOpen,
    onClose,
    invoiceId,
    customerName
}: InvoiceNotesModalProps) {
    const [notes, setNotes] = useState<InvoiceNote[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchNotes();
        }
    }, [isOpen, invoiceId]);

    const fetchNotes = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('invoice_notes')
                .select('id, note, created_at, user_id')
                .eq('invoice_id', invoiceId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // Fetch user details separately from user_profiles
            if (data && data.length > 0) {
                const userIds = data.map(note => note.user_id);
                const { data: userProfiles } = await supabase
                    .from('user_profiles')
                    .select('id, full_name, role')
                    .in('id', userIds);

                // Map user profiles to notes
                const notesWithUsers = data.map(note => {
                    const userProfile = userProfiles?.find(u => u.id === note.user_id);
                    return {
                        id: note.id,
                        note: note.note,
                        created_at: note.created_at,
                        users: {
                            full_name: userProfile?.full_name || 'Unknown User',
                            role: userProfile?.role || 'user'
                        }
                    };
                });
                
                setNotes(notesWithUsers);
            } else {
                setNotes([]);
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;

        setIsSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('invoice_notes')
                .insert({
                    invoice_id: invoiceId,
                    user_id: user.id,
                    note: newNote.trim()
                });

            if (error) throw error;

            setNewNote('');
            fetchNotes();
        } catch (error) {
            console.error('Error adding note:', error);
            alert('Failed to add note');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!confirm('Delete this note?')) return;

        try {
            const { error } = await supabase
                .from('invoice_notes')
                .delete()
                .eq('id', noteId);

            if (error) throw error;
            fetchNotes();
        } catch (error) {
            console.error('Error deleting note:', error);
            alert('Failed to delete note');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] border border-purple-900/50 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.15)] w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="relative p-5 border-b border-gray-800/50">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-violet-600/10 to-purple-600/10" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                                <MessageSquare className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Invoice Notes</h2>
                                <p className="text-xs text-gray-400">{customerName}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Add Note Form */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Add Note
                        </label>
                        <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="e.g., Customer requested extension until Feb 15..."
                            rows={3}
                            className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                        />
                        <button
                            onClick={handleAddNote}
                            disabled={!newNote.trim() || isSaving}
                            className="mt-3 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Add Note
                                </>
                            )}
                        </button>
                    </div>

                    {/* Notes List */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-3">Previous Notes</h3>
                        {isLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                            </div>
                        ) : notes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                No notes yet
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {notes.map((note) => (
                                    <div
                                        key={note.id}
                                        className="bg-gray-900/30 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <p className="text-white text-sm mb-2">{note.note}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span className="text-purple-400">
                                                        {(note.users as any)?.full_name || 'Unknown'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>
                                                        {new Date(note.created_at).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                                title="Delete note"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800/50 bg-[#0a0a0a]">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
