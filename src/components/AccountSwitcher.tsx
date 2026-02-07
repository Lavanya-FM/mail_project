// src/components/AccountSwitcher.tsx
import React, { useEffect, useRef, useState } from "react";
import { X as IconX, Check as IconCheck, Trash2 as IconTrash, UserPlus, LogOut, Settings } from "lucide-react";
import AddAccountModal from "./AddAccountModal";
import { authService, switchUser } from "../lib/authService";

interface Account {
  id?: number;
  email: string;
  name?: string;
  avatar?: string | null;
  token?: string | null;
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
    window.location.reload();
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
    <div className="relative inline-block text-left z-50" ref={ddRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition p-1"
        aria-expanded={open}
        aria-haspopup="true"
        title={`Google Account: ${currentUser.name}
(${currentUser.email})`}
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
        <div className="absolute right-0 mt-2 w-[350px] bg-[#e9eef6] dark:bg-slate-800 rounded-[28px] shadow-xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
          <div className="bg-white dark:bg-slate-900 m-4 rounded-[28px] p-4 shadow-sm relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
            >
              <IconX className="w-5 h-5" />
            </button>

            {/* Current User Profile */}
            <div className="flex flex-col items-center pt-2 pb-4">
              <div className="relative group cursor-pointer mb-2">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name} className="w-20 h-20 rounded-full object-cover ring-4 ring-white dark:ring-slate-800" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-purple-600 text-white flex items-center justify-center font-medium text-3xl ring-4 ring-white dark:ring-slate-800">
                    {currentUser.name?.[0]?.toUpperCase() ?? currentUser.email?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-white dark:bg-slate-800 rounded-full p-1 border border-gray-200 dark:border-slate-700 shadow-sm">
                  <div className="w-5 h-5 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                    <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate max-w-full px-4">
                {currentUser.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-full px-4">
                {currentUser.email}
              </p>

              <button
                onClick={onManageAccount}
                className="mt-4 px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                Manage your Jeemail Account
              </button>
            </div>

            {/* Extra Content (e.g. Inbox Rules) */}
            {children}

            {/* Divider */}
            {(children || otherAccounts.length > 0) && (
              <div className="border-t border-gray-100 dark:border-gray-800 my-2"></div>
            )}

            {/* Other Accounts List */}
            {otherAccounts.length > 0 && (
              <div className="max-h-60 overflow-y-auto">
                {otherAccounts.map(acc => (
                  <div
                    key={acc.email}
                    onClick={() => handleSwitchAccount(acc)}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-medium text-lg flex-shrink-0">
                      {acc.name?.[0]?.toUpperCase() ?? acc.email?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
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
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-800 my-2"></div>

            {/* Add Another Account */}
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center gap-4 p-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl transition"
            >
              <div className="w-5 h-5 ml-2.5 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-gray-500" />
              </div>
              <span>Add another account</span>
            </button>
          </div>

          {/* Footer Actions (Sign out) */}
          <div className="bg-[#e9eef6] dark:bg-slate-800 p-2 text-center">
            <button
              onClick={handleSignOut}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 transition"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out of all accounts
            </button>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex justify-center gap-4">
              <a href="#" className="hover:underline">Privacy Policy</a>
              <span>•</span>
              <a href="#" className="hover:underline">Terms of Service</a>
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
