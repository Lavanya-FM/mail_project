/**
 * CallButton.tsx
 * Button to initiate a call from email thread
 */

import { Phone } from 'lucide-react';

interface CallButtonProps {
    recipientEmail: string;
    threadId?: string;
    onCall: (recipientEmail: string, threadId?: string) => void;
    disabled?: boolean;
    className?: string;
}

export default function CallButton({
    recipientEmail,
    threadId,
    onCall,
    disabled = false,
    className = ''
}: CallButtonProps) {
    const handleClick = () => {
        if (!disabled) {
            onCall(recipientEmail, threadId);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
        bg-green-500 hover:bg-green-600 text-white
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors ${className}`}
            title={`Call ${recipientEmail}`}
        >
            <Phone size={16} />
            <span className="text-sm font-medium">Call</span>
        </button>
    );
}
