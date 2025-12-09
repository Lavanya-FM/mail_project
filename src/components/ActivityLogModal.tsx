import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function ActivityModal({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [currentIP, setCurrentIP] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchActivityData();
    }
  }, [isOpen]);

  const fetchActivityData = async () => {
    setLoading(true);
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      setCurrentIP(ipData.ip);

      const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
      const geoData = await geoResponse.json();

      const browserInfo = getBrowserInfo();
      const deviceType = getDeviceType();

      const currentSession = {
        id: 'current',
        accessType: browserInfo.name,
        deviceType: deviceType,
        location: `${geoData.city || geoData.region || 'Unknown'}, ${geoData.country_name || geoData.country_code || 'Unknown'}`,
        ip: ipData.ip,
        timestamp: new Date(),
        isCurrent: true,
        userAgent: navigator.userAgent,
        browser: browserInfo.name,
        browserVersion: browserInfo.version,
        os: getOS(),
      };

      const storedSessions = getStoredSessions();
      
      setSessions([currentSession, ...storedSessions]);
      storeSession(currentSession);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      const basicSession = {
        id: 'current',
        accessType: 'Browser',
        deviceType: 'Desktop',
        location: 'Unknown Location',
        ip: 'Unavailable',
        timestamp: new Date(),
        isCurrent: true,
        userAgent: navigator.userAgent,
        browser: getBrowserInfo().name,
        os: getOS(),
      };
      setSessions([basicSession]);
    } finally {
      setLoading(false);
    }
  };

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    let name = 'Browser';
    let version = '';

    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      name = 'Chrome';
      version = ua.match(/Chrome\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Firefox')) {
      name = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      name = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || '';
    } else if (ua.includes('Edg')) {
      name = 'Edge';
      version = ua.match(/Edg\/(\d+)/)?.[1] || '';
    }

    return { name, version };
  };

  const getOS = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  };

  const getDeviceType = () => {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'Tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'Mobile';
    }
    return 'Desktop';
  };

  const getStoredSessions = () => {
    // Store sessions in memory instead of localStorage
    return [];
  };

  const storeSession = (session) => {
    // Memory-only storage - no localStorage used
  };

  const toggleSession = (id) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatTimestamp = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '0 minutes ago';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) {
      const time = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      return `${time} (${diffHours} hour${diffHours > 1 ? 's' : ''} ago)`;
    }
    if (diffDays < 7) {
      const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${monthDay} (${diffDays} day${diffDays > 1 ? 's' : ''} ago)`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
          <h2 className="text-base font-normal text-gray-900 dark:text-white">
            Activity on this account
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-500 mx-auto mb-4"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading activity data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Info Alert */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 mb-4">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="mb-2">
                    This feature provides information about the last activity on this mail account and any concurrent activity.
                  </p>
                  <p>
                    Visit <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Security Checkup</a> for more details
                  </p>
                </div>
              </div>

              {/* Status Message */}
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                This account does not seem to be open in any other location. However, there may be sessions that have not been signed out.
              </p>

              {/* Activity Table */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Recent activity:
                </h3>

                <div className="border border-gray-300 dark:border-gray-600 overflow-hidden">
                  {/* Table Header */}
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 border-b border-gray-300 dark:border-gray-600">
                    <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                      <div className="col-span-3">Access Type [ ? ]</div>
                      <div className="col-span-5">Location (IP address) [ ? ]</div>
                      <div className="col-span-4">Date/Time</div>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      (Displayed in your time zone)
                    </div>
                  </div>

                  {/* Sessions */}
                  {sessions.map((session, index) => (
                    <div 
                      key={session.id} 
                      className={`${index !== sessions.length - 1 ? 'border-b border-gray-300 dark:border-gray-600' : ''}`}
                    >
                      <div className="grid grid-cols-12 gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="col-span-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-900 dark:text-white">
                                Browser ({session.browser})
                              </span>
                              <button
                                onClick={() => toggleSession(session.id)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-normal"
                              >
                                Show details
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-span-5">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              {session.isCurrent && (
                                <span className="text-red-600 dark:text-red-400 text-sm">* </span>
                              )}
                              <span className="text-sm text-gray-900 dark:text-white">
                                {session.location}
                              </span>
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              ({session.ip})
                            </span>
                          </div>
                        </div>
                        
                        <div className="col-span-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {formatTimestamp(session.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {expandedSessions.has(session.id) && (
                        <div className="bg-white dark:bg-gray-900 px-3 py-3 border-t border-gray-300 dark:border-gray-600">
                          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                            <p><span className="font-semibold">Browser:</span> {session.browser} {session.browserVersion}</p>
                            <p><span className="font-semibold">Operating System:</span> {session.os}</p>
                            <p><span className="font-semibold">Device Type:</span> {session.deviceType}</p>
                            <p className="break-all"><span className="font-semibold">User Agent:</span> {session.userAgent}</p>
                          </div>
                          <button
                            onClick={() => toggleSession(session.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
                          >
                            Hide details
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Info */}
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <p>
                  <span className="text-red-600 dark:text-red-400">*</span> indicates activity from the current session.
                </p>
                <p>
                  This computer is using IP address {currentIP}. ({sessions[0]?.location || 'Unknown Location'})
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// Demo wrapper
function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center p-4">
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-lg"
      >
        Open Activity Modal
      </button>
      
      <ActivityModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
