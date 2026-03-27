// src/components/AccountSwitcher.tsx
import React, { useEffect, useRef, useState } from "react";
import { X as IconX, Check as IconCheck, Trash2 as IconTrash, UserPlus, LogOut, Camera } from "lucide-react";
import AddAccountModal from "./AddAccountModal";
import { authService, switchUser } from "../lib/authService";

interface Account {
  id?: number;
  email: string;
  name?: string;
  avatar?: string | null;
  token?: string | null;
  used_bytes?: number;
  quota_bytes?: number;
}

type Props = {
  currentUser: Account;
  onSwitchAccount?: (account: Account) => void;
  onRemoveAccount?: (account: Account) => void;
  onManageAccount?: () => void;
  children?: React.ReactNode;
};

const LS_KEY = "jeemail.accounts";

export default function AccountSwitcher({ currentUser, onSwitchAccount, onRemoveAccount, onManageAccount, children }: Props) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Account[];
    } catch {
      return [];
    }
  });

  const [showModal, setShowModal] = useState(false);
  const [open, setOpen] = useState(false);
  const ddRef = useRef<HTMLDivElement | null>(null);

  // toast state
  const [toast, setToast] = useState<{ message: string; type?: "success" | "error" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // persist accounts
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.warn("Failed to persist accounts:", e);
    }
  }, [accounts]);

  const showToast = (message: string, type: "success" | "error" = "success", ms = 2500) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), ms);
  };

  const handleAddAccount = (account: Account) => {
    // Check if account already exists
    if (accounts.some(a => a.email === account.email)) {
      showToast("Account already added", "error");
      return;
    }

    const newAccounts = [...accounts, account];
    setAccounts(newAccounts);

    // Also ensuring current user is in the list if not already
    // (This is tricky because currentUser prop comes from parent, but we want to store it?)
    // Actually, we should only store "other" or "all" accounts. 
    // Let's assume 'accounts' in LS stores ALL known accounts including the current one.

    setShowModal(false);
    setOpen(false); // Close switcher after adding? Or keep open? Google usually closes or switches.

    // Auto-switch to new account? Google does.
    switchUser(account);
  };

  const handleRemoveAccount = (e: React.MouseEvent, account: Account) => {
    e.stopPropagation(); // prevent triggering switch
    if (!confirm(`Remove account ${account.email} from this device?`)) return;

    setAccounts(prev => prev.filter(a => a.email !== account.email));
    if (onRemoveAccount) onRemoveAccount(account);
    showToast("Account removed", "success");
  };

  const handleSwitchAccount = (account: Account) => {
    // If clicking current user, do nothing
    if (account.email === currentUser.email) return;

    if (onSwitchAccount) {
      onSwitchAccount(account);
    } else {
      switchUser(account);
    }
    setOpen(false);
  };

  const handleSignOut = () => {
    authService.logout();
    localStorage.removeItem(LS_KEY); // Clear all saved accounts
    window.location.reload();
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB", "error");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const res = await authService.updateProfile({ avatar_url: base64 });
        if (res.success) {
          showToast("Profile photo updated", "success");
          // Update the current account in the list too
          setAccounts(prev => prev.map(a => 
            a.email === currentUser.email ? { ...a, avatar: base64 } : a
          ));
          // Refresh to propagate changes
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(res.error || "Failed to update photo", "error");
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      showToast("Failed to upload image", "error");
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Remove your profile photo?")) return;
    
    setUploading(true);
    try {
      const res = await authService.updateProfile({ avatar_url: null });
      if (res.success) {
        showToast("Profile photo removed", "success");
        // Update the current account in the list too
        setAccounts(prev => prev.map(a => 
          a.email === currentUser.email ? { ...a, avatar: null } : a
        ));
        // Refresh to propagate changes
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast(res.error || "Failed to remove photo", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to remove photo", "error");
    } finally {
      setUploading(false);
    }
  };

  // close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ddRef.current) return;
      if (!ddRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Filter accounts to show only "other" accounts in the list
  const otherAccounts = accounts.filter(a => a.email !== currentUser.email);

  return (
    <div className="relative inline-block text-left z-[110]" ref={ddRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition p-1"
        aria-expanded={open}
        aria-haspopup="true"
        title={`Jeemail Account: ${currentUser.name} \n(${currentUser.email})`}
      >
        {currentUser.avatar ? (
          <img src={currentUser.avatar} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-medium text-sm">
            {currentUser.name?.[0]?.toUpperCase() ?? currentUser.email?.[0]?.toUpperCase() ?? "U"}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[400px] bg-[#e9eef6] dark:bg-slate-800 rounded-[28px] shadow-2xl z-[9999] overflow-hidden ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          <div className="bg-white dark:bg-slate-900 m-2.5 rounded-[24px] p-4 shadow-sm relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
            >
              <IconX className="w-5 h-5" />
            </button>

            {/* Current User Profile */}
            <div className="flex flex-col items-center pt-0 pb-3">
              <p className="text-[13px] font-medium text-gray-600 dark:text-gray-400 mb-3 tracking-tight">
                {currentUser.email.toLowerCase()}
              </p>

              <div 
                className="relative group cursor-pointer mb-3"
                onClick={handleAvatarClick}
              >
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name} className="w-24 h-24 rounded-full object-cover ring-1 ring-gray-200 dark:ring-slate-700 shadow-xl" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-purple-600 text-white flex items-center justify-center font-medium text-4xl ring-1 ring-gray-200 dark:ring-slate-700 shadow-xl">
                    {currentUser.name?.[0]?.toUpperCase() ?? currentUser.email?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
                {/* Hover Overlay */}
                <div className="absolute inset-0 rounded-full bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Camera className="w-8 h-8 text-white mb-1" />
                </div>
                
                {/* Remove photo button - moved to bottom left overlap */}
                {currentUser.avatar && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAvatar();
                    }}
                    className="absolute bottom-0 left-0 bg-white dark:bg-slate-800 rounded-full p-2 border border-gray-200 dark:border-slate-700 shadow-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-transform group-hover:scale-110 z-[120]"
                    title="Remove photo"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                )}

                {/* Loading State */}
                {uploading && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center z-10">
                    <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}

                <div className="absolute bottom-0 right-0 bg-white dark:bg-slate-800 rounded-full p-2 border border-gray-200 dark:border-slate-700 shadow-lg transform group-hover:scale-110 transition-transform">
                  <Camera className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <h2 className="text-xl font-normal text-gray-900 dark:text-white mb-4">
                Hi, {currentUser.name?.split(' ')[0]}!
              </h2>

              <button
                onClick={onManageAccount}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200 shadow-sm mb-2"
              >
                Manage your Jeemail Account
              </button>
            </div>

            {/* Main Action Row */}
            <div className="flex gap-2 mb-3 w-full px-1">
              <button
                onClick={() => setShowModal(true)}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-[16px] transition-all group overflow-hidden shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <UserPlus className="w-4 h-4" />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">Add account</span>
              </button>

              <button
                onClick={handleSignOut}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-[16px] transition-all group overflow-hidden shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">Sign out</span>
              </button>
            </div>

            {/* Storage Progress Section */}
            <div className="bg-white dark:bg-slate-900 mx-1 mb-3 p-3 rounded-[16px] border border-gray-200 dark:border-slate-800 shadow-sm">
                {/* Storage */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="bg-white dark:bg-slate-900 rounded-full p-2 border border-gray-100 dark:border-slate-700 shadow-sm flex-shrink-0">
                      <div className="w-5 h-5 flex items-center justify-center text-blue-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                        {(() => {
                          const used = currentUser.used_bytes || 0;
                          const limit = currentUser.quota_bytes || 26843545600; // Use quota_bytes, default to 25GB
                          if (used > 1024 * 1024 * 1024) {
                            return `${(used / (1024 * 1024 * 1024)).toFixed(1)} GB used of ${(limit / (1024 * 1024 * 1024)).toFixed(0)} GB`;
                          }
                          return `${(used / (1024 * 1024)).toFixed(1)} MB used of ${(limit / (1024 * 1024)).toFixed(0)} MB`;
                        })()}
                      </p>
                      <div className="w-full h-1 bg-gray-200 dark:bg-slate-700 rounded-full mt-1.5 overflow-hidden shadow-inner">
                        <div 
                           className={`h-full transition-all duration-1000 ${((currentUser.used_bytes || 0) / (currentUser.quota_bytes || 26843545600)) > 0.9 ? 'bg-red-500' : 'bg-blue-600'}`}
                           style={{ width: `${Math.min(((currentUser.used_bytes || 0) / (currentUser.quota_bytes || 26843545600)) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            {/* Extra Content (e.g. Inbox Rules) */}
            {children && (
              <div className="mb-2 px-1 space-y-1.5">
                {children}
            </div>
            )}

            {/* Divider for Other Accounts */}
            {otherAccounts.length > 0 && (
              <div className="pb-2">
                <div className="px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Signed-in accounts</div>
                <div className="max-h-60 overflow-y-auto">
                  {otherAccounts.map(acc => (
                    <div
                      key={acc.email}
                      onClick={() => handleSwitchAccount(acc)}
                      className="flex items-center gap-3 p-3 mx-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-2xl cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-medium text-lg flex-shrink-0">
                        {acc.name?.[0]?.toUpperCase() ?? acc.email?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {acc.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {acc.email}
                        </span>
                      </div>
                      {/* Remove Account */}
                      <button
                        onClick={(e) => handleRemoveAccount(e, acc)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove account"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 text-center">
            <div className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-center gap-3">
              <button 
                onClick={() => {
                   window.dispatchEvent(new CustomEvent('show-privacy-policy'));
                   setOpen(false);
                }} 
                className="hover:bg-gray-200 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors"
              >
                Privacy Policy
              </button>
              <span className="mt-1 opacity-40">•</span>
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('show-terms-of-service'));
                  setOpen(false);
                }} 
                className="hover:bg-gray-200 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <AddAccountModal onClose={() => setShowModal(false)} onSuccess={handleAddAccount} />
      )}

      {/* toast */}
      {toast && (
        <div
          className={`fixed right-6 bottom-6 z-[60] max-w-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 ${toast.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
            }`}
        >
          <div className={`p-1 rounded-full ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>
            <IconCheck className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm text-gray-800">{toast.message}</div>
          <button onClick={() => setToast(null)} className="ml-2 p-1">
            <IconX className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}
    </div>
  );
}
