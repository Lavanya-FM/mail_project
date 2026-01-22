/**
 * IncomingCall.tsx
 * Incoming call notification UI
 */

import React from 'react';
import { Phone, PhoneOff, User } from 'lucide-react';

interface IncomingCallProps {
    caller: string;
    onAccept: () => void;
    onReject: () => void;
}

export default function IncomingCall({ caller, onAccept, onReject }: IncomingCallProps) {
    React.useEffect(() => {
        // Play ringtone
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        let oscillator: OscillatorNode;
        let gain: GainNode;
        let timer: any;

        const playBeep = () => {
            if (ctx.state === 'suspended') ctx.resume();

            oscillator = ctx.createOscillator();
            gain = ctx.createGain();

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.5);
        };

        playBeep();
        timer = setInterval(playBeep, 1000);

        return () => {
            clearInterval(timer);
            if (ctx) ctx.close();
        };
    }, []);

    return (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4 w-80">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <User className="text-blue-600 dark:text-blue-400" size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Incoming call</p>
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {caller}
                        </p>
                    </div>
                </div>

                {/* Ringing animation */}
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-green-500 animate-ping absolute opacity-75"></div>
                        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center relative">
                            <Phone className="text-white" size={28} />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onReject}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg
              bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                    >
                        <PhoneOff size={20} />
                        Decline
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg
              bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                    >
                        <Phone size={20} />
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
