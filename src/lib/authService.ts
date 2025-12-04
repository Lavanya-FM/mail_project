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

export async function register(name: string, email: string, password: string, dateOfBirth?: { month: string; day: string; year: string }, gender?: string) {
  try {
    const requestBody: any = { name, email, password };

    if (dateOfBirth && dateOfBirth.month && dateOfBirth.day && dateOfBirth.year) {
      requestBody.date_of_birth = `${dateOfBirth.year}-${dateOfBirth.month}-${dateOfBirth.day}`;
    }
    if (gender) requestBody.gender = gender;

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
  } catch {
    return { success: false, error: "Network error" };
  }
}

export function logout() {
  localStorage.removeItem("user");
}

export function isAuthenticated() {
  return !!getCurrentUser();
}

// convenience object used elsewhere in the app
export const authService = {
  getCurrentUser,
  login,
  register,
  logout,
  isAuthenticated
};

export default authService;
