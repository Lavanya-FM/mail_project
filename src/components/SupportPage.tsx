import { useState } from 'react';
import { Search, MessageSquare, Server, CheckCircle, AlertCircle, ChevronDown, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SupportPage() {
    const [activeTab, setActiveTab] = useState<'faq' | 'status' | 'contact'>('faq');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

    // Contact Form State
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const faqs = [
        {
            id: 'p2p',
            question: 'How does P2P file transfer work?',
            answer: 'Peer-to-Peer (P2P) transfer sends files directly between devices without storing them on the server. Both the sender and receiver must be online for the transfer to complete. This allows for unlimited file sizes and faster speeds on local networks.'
        },
        {
            id: 'storage',
            question: 'How is my storage quota calculated?',
            answer: 'Your storage quota (1 GB free) includes all emails and attachments stored on our secure cloud servers. P2P transfers do not count towards your storage limit.'
        },
        {
            id: 'credits',
            question: 'What are Carbon Credits?',
            answer: 'You earn Carbon Credits by reducing your digital footprint—archiving old emails, using P2P transfers instead of attachments, and keeping your inbox clean. These credits track your CO2e savings.'
        },
        {
            id: 'security',
            question: 'Is my data secure?',
            answer: 'Yes. All data is encrypted at rest and in transit. P2P transfers are end-to-end encrypted directly between peers.'
        }
    ];

    const filteredFaqs = faqs.filter(f =>
        f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Simulate API call
        setTimeout(() => {
            setIsSubmitting(false);
            toast.success('Support request sent! Ticket #4921');
            setSubject('');
            setMessage('');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                        <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">JeeMail Support Center</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">We're here to help</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 max-w-7xl mx-auto w-full p-6 gap-6">
                {/* Sidebar Navigation */}
                <div className="w-64 flex flex-col gap-2 shrink-0">
                    <button
                        onClick={() => setActiveTab('faq')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'faq'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800'}`}
                    >
                        <Search className="w-4 h-4" />
                        Help Center & FAQ
                    </button>
                    <button
                        onClick={() => setActiveTab('status')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'status'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800'}`}
                    >
                        <Server className="w-4 h-4" />
                        System Status
                    </button>
                    <button
                        onClick={() => setActiveTab('contact')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'contact'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-800'}`}
                    >
                        <Send className="w-4 h-4" />
                        Contact Support
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-white dark:bg-slate-950 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 shadow-sm">

                    {/* FAQ View */}
                    {activeTab === 'faq' && (
                        <div className="space-y-6 max-w-3xl mx-auto">
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">How can we help?</h3>
                                <div className="relative max-w-md mx-auto">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search for answers..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                {filteredFaqs.map(faq => (
                                    <div
                                        key={faq.id}
                                        className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all hover:border-blue-300 dark:hover:border-blue-700"
                                    >
                                        <button
                                            onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                                            className="w-full flex items-center justify-between p-4 bg-gray-50/50 dark:bg-slate-900/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                                        >
                                            <span className="font-semibold text-gray-900 dark:text-gray-100 text-left">{faq.question}</span>
                                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedFaq === faq.id ? 'rotate-180' : ''}`} />
                                        </button>

                                        {expandedFaq === faq.id && (
                                            <div className="p-4 bg-white dark:bg-slate-950 text-gray-600 dark:text-gray-300 text-sm leading-relaxed border-t border-gray-100 dark:border-slate-800">
                                                {faq.answer}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {filteredFaqs.length === 0 && (
                                    <div className="text-center py-12 text-gray-500">
                                        <p>No results found for "{searchQuery}"</p>
                                        <button onClick={() => setActiveTab('contact')} className="text-blue-600 hover:underline mt-2">Contact Support</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status View */}
                    {activeTab === 'status' && (
                        <div className="max-w-2xl mx-auto space-y-8">
                            <div className="text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">All Systems Operational</h3>
                                <p className="text-gray-500 dark:text-gray-400 mt-2">JeeMail services are running normally.</p>
                            </div>

                            <div className="bg-gray-50 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
                                <StatusItem name="Mail Server (SMTP/IMAP)" status="operational" />
                                <div className="h-[1px] bg-gray-200 dark:border-slate-800 mx-4" />
                                <StatusItem name="P2P Signaling Server" status="operational" />
                                <div className="h-[1px] bg-gray-200 dark:border-slate-800 mx-4" />
                                <StatusItem name="Cloud Storage (JeeDrive)" status="operational" />
                                <div className="h-[1px] bg-gray-200 dark:border-slate-800 mx-4" />
                                <StatusItem name="Authentication Service" status="operational" />
                                <div className="h-[1px] bg-gray-200 dark:border-slate-800 mx-4" />
                                <StatusItem name="Video Calling (WebRTC)" status="operational" />
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 text-sm text-blue-800 dark:text-blue-300">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <p>Scheduled maintenance: No upcoming maintenance scheduled.</p>
                            </div>
                        </div>
                    )}

                    {/* Contact View */}
                    {activeTab === 'contact' && (
                        <div className="max-w-xl mx-auto">
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Contact Support</h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                                    <input
                                        required
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                        placeholder="Briefly describe your issue"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                                    <textarea
                                        required
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        rows={6}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                                        placeholder="Please include as much detail as possible..."
                                    />
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-4 h-4" />
                                                Submit Request
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

function StatusItem({ name, status }: { name: string, status: 'operational' | 'degraded' | 'down' }) {
    const colors = {
        operational: 'bg-green-500',
        degraded: 'bg-yellow-500',
        down: 'bg-red-500'
    };

    const labels = {
        operational: 'Operational',
        degraded: 'Degraded Performance',
        down: 'Service Down'
    };

    return (
        <div className="flex items-center justify-between p-4">
            <span className="font-medium text-gray-700 dark:text-gray-200">{name}</span>
            <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${colors[status]} shadow-sm`} />
                <span className="text-sm text-gray-500 dark:text-gray-400">{labels[status]}</span>
            </div>
        </div>
    );
}
