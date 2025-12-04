import { X } from 'lucide-react';

interface PrivacyPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Jeemail Privacy Policy</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 text-gray-700 dark:text-slate-300 space-y-6 leading-relaxed">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 mb-6">
                        <p className="text-sm">
                            When you use our services, you’re trusting us with your information. We understand this is a big responsibility and work hard to protect your information and put you in control.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Information Jeemail collects</h3>
                    <p>
                        We want you to understand the types of information we collect as you use our services.
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Things you create or provide to us:</strong> When you create a Jeemail Account, you provide us with personal information that includes your name and a password. You also create content when you write emails, upload documents to JeeDrive, or create contact lists.</li>
                        <li><strong>Information we collect as you use our services:</strong> We collect information about the apps, browsers, and devices you use to access Jeemail services.</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6">Why Jeemail collects data</h3>
                    <p>
                        We use data to build better services.
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Provide our services:</strong> We use your information to deliver our services, like processing the terms you search for in order to return results or helping you share content by suggesting recipients from your contacts.</li>
                        <li><strong>Maintain & improve our services:</strong> We also use your information to ensure our services are working as intended, such as tracking outages or troubleshooting issues that you report to us.</li>
                        <li><strong>Develop new services:</strong> We use the information we collect in existing services to help us develop new ones.</li>
                        <li><strong>Measure performance:</strong> We use data for analytics and measurement to understand how our services are used.</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6">Your privacy controls</h3>
                    <p>
                        You have choices regarding the information we collect and how it's used. You can manage your privacy settings in your Jeemail Account at any time.
                    </p>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6">Sharing your information</h3>
                    <p>
                        We do not share your personal information with companies, organizations, or individuals outside of Jeemail except in the following cases:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>With your consent:</strong> We’ll share personal information outside of Jeemail when we have your consent.</li>
                        <li><strong>For legal reasons:</strong> We will share personal information outside of Jeemail if we have a good-faith belief that access, use, preservation, or disclosure of the information is reasonably necessary to meet any applicable law, regulation, legal process, or enforceable governmental request.</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-6">Keeping your information secure</h3>
                    <p>
                        We build security into our services to protect your information. All Jeemail products are built with strong security features that continuously protect your information.
                    </p>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
