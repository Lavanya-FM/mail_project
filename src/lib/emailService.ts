type ApiResult<T> = Promise<{ data?: T; error?: any; status: number }>;

const API_BASE = (process.env.REACT_APP_API_BASE || '').replace(/\/$/, '');
const BASE = API_BASE || '';

function apiUrl(path: string) {
  return `${BASE}${path}`;
}

async function handleResp<T>(resp: Response): Promise<{ data?: T; error?: any; status: number }> {
  const status = resp.status;
  const text = await resp.text();

  if (!text) {
    return resp.ok ? { data: undefined as unknown as T, status } : { error: null, status };
  }

  try {
    const json = JSON.parse(text);

    if (json && typeof json === 'object' && json.hasOwnProperty('data')) {
      return resp.ok ? { data: json.data as T, status } : { error: json, status };
    }

    return resp.ok ? { data: json as T, status } : { error: json, status };
  } catch {
    return resp.ok ? { data: text as unknown as T, status } : { error: text, status };
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') || (window as any).__authToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getFolderIdByName(name: string): number | null {
  const folders = JSON.parse(localStorage.getItem("folders") || "[]");
  const search = name.toLowerCase();

  const folder = folders.find((f: any) =>
    (f.name && f.name.toLowerCase() === search) ||
    (f.system_box && f.system_box.toLowerCase() === search)
  );

  return folder ? Number(folder.id) : null;
}

export const emailService = {
  async getFolders(userId: number | string): ApiResult<any[]> {
    const url = apiUrl(`/api/folders/${encodeURIComponent(String(userId))}`);
    const resp = await fetch(url, { 
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include'
    });

    const result = await handleResp<any[]>(resp);

    let foldersArray: any[] = [];

    if (result.data && Array.isArray(result.data)) {
      foldersArray = result.data.map(f => ({
        id: Number(f.id),
        name: f.name || f.system_box || "unknown",
        system_box: (f.system_box || f.name || "").toLowerCase()
      }));
    }

    localStorage.setItem("folders", JSON.stringify(foldersArray));

    return { data: foldersArray, status: result.status };
  },

  async getEmails(userId: number | string, folderId?: string | number): ApiResult<any[]> {
    let fid: number | null;

    if (!folderId) {
      fid = getFolderIdByName("inbox");
    } else if (isNaN(Number(folderId))) {
      fid = getFolderIdByName(String(folderId));
    } else {
      fid = Number(folderId);
    }

    if (!fid) {
      console.error("Invalid folderId:", folderId);
      return { error: "invalid folderId", status: 400 };
    }

    const url = apiUrl(`/api/emails/${encodeURIComponent(String(userId))}/${encodeURIComponent(fid)}`);
    const resp = await fetch(url, { 
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include' 
    });

    return handleResp<any[]>(resp);
  },

  async createEmail(payload: any): ApiResult<any> {
    const url = apiUrl('/api/email/create');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResp<any>(resp);
  },

  // Flexible updateEmail:
  // - Called as updateEmail(emailId, userId, updates)
  // - OR as updateEmail(emailId, updates) where updates contains user_id
  async updateEmail(emailId: number | string, arg2: any, arg3?: any): ApiResult<any> {
    let userId: number | undefined;
    let updates: any;

    if (typeof arg3 !== 'undefined') {
      // called as (emailId, userId, updates)
      userId = Number(arg2);
      updates = arg3 || {};
    } else {
      // called as (emailId, updates)
      updates = arg2 || {};
      if (updates && (updates.user_id || updates.userId)) {
        userId = Number(updates.user_id || updates.userId);
      } else {
        // try to get current user from localStorage as a last resort
        try {
          const stored = JSON.parse(localStorage.getItem('user') || 'null');
          if (stored && stored.id) userId = Number(stored.id);
        } catch (e) {
          // ignore
        }
      }
    }

    if (!userId) {
      console.error('updateEmail: missing user_id', { emailId, arg2, arg3 });
      return { error: 'missing user_id', status: 400 };
    }

    const url = apiUrl(`/api/email/${encodeURIComponent(String(emailId))}`);
    const body = { user_id: Number(userId), ...updates };

    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    return handleResp<any>(resp);
  },

  async moveEmail(email_id: number, user_id: number, target_folder: number): ApiResult<any> {
    const url = apiUrl('/api/email/move');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id, target_folder }),
    });
    return handleResp<any>(resp);
  },

  async moveToSpam(email_id: number, user_id: number): ApiResult<any> {
    const url = apiUrl('/api/email/spam');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id }),
    });
    return handleResp<any>(resp);
  },

  async deleteEmail(email_id: number, user_id: number): ApiResult<any> {
    const url = apiUrl('/api/email/delete');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id }),
    });
    return handleResp<any>(resp);
  },

  async deletePermanent(email_id: number, user_id: number): ApiResult<any> {
    const url = apiUrl('/api/email/delete-permanent');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id }),
    });
    return handleResp<any>(resp);
  },

  async star(email_id: number, user_id: number, status: boolean): ApiResult<any> {
    const url = apiUrl('/api/email/star');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id, status }),
    });
    return handleResp<any>(resp);
  },

  async markRead(email_id: number, user_id: number, is_read: boolean): ApiResult<any> {
    const url = apiUrl('/api/email/read');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify({ email_id, user_id, is_read }),
    });
    return handleResp<any>(resp);
  },

  async checkEmailExists(email: string): ApiResult<any> {
    const url = apiUrl(`/api/users/email/${encodeURIComponent(email)}`);
    const resp = await fetch(url, { 
      headers: { 'Content-Type': 'application/json', ...authHeaders() }, 
      credentials: 'include' 
    });

    return handleResp<any>(resp);
  }
};
