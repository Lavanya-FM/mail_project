import { useState, useEffect } from 'react';
import { Leaf, TrendingUp, Award, Share2, Download } from 'lucide-react';
import {
  calculateCarbonMetrics,
  getBadgeTierForCredits,
  getProgressToNextTier,
  formatCarbonCredits,
  formatCO2eSavings,
  CARBON_BADGE_TIERS,
} from '../lib/carbonService';

interface CarbonBadgesProps {
  storageSavedGB?: number;
  dataTransferReducedGB?: number;
  networkType?: 'internet' | 'mobile' | 'wifi';
}

export default function CarbonBadges({
  storageSavedGB = 500,
  dataTransferReducedGB = 1000,
  networkType = 'internet',
}: CarbonBadgesProps) {
  const [metrics, setMetrics] = useState(calculateCarbonMetrics(storageSavedGB, dataTransferReducedGB, networkType));
  const [currentBadge, setCurrentBadge] = useState(getBadgeTierForCredits(metrics.carbonCreditsEarned));
  const [progress, setProgress] = useState(getProgressToNextTier(metrics.carbonCreditsEarned));
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submittedCredits, setSubmittedCredits] = useState(0);

  useEffect(() => {
    const newMetrics = calculateCarbonMetrics(storageSavedGB, dataTransferReducedGB, networkType);
    setMetrics(newMetrics);
    setCurrentBadge(getBadgeTierForCredits(newMetrics.carbonCreditsEarned));
    setProgress(getProgressToNextTier(newMetrics.carbonCreditsEarned));
  }, [storageSavedGB, dataTransferReducedGB, networkType]);

  const handleSubmitToGovernment = () => {
    setShowSubmitModal(true);
  };

  const confirmSubmission = () => {
    setSubmittedCredits(metrics.carbonCreditsEarned);
    setShowSubmitModal(false);
    alert(`Successfully submitted ${formatCarbonCredits(metrics.carbonCreditsEarned)} carbon credits to government registry!`);
  };

  return (
    <div className="space-y-6">
      {/* Main Carbon Badge Display */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
        {/* Current Badge */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-2">
              Current Achievement
            </h3>
            <p className="text-3xl font-bold text-green-700 dark:text-green-400 mb-1">
              {currentBadge.icon} {currentBadge.tier}
            </p>
            <p className="text-sm text-gray-600 dark:text-slate-400">{currentBadge.description}</p>
          </div>
          <div className={`bg-gradient-to-br ${currentBadge.color} p-8 rounded-full shadow-lg`}>
            <span className="text-5xl">{currentBadge.icon}</span>
          </div>
        </div>

        {/* Carbon Credits Display */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
            <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Carbon Credits</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCarbonCredits(metrics.carbonCreditsEarned)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
            <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">CO₂e Saved</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCO2eSavings(metrics.totalCO2eSavedKg)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
            <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Status</p>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {Math.round(progress.percentage)}%
            </p>
          </div>
        </div>

        {/* Progress to Next Tier */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">Progress to Next Tier</span>
            <span className="text-xs text-gray-600 dark:text-slate-400">
              {formatCarbonCredits(progress.current)} / {formatCarbonCredits(progress.next)}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className={`bg-gradient-to-r ${currentBadge.color} h-2 rounded-full transition-all duration-500`}
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Metrics Breakdown */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <Leaf className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span>Storage: {metrics.storageSavedGB} GB-month</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Data: {metrics.dataTransferReducedGB} GB</span>
          </div>
        </div>
      </div>

      {/* Government Submission Section */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Government Carbon Registry</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">Submit your carbon credits for official recognition</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Available to Submit</span>
            <span className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCarbonCredits(metrics.carbonCreditsEarned - submittedCredits)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
            <span>Already Submitted</span>
            <span>{formatCarbonCredits(submittedCredits)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmitToGovernment}
            disabled={metrics.carbonCreditsEarned - submittedCredits <= 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
          >
            <Share2 className="w-4 h-4" />
            Submit to Government
          </button>
          <button
            onClick={() => {
              const data = {
                credits: metrics.carbonCreditsEarned,
                co2eSaved: metrics.totalCO2eSavedKg,
                timestamp: new Date().toISOString(),
              };
              const element = document.createElement('a');
              element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`);
              element.setAttribute('download', `carbon-credits-${Date.now()}.json`);
              element.style.display = 'none';
              document.body.appendChild(element);
              element.click();
              document.body.removeChild(element);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-900 dark:text-white rounded-lg font-medium transition"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Badge Tier System */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-4">
          Badge Tier System
        </h3>
        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {CARBON_BADGE_TIERS.map((tier) => {
            const isCurrentOrPassed = metrics.carbonCreditsEarned >= tier.minCredits;
            const isCurrent = metrics.carbonCreditsEarned >= tier.minCredits && metrics.carbonCreditsEarned < tier.maxCredits;

            return (
              <div
                key={tier.tier}
                className={`rounded-lg p-3 border-2 transition ${
                  isCurrent
                    ? `border-green-500 bg-green-50 dark:bg-green-900/20`
                    : isCurrentOrPassed
                    ? `border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 opacity-75`
                    : `border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/30 opacity-50`
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{tier.icon}</span>
                  {isCurrent && <span className="text-xs font-bold text-green-600 dark:text-green-400">CURRENT</span>}
                  {isCurrentOrPassed && !isCurrent && <span className="text-xs font-bold text-gray-600 dark:text-slate-400">EARNED</span>}
                </div>
                <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">{tier.tier}</p>
                <p className="text-xs text-gray-600 dark:text-slate-400 mb-2">{tier.description}</p>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {formatCarbonCredits(tier.minCredits)} - {tier.maxCredits === Infinity ? '∞' : formatCarbonCredits(tier.maxCredits)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Submission Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Submit Carbon Credits to Government
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              You are about to submit <span className="font-bold text-green-600 dark:text-green-400">
                {formatCarbonCredits(metrics.carbonCreditsEarned - submittedCredits)}
              </span> carbon credits to the official government registry.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                ✓ This action is permanent and cannot be undone.
              </p>
              <p className="text-sm text-blue-900 dark:text-blue-300 mt-2">
                ✓ Your credits will be registered in the official carbon offset registry.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 px-4 py-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmission}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
