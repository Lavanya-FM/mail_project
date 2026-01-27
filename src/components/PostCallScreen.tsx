
import { useState, useEffect } from 'react';
import { RotateCcw, Shield } from 'lucide-react';

interface PostCallScreenProps {
    onRejoin: () => void;
    onReturnToHome: () => void;
}

export default function PostCallScreen({ onRejoin, onReturnToHome }: PostCallScreenProps) {
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onReturnToHome();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [onReturnToHome]);

    return (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center font-sans text-[#202124]">
            <div className="flex flex-col items-center max-w-md w-full px-4 text-center animate-fade-in-up">
                <div className="mb-6 relative">
                    <div className="w-16 h-16 rounded-full border-[3px] border-blue-600 flex items-center justify-center text-blue-600 font-bold text-lg">
                        {timeLeft}
                    </div>
                    <svg className="absolute top-0 left-0 w-16 h-16 -rotate-90 pointer-events-none hidden">
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="#e8eaed"
                            strokeWidth="3"
                        />
                        <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="#1a73e8"
                            strokeWidth="3"
                            strokeDasharray="175.9"
                            strokeDashoffset={175.9 * (1 - timeLeft / 60)}
                            className="transition-all duration-1000 ease-linear"
                        />
                    </svg>
                </div>

                <h1 className="text-4xl font-normal mb-8">You left the meeting</h1>

                <div className="flex gap-3 mb-8">
                    <button
                        onClick={onRejoin}
                        className="px-6 py-2.5 rounded-full border border-gray-300 font-medium text-[#1a73e8] hover:bg-blue-50 hover:border-blue-100 transition-colors flex items-center gap-2"
                    >
                        <RotateCcw size={18} />
                        Rejoin
                    </button>
                    <button
                        onClick={onReturnToHome}
                        className="px-6 py-2.5 rounded-full bg-[#1a73e8] text-white font-medium hover:bg-[#1557b0] transition-colors shadow-sm flex items-center gap-2"
                    >
                        Return to home screen
                    </button>
                </div>

                <div className="text-sm text-[#5f6368] mb-12">
                    <button className="hover:text-[#1a73e8] font-medium" onClick={() => window.location.reload()}>
                        Submit feedback
                    </button>
                </div>

                <div className="bg-white border border-[#dadce0] rounded-lg p-6 w-full text-left shadow-sm flex gap-4 items-start max-w-[400px]">
                    <div className="text-[#1a73e8] mt-1">
                        <Shield className="fill-current w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-base font-medium mb-1 text-[#202124]">Your meeting is safe</h3>
                        <p className="text-sm text-[#5f6368] leading-relaxed mb-3">
                            No one can join a meeting unless invited or admitted by the host
                        </p>
                        <button className="text-[#1a73e8] text-sm font-medium hover:underline">
                            Learn more
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
