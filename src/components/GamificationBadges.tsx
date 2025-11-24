import { useState, useEffect } from 'react';
import { Leaf, TrendingUp, Info, X } from 'lucide-react';
import { calculateCarbonMetrics, getBadgeTierForCredits, getProgressToNextTier, formatCarbonCredits, formatCO2eSavings } from '../lib/carbonService';
import { authService } from '../lib/authService';
import { emailService } from '../lib/emailService';

export default function GamificationBadges() {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [metrics, setMetrics] = useState({ storageSavedGB: 0, dataTransferReducedGB: 0, totalCO2eSavedKg: 0, carbonCreditsEarned: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateRealMetrics = async () => {
      try {
        const profile = authService.getCurrentUser();
        if (!profile) {
          setLoading(false);
          return;
        }

        // Get user's emails to calculate real metrics
        const { data: emails } = await emailService.getEmails(profile.id);
        
        // Calculate storage saved (based on email count and average size)
        const emailCount = emails?.length || 0;
        const avgEmailSize = 0.05; // 50KB average per email
        const storageSavedGB = (emailCount * avgEmailSize) / 1024;

        // Calculate data transfer reduced (based on attachments)
        const emailsWithAttachments = emails?.filter(e => e.has_attachments)?.length || 0;
        const avgAttachmentSize = 2; // 2MB average
        const dataTransferReducedGB = (emailsWithAttachments * avgAttachmentSize) / 1024;

        // Calculate real carbon metrics
        const realMetrics = calculateCarbonMetrics(storageSavedGB, dataTransferReducedGB, 'internet');
        setMetrics(realMetrics);
      } catch (error) {
        console.error('Error calculating carbon metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    calculateRealMetrics();
  }, []);

  const currentBadge = getBadgeTierForCredits(metrics.carbonCreditsEarned);
  const progress = getProgressToNextTier(metrics.carbonCreditsEarned);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 mb-3">
          <Leaf className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h3 className="text-sm font-semibold text-green-900 dark:text-green-300">Carbon Credits</h3>
        </div>
        <div className="h-20 bg-white dark:bg-slate-800 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Carbon Credits Section */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-semibold text-green-900 dark:text-green-300">Carbon Credits</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfoModal(true)}
              className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50 rounded-full transition"
              title="Learn about carbon credits"
            >
              <Info className="w-4 h-4" />
            </button>
            <div className={`bg-gradient-to-br ${currentBadge.color} px-3 py-1 rounded-full text-white text-xs font-bold`}>
              {currentBadge.icon} {currentBadge.tier}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-gray-600 dark:text-slate-400">Credits</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCarbonCredits(metrics.carbonCreditsEarned)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-gray-600 dark:text-slate-400">CO₂e Saved</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCO2eSavings(metrics.totalCO2eSavedKg)}
            </p>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-700 dark:text-slate-300">Progress to Next Tier</span>
            <span className="text-xs text-gray-600 dark:text-slate-400">{Math.round(progress.percentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className={`bg-gradient-to-r ${currentBadge.color} h-1.5 rounded-full transition-all duration-500`}
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
          <TrendingUp className="w-3 h-3" />
          <span>{currentBadge.description}</span>
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-bold text-white">🌍 Carbon Credits Explained</h2>
                <p className="text-green-100">Understand how you're helping the planet</p>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 text-white hover:bg-white/20 rounded-full transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* What are Carbon Credits */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">What are Carbon Credits?</h3>
                <p className="text-gray-700 dark:text-slate-300 mb-3">
                  Carbon credits represent the amount of CO₂ equivalent (CO₂e) you've saved by reducing your environmental impact. Each credit equals 1 ton of CO₂e reduced.
                </p>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-900 dark:text-green-300">
                    <strong>1 Carbon Credit = 1 Ton of CO₂e = 1000 kg of CO₂e</strong>
                  </p>
                </div>
              </div>

              {/* How You Earn Credits */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">How You Earn Carbon Credits</h3>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Reduce Cloud Storage</p>
                      <p className="text-sm text-gray-600 dark:text-slate-400">Archive old emails and delete unnecessary files</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Formula: Storage (GB) × 0.001 = kg CO₂e</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Reduce Data Transfer</p>
                      <p className="text-sm text-gray-600 dark:text-slate-400">Send smaller attachments, use links instead</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Formula: Data (GB) × 0.01 = kg CO₂e</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Your Current Status */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Your Current Status</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Credits Earned</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatCarbonCredits(metrics.carbonCreditsEarned)}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">CO₂e Saved</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCO2eSavings(metrics.totalCO2eSavedKg)}
                    </p>
                  </div>
                  <div className={`bg-gradient-to-br ${currentBadge.color} rounded-lg p-4 text-white`}>
                    <p className="text-xs text-white/80 uppercase tracking-wider mb-1">Current Tier</p>
                    <p className="text-2xl font-bold">
                      {currentBadge.icon} {currentBadge.tier}
                    </p>
                  </div>
                </div>
              </div>

              {/* Badge Tiers */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Badge Tier System</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <span className="font-medium text-amber-900 dark:text-amber-300">🥉 Bronze</span>
                    <span className="text-sm text-amber-700 dark:text-amber-400">0 - 0.5 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-900 dark:text-white">🥈 Silver</span>
                    <span className="text-sm text-gray-600 dark:text-slate-400">0.5 - 2 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <span className="font-medium text-yellow-900 dark:text-yellow-300">🏆 Gold</span>
                    <span className="text-sm text-yellow-700 dark:text-yellow-400">2 - 5 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                    <span className="font-medium text-cyan-900 dark:text-cyan-300">💎 Platinum</span>
                    <span className="text-sm text-cyan-700 dark:text-cyan-400">5 - 10 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="font-medium text-blue-900 dark:text-blue-300">💠 Diamond</span>
                    <span className="text-sm text-blue-700 dark:text-blue-400">10 - 20 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <span className="font-medium text-purple-900 dark:text-purple-300">🎯 Ace</span>
                    <span className="text-sm text-purple-700 dark:text-purple-400">20 - 40 credits</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <span className="font-medium text-red-900 dark:text-red-300">👑 Ace Master</span>
                    <span className="text-sm text-red-700 dark:text-red-400">40+ credits</span>
                  </div>
                </div>
              </div>

              {/* Submit to Government */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Submit to Government</h3>
                <p className="text-gray-700 dark:text-slate-300 mb-3">
                  You can submit your carbon credits to official government carbon registries for official recognition and potential rewards.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    ✓ Visit your profile to submit your credits to the government registry
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Tips to Earn More Credits</h3>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
                  <li className="flex gap-2">
                    <span className="text-green-600 dark:text-green-400">✓</span>
                    <span>Archive old emails regularly</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 dark:text-green-400">✓</span>
                    <span>Use cloud links instead of attachments</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 dark:text-green-400">✓</span>
                    <span>Compress files before sending</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 dark:text-green-400">✓</span>
                    <span>Optimize images and use efficient formats</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 dark:text-green-400">✓</span>
                    <span>Use P2P distribution for large emails</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
