import { useState, useEffect } from 'react';
import { X, Minus, Square } from 'lucide-react';
import { authService } from '../lib/authService';

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActivityItem {
  id: number;
  accessType: string;
  location: string;
  ip: string;
  date: Date;
  isCurrent: boolean;
  details?: string;
  browser?: string;
}

export default function ActivityModal({ isOpen, onClose }: ActivityModalProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [currentIP, setCurrentIP] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Window states
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchActivityData();
    }
  }, [isOpen]);

  const fetchActivityData = async () => {
    setLoading(true);
    try {
      // 1. Get Current Session Info (Client-side)
      let ipData = { ip: 'Unknown' };
      let geoData: any = {};

      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        ipData = await ipResponse.json();

        if (ipData.ip && ipData.ip !== 'Unknown') {
          const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
          geoData = await geoResponse.json();
        }
      } catch (e) {
        console.warn("Failed to fetch IP/Geo data", e);
      }

      setCurrentIP(ipData.ip);
      const locString = geoData.city ? `${geoData.city}, ${geoData.region}` : (geoData.country_name || 'India (TN)');
      setCurrentLocation(`${locString}`);

      // 2. Fetch Backend Activity Logs
      const backendLogs = await authService.getRecentActivity();

      const mappedLogs: ActivityItem[] = backendLogs.map((log, index) => {
        const isCurrent = log.ip === ipData.ip; // Simple check for now

        // Parse access type for better display if needed, or just use what we have
        let displayAccessType = "Browser (Chrome)"; // Defaulting for now as backend sends generic "Login" usually
        if (log.access_type && log.access_type !== 'Unknown') {
          displayAccessType = log.access_type;
        }

        return {
          id: index,
          accessType: displayAccessType,
          location: log.location && log.location !== 'Unknown' ? log.location : `${geoData.country_name || 'India (TN)'} (${log.ip})`,
          ip: log.ip || 'Unknown',
          date: new Date(log.date),
          isCurrent: index === 0 && isCurrent, // Assuming most recent and IP match
          details: log.details || `User Agent: ${navigator.userAgent}`, // Fallback details
          browser: "Chrome" // Simplified
        };
      });

      // Ensure we have at least one entry if empty
      if (mappedLogs.length === 0) {
        mappedLogs.push({
          id: 0,
          accessType: "Browser (Chrome)",
          location: `${locString} (${ipData.ip})`,
          ip: ipData.ip,
          date: new Date(),
          isCurrent: true,
          details: `User Agent: ${navigator.userAgent}`,
          browser: "Chrome"
        });
      }

      setActivities(mappedLogs);

    } catch (error) {
      console.error('Error fetching activity data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDetails = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateString = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (diffDays > 0) {
      return `${dateString} (${diffDays} day${diffDays > 1 ? 's' : ''} ago)`;
    }
    if (diffHours > 0) {
      return `${timeString} (${diffHours} hour${diffHours > 1 ? 's' : ''} ago)`; // e.g. 10:41 am (1.5 hours ago) - keeping simple for now
    }
    return `${timeString} (${diffMins} minutes ago)`;
  };

  if (!isOpen) return null;

  // Dynamic classes for window state
  const containerClasses = isMaximized
    ? "bg-white shadow-2xl border border-gray-400 flex flex-col font-sans text-[13px] rounded-none w-full h-full fixed inset-0 m-0"
    : `bg-white shadow-2xl border border-gray-400 flex flex-col font-sans text-[13px] rounded-none ${isMinimized ? 'w-[300px] h-auto fixed bottom-0 left-10 rounded-t-lg' : 'w-[800px] h-[600px] relative'}`;

  // If minimized, we assume it's like a taskbar item or minimized window at bottom
  // Backdrop: if minimized, we remove backdrop pointer events so user can interact with app? 
  // But usually modals block interaction. Let's keep it blocking but minimal visual footprint.

  return (
    <div className={`fixed inset-0 bg-transparent flex ${isMinimized ? 'items-end justify-start pointer-events-none' : (isMaximized ? 'items-start justify-start' : 'items-center justify-center')} z-50 animate-in fade-in duration-200`}>
      <div className={`${containerClasses} pointer-events-auto transition-all duration-200`}>

        {/* Header - Classic Style with Controls */}
        <div
          className="bg-[#e8f0fe] px-4 py-3 flex items-center justify-between border-b border-gray-300 select-none"
          onDoubleClick={() => !isMinimized && setIsMaximized(!isMaximized)}
        >
          <div className="flex-1 overflow-hidden whitespace-nowrap overflow-ellipsis">
            {!isMinimized && (
              <>
                <h1 className="text-lg font-normal text-black">
                  Activity on this account
                </h1>
                <div className="text-black mt-1 text-xs">
                  This feature provides information about the last activity on this mail account and any concurrent activity.
                  <br />
                  <a href="#" className="text-blue-700 hover:underline">Learn more</a>
                </div>
              </>
            )}
            {isMinimized && (
              <span className="font-bold text-black px-2">Activity on this account</span>
            )}
          </div>

          <div className="flex items-center gap-1 self-start ml-4">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-300 rounded text-gray-600"
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => {
                setIsMinimized(false);
                setIsMaximized(!isMaximized);
              }}
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-300 rounded text-gray-600"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <Square size={12} fill={isMaximized ? "currentColor" : "none"} className={isMaximized ? "text-gray-600 opacity-50" : ""} />
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center hover:bg-red-500 hover:text-white rounded text-gray-600 ml-1"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content - Hidden if Minimized */}
        {!isMinimized && (
          <>
            <div className="flex-1 overflow-y-auto p-4 bg-white">

              <p className="mb-4 text-black">
                This account does not seem to be open in any other location. However, there may be sessions that have not been signed out.
              </p>

              <div className="mb-4">
                <span className="text-black">Visit </span>
                <a href="#" className="text-blue-700 hover:underline">Security Checkup</a>
                <span className="text-black"> for more details</span>
              </div>

              <h2 className="font-bold text-black mb-2">Recent activity:</h2>

              <div className="border border-black overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-[#e8f0fe] border-b border-black">
                      <th className="p-1 border-r border-black font-semibold text-black align-top w-1/3">
                        Access Type [ <span className="text-blue-700 cursor-pointer">?</span> ]<br />
                        <span className="font-normal">(Browser, mobile, POP3, etc.)</span>
                      </th>
                      <th className="p-1 border-r border-black font-semibold text-black align-top w-1/3">
                        Location (IP address) [ <span className="text-blue-700 cursor-pointer">?</span> ]
                      </th>
                      <th className="p-1 font-semibold text-black align-top w-1/3">
                        Date/Time<br />
                        <span className="font-normal">(Displayed in your time zone)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <tr key={activity.id} className="border-b border-black last:border-b-0">
                        <td className="p-1 border-r border-black align-top">
                          <div className="text-black">
                            {activity.accessType}
                            <button
                              onClick={() => toggleDetails(activity.id)}
                              className="ml-2 text-blue-700 hover:underline cursor-pointer bg-transparent border-none p-0 inline"
                            >
                              Show details
                            </button>
                            {expandedIds.has(activity.id) && (
                              <div className="mt-2 p-2 bg-gray-100 border border-gray-300 text-xs shadow-sm">
                                {activity.details}
                                <br />
                                <button
                                  onClick={() => toggleDetails(activity.id)}
                                  className="text-blue-700 hover:underline mt-1"
                                >
                                  Hide details
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-1 border-r border-black align-top">
                          <div className="text-black">
                            {activity.isCurrent && <span className="font-bold">* </span>}
                            {activity.location}
                          </div>
                        </td>
                        <td className="p-1 align-top">
                          <div className="text-black">
                            {formatTimeAgo(activity.date)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-gray-600 text-[12px]">
                <p>* indicates activity from the current session.</p>
                <p className="mt-2">This computer is using IP address {currentIP}. ({currentLocation})</p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-2 bg-white border-t border-gray-300 flex justify-center sticky bottom-0">
              <button onClick={onClose} className="border border-gray-400 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-black text-sm font-medium shadow-sm">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
