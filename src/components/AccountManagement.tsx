import React, { useState, useEffect } from 'react';
import { 
  Home, 
  User, 
  ShieldCheck, 
  Key, 
  Grid, 
  Lock, 
  Users, 
  CreditCard, 
  Cloud, 
  ArrowLeft,
  Camera,
  ChevronRight,
  Info,
  Calendar,
  Smartphone,
  MapPin,
  Clock
} from 'lucide-react';
import { authService } from '../lib/authService';
import { toast } from 'react-hot-toast';

interface AccountManagementProps {
  onBack: () => void;
  currentUser: any;
}

type ActiveTab = 'home' | 'personal' | 'security' | 'password' | 'apps' | 'privacy' | 'people' | 'payments' | 'storage';

export default function AccountManagement({ onBack, currentUser }: AccountManagementProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [userData, setUserData] = useState<any>(currentUser);
  const [loading, setLoading] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const handleOpenEditor = (field: string, currentVal: any = '') => {
    setEditField(field);
    setEditValue(currentVal || '');
  };

  const renderEditor = () => {
    if (!editField) return null;

    const label = editField.replace('_', ' ');
    const isDate = editField === 'birthday';
    const isGender = editField === 'gender';
    const isAvatar = editField === 'avatar_url';

    return (
      <div className="fixed inset-0 bg-black/50 z-[11000] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
           <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-medium text-gray-900 capitalize">Update {label}</h3>
              <button onClick={() => setEditField(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                 <ArrowLeft className="w-5 h-5 rotate-90" />
              </button>
           </div>
           <div className="p-6">
              {isGender ? (
                <div className="space-y-2">
                   {['Male', 'Female', 'Rather not say', 'Custom'].map(g => (
                     <button key={g} onClick={() => setEditValue(g)} className={`w-full p-4 text-left rounded-xl border-2 transition-all ${editValue === g ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-gray-200'}`}>
                        {g}
                     </button>
                   ))}
                </div>
              ) : isAvatar ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Paste an image URL or upload a new photo.</p>
                  <input 
                    type="text" 
                    value={editValue} 
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Image URL (e.g. https://...)"
                    className="w-full p-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none transition-all"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleUpdate('avatar_url', null)}
                      className="flex-1 p-3 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
                    >
                      Remove current
                    </button>
                  </div>
                </div>
              ) : (
                <input 
                  type={isDate ? "date" : "text"} 
                  value={editValue} 
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={`Enter your ${label}`}
                  className="w-full p-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none transition-all"
                  autoFocus
                />
              )}
           </div>
           <div className="p-6 bg-gray-50 flex gap-3">
               <button onClick={() => setEditField(null)} className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
               <button 
                 disabled={loading}
                 onClick={() => handleUpdate(editField, editValue)} 
                 className="flex-1 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
               >
                 {loading ? 'Saving...' : 'Save'}
               </button>
           </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const fetchFullProfile = async () => {
      const user = authService.getCurrentUser();
      if (!user?.id) return;
      try {
        const res = await authService.fetchWithAuth(`/api/users/profile?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setUserData(data.user);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch full profile", e);
      }
    };
    fetchFullProfile();
  }, [currentUser]);

  const handleUpdate = async (field: string, value: any) => {
    setLoading(true);
    try {
      const res = await authService.updateProfile({ 
        id: userData.id, 
        [field]: value 
      } as any);
      
      if (res.success) {
        setUserData(res.user);
        toast.success(`Updated ${field.replace('_', ' ')}`);
        setEditField(null);
      } else {
        toast.error(res.error || "Update failed");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'personal', label: 'Personal info', icon: User },
    { id: 'security', label: 'Security & sign-in', icon: ShieldCheck },
    { id: 'password', label: 'Jeemail password', icon: Key },
    { id: 'apps', label: 'Third-party apps & services', icon: Grid },
    { id: 'privacy', label: 'Data & privacy', icon: Lock },
    { id: 'people', label: 'People & sharing', icon: Users },
    { id: 'payments', label: 'Payments & subscriptions', icon: CreditCard },
    { id: 'storage', label: 'Jeemail Storage', icon: Cloud },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="flex flex-col items-center mb-12">
              <div className="relative group mb-6">
                {userData.avatar_url ? (
                  <img src={userData.avatar_url} className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg" alt="Profile" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-blue-600 text-white flex items-center justify-center text-4xl font-medium ring-4 ring-white shadow-lg">
                    {userData.name?.[0]?.toUpperCase() || userData.email?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md border border-gray-100">
                  <Camera className="w-4 h-4 text-gray-600" />
                </div>
              </div>
              <h1 className="text-3xl font-medium text-gray-900 mb-1">Hi, {userData.name || 'User'}!</h1>
              <p className="text-gray-500">{userData.email}</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden mb-8 shadow-sm">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-medium text-gray-900 mb-1">Account overview</h2>
                        <p className="text-sm text-gray-500 italic">Manage your info, privacy, and security to make Jeemail work better for you.</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                   <div className="p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => setActiveTab('personal')}>
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3">
                            <User className="w-5 h-5" />
                        </div>
                        <h3 className="font-medium text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">Personal info</h3>
                        <p className="text-sm text-gray-500">Edit your name, birthday, and contact info</p>
                   </div>
                   <div className="p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => setActiveTab('security')}>
                        <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-3">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h3 className="font-medium text-gray-900 mb-1 group-hover:text-green-600 transition-colors">Security</h3>
                        <p className="text-sm text-gray-500">Keep your account secure with extra protection</p>
                   </div>
                </div>
            </div>

            <div className="bg-blue-600 rounded-3xl p-8 text-white flex items-center justify-between shadow-lg mb-8">
               <div className="max-w-md">
                 <h2 className="text-2xl font-medium mb-2">Set a recovery option</h2>
                 <p className="opacity-90 mb-6">Add a phone number or recovery email to help you sign in if you're locked out of your account.</p>
                 <button className="px-6 py-2 bg-white text-blue-600 rounded-full font-medium hover:bg-blue-50 transition-colors" onClick={() => setActiveTab('security')}>
                   Add recovery phone
                 </button>
               </div>
               <div className="hidden lg:block">
                 <ShieldCheck className="w-40 h-40 opacity-20" />
               </div>
            </div>
          </div>
        );

      case 'personal':
        return (
          <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-medium text-gray-900 mb-2 text-center">Personal info</h1>
            <p className="text-gray-500 text-center mb-10">Info about you and your preferences across Jeemail services</p>
            
            <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-medium text-gray-900 mb-1">Basic info</h2>
                    <p className="text-sm text-gray-500">Some info may be visible to other people using Jeemail services.</p>
                </div>
                
                <div className="divide-y divide-gray-100">
                    <div className="p-6 flex items-center hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => handleOpenEditor('avatar_url')}>
                        <div className="w-40 text-xs text-gray-500 uppercase tracking-widest font-bold">Profile picture</div>
                        <div className="flex-1 px-4 text-sm text-gray-600">Add a profile picture to help people recognize you</div>
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200 relative">
                           {userData.avatar_url ? (
                             <img src={userData.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                           ) : (
                             <div className="w-full h-full flex items-center justify-center text-2xl bg-orange-500 text-white font-medium">
                                {userData.name?.[0]?.toUpperCase() || userData.email?.[0]?.toUpperCase()}
                             </div>
                           )}
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <Camera className="w-5 h-5 text-white" />
                           </div>
                        </div>
                    </div>

                    <ProfileItem 
                        label="Name" 
                        value={userData.name || 'Not set'} 
                        onClick={() => handleOpenEditor('name', userData.name)}
                    />
                    <ProfileItem 
                        label="Birthday" 
                        value={formatDate(userData.birthday)} 
                        onClick={() => handleOpenEditor('birthday', userData.birthday)}
                    />
                    <ProfileItem 
                        label="Gender" 
                        value={userData.gender || 'Not set'} 
                        onClick={() => handleOpenEditor('gender', userData.gender)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm mt-8">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-medium text-gray-900 mb-1">Contact info</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    <div className="p-6 flex items-center">
                        <div className="w-40 text-xs text-gray-500 uppercase tracking-widest font-bold">Email</div>
                        <div className="flex-1 px-4 text-sm font-medium text-gray-900">{userData.email}</div>
                    </div>
                    <ProfileItem 
                        label="Phone" 
                        value={userData.phone || 'Not set'} 
                        onClick={() => handleOpenEditor('phone', userData.phone)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm mt-8">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-medium text-gray-900 mb-1">Addresses</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    <ProfileItem 
                        label="Home" 
                        value={userData.home_address || 'Not set'} 
                        onClick={() => handleOpenEditor('home_address', userData.home_address)}
                    />
                    <ProfileItem 
                        label="Work" 
                        value={userData.work_address || 'Not set'} 
                        onClick={() => handleOpenEditor('work_address', userData.work_address)}
                    />
                </div>
            </div>
            {renderEditor()}
          </div>
        );

      case 'security':
        return (
          <div className="max-w-4xl mx-auto py-8 px-4">
             <h1 className="text-2xl font-medium text-gray-900 mb-8 text-center">Security & sign-in</h1>
             <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[24px] flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                   <h2 className="font-semibold text-emerald-900">You have security recommendations</h2>
                   <p className="text-emerald-700 text-sm">Review your security activity to keep your account safe.</p>
                </div>
                <button className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition">Check security</button>
             </div>

             <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-medium text-gray-900 mb-1">Recent security activity</h2>
                </div>
                <div className="p-6 text-center text-gray-500 italic">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No critical security alerts in the last 28 days.
                </div>
             </div>

             <div className="bg-white rounded-[24px] border border-gray-200 overflow-hidden shadow-sm mt-8">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-medium text-gray-900 mb-1">How you sign in to Jeemail</h2>
                        <p className="text-sm text-gray-500 italic">Make sure you can always access your account by keeping your sign-in details up to date.</p>
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    <div className="p-4 flex items-center">
                        <div className="w-1/3 flex items-center gap-3">
                            <Key className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-medium">Password</span>
                        </div>
                        <div className="flex-1 text-sm text-gray-500">Last changed {userData.last_password_change ? new Date(userData.last_password_change).toLocaleDateString() : 'recently'}</div>
                        <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="p-4 flex items-center">
                        <div className="w-1/3 flex items-center gap-3">
                            <Smartphone className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-medium">2-Step Verification</span>
                        </div>
                        <div className="flex-1 text-sm text-emerald-600 font-medium">ON - Secure</div>
                        <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                </div>
             </div>
          </div>
        );

      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20">
            <Info className="w-16 h-16 mb-4 opacity-10" />
            <h2 className="text-xl font-medium mb-1">Coming Soon</h2>
            <p>The {activeTab} section is currently under development.</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f8f9fa] z-[10000] flex flex-col h-screen overflow-hidden animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6 justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
            title="Back to Mail"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <Mail className="w-5 h-5" />
            </div>
            <span className="text-xl font-medium text-gray-800 tracking-tight">Jeemail Account</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><Info className="w-5 h-5" /></button>
           <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><Grid className="w-5 h-5" /></button>
           <button className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-medium">
             {userData.name?.[0]?.toUpperCase() || 'U'}
           </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col py-6 overflow-y-auto hidden md:flex shrink-0">
          <div className="px-3 space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as ActiveTab)}
                className={`w-full flex items-start gap-4 px-4 py-3 text-sm font-medium transition-all duration-200 rounded-r-full relative ${
                  activeTab === item.id 
                    ? 'text-blue-700 bg-blue-50/80 shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400'}`}>
                   <item.icon className="w-5 h-5" />
                </div>
                <span className="leading-tight text-left">{item.label}</span>
              </button>
            ))}
          </div>
          
          <div className="mt-auto p-6 text-[11px] text-gray-400 font-medium">
             <div className="flex flex-wrap gap-2 mb-2">
                <a href="#" className="hover:underline">Privacy</a>
                <span>·</span>
                <a href="#" className="hover:underline">Terms</a>
                <span>·</span>
                <a href="#" className="hover:underline">Help</a>
                <span>·</span>
                <a href="#" className="hover:underline">About</a>
             </div>
             <div>© 2026 Jeemail Inc.</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-white md:bg-[#f8f9fa]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function Mail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function ProfileItem({ label, value, onClick, icon }: { label: string; value: string; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <div 
        className={`p-6 flex items-center hover:bg-gray-50 transition-colors group ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
    >
      <div className="w-40 text-xs text-gray-500 uppercase tracking-widest font-bold">{label}</div>
      <div className="flex-1 px-4 text-sm font-medium text-gray-900 truncate">{value}</div>
      <div className="text-gray-300 group-hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
        {icon || <ChevronRight className="w-5 h-5" />}
      </div>
    </div>
  );
}
