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
        let timer: any;

        const playBeep = (count: number) => {
            if (ctx.state === 'suspended') ctx.resume();

            const now = ctx.currentTime;

            // First tone
            const osc1 = ctx.createOscillator();
            const g1 = ctx.createGain();
            osc1.connect(g1);
            g1.connect(ctx.destination);
            osc1.frequency.setValueAtTime(count % 2 === 0 ? 440 : 480, now);
            g1.gain.setValueAtTime(0, now);
            g1.gain.linearRampToValueAtTime(0.1, now + 0.1);
            g1.gain.linearRampToValueAtTime(0, now + 0.4);
            osc1.start(now);
            osc1.stop(now + 0.5);

            // Second tone (harmonic)
            const osc2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            osc2.connect(g2);
            g2.connect(ctx.destination);
            osc2.frequency.setValueAtTime(count % 2 === 0 ? 880 : 960, now);
            g2.gain.setValueAtTime(0, now);
            g2.gain.linearRampToValueAtTime(0.05, now + 0.1);
            g2.gain.linearRampToValueAtTime(0, now + 0.4);
            osc2.start(now);
            osc2.stop(now + 0.5);
        };

        let count = 0;
        playBeep(count++);
        timer = setInterval(() => playBeep(count++), 1000);

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
