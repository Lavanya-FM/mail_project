import { USE_MOCK_DATA, mockFolders, mockEmails } from './mockData';

type ApiResult<T> = Promise<{ data?: T; error?: any; status: number;[key: string]: any }>;

// Automatically use same origin unless overridden
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
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

// --- FIXED: PERFECT folder lookup ---
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
  // -----------------------------------------------------
  // GET FOLDERS
  // -----------------------------------------------------
  async getFolders(userId: number | string): ApiResult<any[]> {
    // Return mock data if enabled
    if (USE_MOCK_DATA) {
      localStorage.setItem("folders", JSON.stringify(mockFolders));
      return { data: mockFolders, status: 200 };
    }

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

    // Save clean folder structure in localStorage
    localStorage.setItem("folders", JSON.stringify(foldersArray));

    return { data: foldersArray, status: result.status };
  },

  // -----------------------------------------------------
  // GET EMAILS
  // -----------------------------------------------------
  async getEmails(userId: number | string, folderId?: string | number): ApiResult<any[]> {
    // Return mock data if enabled
    if (USE_MOCK_DATA) {
      let fid: number | null;
      if (!folderId) {
        fid = getFolderIdByName("inbox");
      } else if (isNaN(Number(folderId))) {
        fid = getFolderIdByName(String(folderId));
      } else {
        fid = Number(folderId);
      }

      // Filter mock emails by folder
      const filteredEmails = fid ? mockEmails.filter(e => e.folder_id === fid) : mockEmails;
      return { data: filteredEmails, status: 200 };
    }

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

    const r = await handleResp<any>(resp);
    return {
      data: r.data?.data || [],
      count: r.data?.count || 0,
      unread: r.data?.unread || 0,
      status: r.status
    };
  },

  // -----------------------------------------------------
  // CREATE EMAIL (send / draft)
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // MOVE EMAIL
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // DELETE EMAIL
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // STAR EMAIL
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // UPDATE EMAIL (read, star, folder_id)
  // -----------------------------------------------------
  async updateEmail(emailId: number | string, data: any): ApiResult<any> {
    // Handle mock data
    if (USE_MOCK_DATA) {
      const email = mockEmails.find(e => e.id === Number(emailId));
      if (email) {
        Object.assign(email, data);
        return { data: email, status: 200 };
      }
      return { error: "Email not found", status: 404 };
    }

    const url = apiUrl('/api/email/update');
    const payload = {
      email_id: Number(emailId),
      ...data
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    return handleResp<any>(resp);
  },

  // -----------------------------------------------------
  // CHECK IF USER EXISTS
  // -----------------------------------------------------
  async checkEmailExists(email: string): ApiResult<any> {
    const url = apiUrl(`/api/users/email/${encodeURIComponent(email)}`);
    const resp = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include'
    });

    return handleResp<any>(resp);
  }
};
