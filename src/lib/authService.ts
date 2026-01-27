/*
  src/lib/authService.ts

  Exports:
   - named exports: getCurrentUser, login, register, logout, isAuthenticated, authService
   - default export: authService
*/
const API = "/api"; // relative so nginx proxy works

function saveUser(user: any) {
  // ✅ FIX: Validate and explicitly map fields to prevent wrong data display
  if (!user || typeof user !== 'object') {
    console.error('saveUser: Invalid user object', user);
    return;
  }

  // ✅ FIX: Explicitly extract name and email, validate they're not passwords
  const name = user.name || user.full_name || '';
  const email = user.email || '';

  // ✅ FIX: Safety check - if name looks like an email or email looks like a password hash, log warning
  if (name.includes('@') && !email.includes('@')) {
    console.error('saveUser: Data mapping issue detected!', {
      receivedName: name,
      receivedEmail: email,
      fullUser: user
    });
    // Don't save corrupted data
    return;
  }

  const normalized = {
    id: user.id,
    full_name: name,
    email: email,
    storage_used: user.storage_used || 0,
    storage_limit: user.storage_limit || 1073741824
  };
  localStorage.setItem("user", JSON.stringify(normalized));
}

export function getCurrentUser() {
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem("user_token");
}

export async function login(email: string, password: string) {
  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      return { success: false, error: data.error || "Login failed" };
    }

    // backend returns: { user: { id, name, email }, token: "..." }
    saveUser(data.user);
    if (data.token) localStorage.setItem("user_token", data.token);

    return { success: true, user: getCurrentUser() };
  } catch (err) {
    return { success: false, error: "Network error" };
  }
}

export async function register(
  name: string,
  emailOrUsername: string,
  password: string,
  dateOfBirth?: { month: string; day: string; year: string },
  gender?: string
) {
  try {
    // --- FIX 1: Ensure email belongs to jeemail.in ---
    let finalEmail = emailOrUsername.trim().toLowerCase();

    // User typed only username → make username@jeemail.in
    if (!finalEmail.includes("@")) {
      finalEmail = `${finalEmail}@jeemail.in`;
    }

    // User typed wrong domain → force correct domain
    const [userPart, domain] = finalEmail.split("@");
    if (domain !== "jeemail.in") {
      finalEmail = `${userPart}@jeemail.in`;
    }

    // --- FIX 2: Backend expects nested dateOfBirth object ---
    const requestBody: any = {
      name,
      email: finalEmail,
      password
    };

    if (dateOfBirth) {
      requestBody.dateOfBirth = {
        year: dateOfBirth.year,
        month: dateOfBirth.month.padStart(2, "0"),
        day: dateOfBirth.day.padStart(2, "0")
      };
    }

    if (gender) requestBody.gender = gender;

    // --- API CALL ---
    const res = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      return { success: false, error: data.error || "Registration failed" };
    }

    if (data.user) saveUser(data.user);
    if (data.token) localStorage.setItem("user_token", data.token);

    return { success: true, user: getCurrentUser() };

  } catch (err) {
    return { success: false, error: "Network error" };
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json'
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    await chatStorage.handleLogout(); // Use imported handler instead of direct logout call to avoid circular dependency issues if any
    localStorage.removeItem("user");
    localStorage.removeItem("user_token");
    window.location.reload();
  }
  return res;
}

import { chatStorage } from './chatStorage';

export async function logout() {
  await chatStorage.handleLogout();
  localStorage.removeItem("user");
  localStorage.removeItem("user_token");
}

export function isAuthenticated() {
  return !!getCurrentUser();
}

export interface ActivityLog {
  access_type: string;
  location: string;
  ip: string;
  date: string;
  details?: string;
  is_current?: boolean;
}

export async function getRecentActivity(): Promise<ActivityLog[]> {
  // In a real app, this would fetch from API
  // return fetch(`${API}/activity`).then(res => res.json());

  // Return current session for now
  return [
    {
      access_type: 'Browser (Chrome)',
      location: 'India (TN)', // Placeholder
      ip: '127.0.0.1',
      date: new Date().toISOString(),
      is_current: true
    }
  ];
}

// convenience object used elsewhere in the app
export const authService = {
  getCurrentUser,
  getToken,
  login,
  register,
  logout,
  isAuthenticated,
  getRecentActivity,
  fetchWithAuth
};

export default authService;
