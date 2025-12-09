// src/components/AccountSwitcher.tsx
import React, { useEffect, useRef, useState } from "react";
import { X as IconX, Check as IconCheck, Trash2 as IconTrash } from "lucide-react";
import AddAccountModal from "./AddAccountModal";

interface Account {
  id?: number;
  email: string;
  name?: string;
  avatar?: string | null;
  token?: string | null;
}

interface AccountData {
  folders?: any[];
  inbox?: any[];
  error?: string | null;
}

type Props = {
  currentUser: Account;
  onSwitchAccount?: (account: Account) => void;
  onRemoveAccount?: (account: Account) => void;
};

const LS_KEY = "jeemail.accounts";

export default function AccountSwitcher({ currentUser, onSwitchAccount, onRemoveAccount }: Props) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Account[];
    } catch {
      return [];
    }
  });

  const [accountsData, setAccountsData] = useState<Record<string, AccountData>>({});
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

  // helper: small toast helper
  const showToast = (message: string, type: "success" | "error" = "success", ms = 2500) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), ms);
  };

  // helper: fetch folders & inbox for a newly added account (used to detect 401 etc)
  async function loadAccountData(account: Account) {
    const key = account.email;
    setAccountsData(prev => ({ ...prev, [key]: { folders: [], inbox: [], error: null } }));

    try {
      // 1) folders
      const fResp = await fetch(`/api/folders/${account.id}`);
      if (!fResp.ok) {
        const text = await fResp.text().catch(() => "");
        const errMsg = `folders request failed: ${fResp.status} ${fResp.statusText} ${text}`;
        console.error(errMsg, { url: `/api/folders/${account.id}`, status: fResp.status });
        if (fResp.status === 401) {
          setAccountsData(prev => ({ ...prev, [key]: { ...prev[key], error: "Unauthorized (folders). Re-authenticate." } }));
          return;
        }
        setAccountsData(prev => ({ ...prev, [key]: { ...prev[key], error: errMsg } }));
        return;
      }
      const foldersJson = await fResp.json();

      // 2) inbox (system box 'inbox')
      const eResp = await fetch(`/api/emails/${account.id}/inbox`);
      if (!eResp.ok) {
        const text = await eResp.text().catch(() => "");
        const errMsg = `emails request failed: ${eResp.status} ${eResp.statusText} ${text}`;
        console.error(errMsg, { url: `/api/emails/${account.id}/inbox`, status: eResp.status });
        if (eResp.status === 401) {
          setAccountsData(prev => ({ ...prev, [key]: { ...prev[key], error: "Unauthorized (emails). Re-authenticate." } }));
          return;
        }
        setAccountsData(prev => ({ ...prev, [key]: { ...prev[key], error: errMsg } }));
        return;
      }
      const emailsJson = await eResp.json();

      // Save successful fetch results
      setAccountsData(prev => ({
        ...prev,
        [key]: { folders: foldersJson?.data || foldersJson || [], inbox: emailsJson?.data || emailsJson || [], error: null }
      }));

      console.log("Account loaded:", account.email, { folders: foldersJson, inbox: emailsJson });
    } catch (err: any) {
      console.error("loadAccountData error:", err);
      setAccountsData(prev => ({ ...prev, [key]: { ...prev[key], error: String(err.message || err) } }));
    }
  }

  // add account handler (called by AddAccountModal)
  const handleAddAccount = (account: Account) => {
    console.log("Account added:", account);

    setAccounts(prev => {
      if (prev.some(a => a.email === account.email)) return prev;
      const next = [...prev, account];
      return next;
    });

    // immediately try to load data for this account (and surface any 401)
    loadAccountData(account);

    setShowModal(false);
    setOpen(false);

    showToast("Account added", "success");
  };

  // remove account (with confirmation)
  const handleRemoveAccount = (account: Account) => {
    if (!confirm(`Remove account ${account.email} from this device?`)) return;

    setAccounts(prev => prev.filter(a => a.email !== account.email));
    setAccountsData(prev => {
      const copy = { ...prev };
      delete copy[account.email];
      return copy;
    });

    if (onRemoveAccount) onRemoveAccount(account);

    showToast("Account removed", "success");
  };

  // switch account (calls parent handler)
  const handleSwitchAccount = (account: Account) => {
    console.log("Switching to account:", account);
    // let parent handle auth/profile switching
    if (onSwitchAccount) {
      onSwitchAccount(account);
    } else {
      // fallback: store active account in localStorage and reload (you can change to your own logic)
      try {
        localStorage.setItem("jeemail.active", JSON.stringify(account));
        // optional: emit event so other parts of app can listen
        window.dispatchEvent(new CustomEvent("jeemail:switch-account", { detail: account }));
      } catch {}
    }
    setOpen(false);
    showToast("Switched account", "success");
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

  return (
    <div className="relative inline-block text-left" ref={ddRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
          {currentUser.name?.[0]?.toUpperCase() ?? currentUser.email?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {currentUser.name}
          </span>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {currentUser.email}
          </span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="p-3">
            <div className="flex items-center gap-3 p-2 rounded-lg cursor-default">
              <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center text-lg font-semibold">
                {currentUser.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {currentUser.name}
                </span>
                <span className="text-xs text-gray-600 dark:text-slate-400">
                  {currentUser.email}
                </span>
              </div>
            </div>

            {/* Other accounts */}
            {accounts.length > 0 && (
              <>
                <div className="mt-3 mb-2 text-xs font-semibold text-gray-400 uppercase">
                  Other Accounts
                </div>

                <div className="space-y-1 max-h-48 overflow-auto pr-2">
                  {accounts.map(acc => {
                    const accData = accountsData[acc.email];
                    return (
                      <div
                        key={acc.email}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <div
                          onClick={() => handleSwitchAccount(acc)}
                          className="flex items-center gap-3 flex-1"
                        >
                          <div className="w-9 h-9 bg-purple-500 text-white rounded-full flex items-center justify-center font-medium">
                            {acc.name?.[0]?.toUpperCase() ?? acc.email?.[0]?.toUpperCase()}
                          </div>

                          <div className="flex-1 flex flex-col">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {acc.name || acc.email.split("@")[0]}
                            </span>
                            <span className="text-xs text-gray-600 dark:text-slate-400">
                              {acc.email}
                            </span>
                            {accData?.error && (
                              <span className="text-xs text-red-600 mt-1">{accData.error}</span>
                            )}
                          </div>
                        </div>

                        {/* actions: remove */}
                        <div className="flex items-center gap-2">
                          <button
                            title="Remove account"
                            onClick={() => handleRemoveAccount(acc)}
                            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                          >
                            <IconTrash className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-2 text-blue-600 font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                + Add account
              </button>

              <button
                onClick={() => {
                  console.log("Sign out clicked");
                  // let parent handle real sign-out if needed
                  window.dispatchEvent(new CustomEvent("jeemail:signout"));
                }}
                className="w-full py-2 text-red-600 font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Sign out
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
          className={`fixed right-6 bottom-6 z-60 max-w-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 ${
            toast.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
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
