/*
  src/lib/authService.ts

  Exports:
   - named exports: getCurrentUser, login, register, logout, isAuthenticated, authService
   - default export: authService
*/
const API = "/api"; // relative so nginx proxy works

function saveUser(user: any) {
  const normalized = {
    id: user.id,
    full_name: user.name || user.full_name || '',
    email: user.email,
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

    // backend returns: { user: { id, name, email } }
    saveUser(data.user);
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

    return { success: true, user: getCurrentUser() };

  } catch (err) {
    return { success: false, error: "Network error" };
  }
}

export function logout() {
  localStorage.removeItem("user");
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
  login,
  register,
  logout,
  isAuthenticated,
  getRecentActivity
};

export default authService;
