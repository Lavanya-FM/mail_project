import { X } from 'lucide-react';

interface TermsOfServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TermsOfServiceModal({ isOpen, onClose }: TermsOfServiceModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Jeemail Terms of Service</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 text-gray-700 dark:text-slate-300 space-y-6 leading-relaxed">
                    <p>
                        We know it’s tempting to skip these Terms of Service, but it’s important to establish what you can expect from us as you use Jeemail services, and what we expect from you.
                    </p>
                    <p>
                        These Terms of Service reflect the way Jeemail’s business works, the laws that apply to our company, and certain things we’ve always believed to be true. As a result, these Terms of Service help define Jeemail’s relationship with you as you interact with our services. For example, these terms include the following topic headings:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>What you can expect from us</strong>, which describes how we provide and develop our services</li>
                        <li><strong>What we expect from you</strong>, which establishes certain rules for using our services</li>
                        <li><strong>Content in Jeemail services</strong>, which describes the intellectual property rights to the content you find in our services — whether that content belongs to you, Jeemail, or others</li>
                        <li><strong>In case of problems or disagreements</strong>, which describes other legal rights you have, and what to expect in case someone violates these terms</li>
                    </ul>
                    <p>
                        Understanding these terms is important because, by accessing or using our services, you’re agreeing to these terms.
                    </p>
                    <p>
                        Besides these terms, we also publish a Privacy Policy. Although it’s not part of these terms, we encourage you to read it to better understand how you can update, manage, export, and delete your information.
                    </p>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-8">Terms</h3>

                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4">Service provider</h4>
                    <p>Jeemail services are provided by, and you’re contracting with:</p>
                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700">
                        <p className="font-semibold">Jeemail LLC</p>
                        <p>organized under the laws of the State of Delaware, USA, and operating under the laws of the USA</p>
                        <br />
                        <p>1600 Amphitheatre Parkway</p>
                        <p>Mountain View, California 94043</p>
                        <p>USA</p>
                    </div>

                    <h4 className="text-lg font-medium text-gray-900 dark:text-white mt-4">Age requirements</h4>
                    <p>
                        If you’re under the age required to manage your own Jeemail Account, you must have your parent or legal guardian’s permission to use a Jeemail Account. Please have your parent or legal guardian read these terms with you.
                    </p>
                    <p>
                        If you’re a parent or legal guardian, and you allow your child to use the services, then these terms apply to you and you’re responsible for your child’s activity on the services.
                    </p>
                    <p>
                        Some Jeemail services have additional age requirements as described in their service-specific additional terms and policies.
                    </p>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-sm"
                    >
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
}
