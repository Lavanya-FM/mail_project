// src/lib/emailService.ts

type ApiResult<T> = Promise<{
  data?: T;
  error?: any;
  status: number;
  [key: string]: any;
}>;

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const BASE = API_BASE || "";

function apiUrl(path: string) {
  return `${BASE}${path}`;
}

async function handleResp<T>(resp: Response) {
  const status = resp.status;
  const text = await resp.text();

  if (!text) {
    return resp.ok
      ? { data: undefined as unknown as T, status }
      : { error: null, status };
  }

  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && json.hasOwnProperty("data")) {
      return resp.ok
        ? { data: json.data as T, status }
        : { error: json, status };
    }
    return resp.ok ? { data: json as T, status } : { error: json, status };
  } catch {
    return resp.ok
      ? { data: text as unknown as T, status }
      : { error: text, status };
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");

  if (!token || token === "null" || token === "undefined") {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}

// -------------------------------------------------------------
// FOLDER LOOKUP
// -------------------------------------------------------------
export function getFolderIdByName(name: string): number | null {
  const raw = localStorage.getItem("folders");
  if (!raw) return null;

  let folders: any[] = [];

  try {
    folders = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse folder cache", e);
    return null;
  }

  const search = name.toLowerCase();

  const folder = folders.find(
    (f) =>
      f.system_box?.toLowerCase() === search ||
      f.name?.toLowerCase() === search
  );

  return folder ? Number(folder.id) : null;
}

export async function filesToBase64(files: File[]): Promise<Array<{
  filename: string;
  mime_type: string;
  size_bytes: number;
  content: string;
}>> {
  const results = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    results.push({
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      content: base64
    });
  }

  return results;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ''
    )
  );
}

// -------------------------------------------------------------
// EMAIL SERVICE
// -------------------------------------------------------------
export const emailService = {
  async getFolders(userId: number | string): ApiResult<any[]> {
    const url = apiUrl(`/api/folders/${encodeURIComponent(String(userId))}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    const result = await handleResp<any[]>(resp);
    if (result.error) return result;

    const folders = (result.data || []).map((f: any) => ({
      id: Number(f.id),
      name: f.name || f.system_box || "unknown",
      system_box: (f.system_box || f.name).toLowerCase(),
      count: Number(f.count || 0),
    }));
    localStorage.setItem("folders", JSON.stringify(folders));
    return { data: folders, status: result.status };
  },

  async getEmails(userId: number | string, folderId?: number | string): ApiResult<any[]> {
    let fid: number | null;
    if (!folderId) fid = getFolderIdByName("inbox");
    else if (isNaN(Number(folderId))) fid = getFolderIdByName(String(folderId));
    else fid = Number(folderId);

    if (!fid) return { error: "Invalid folderId", status: 400 };
    const url = apiUrl(`/api/emails/${userId}/${fid}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    const r = await handleResp<any>(resp);
    const raw = r.data || [];
    raw.forEach((email: any) => {
      email.to_emails = (email.to_emails || []).map((t: any) => ({ email: t.email || t }));
      email.cc_emails = (email.cc_emails || []).map((t: any) => ({ email: t.email || t }));
      email.bcc_emails = (email.bcc_emails || []).map((t: any) => ({ email: t.email || t }));
    });
    return { data: raw, status: r.status };
  },

  async getThread(threadId: number | string, userId: number | string): ApiResult<any[]> {
    const url = apiUrl(`/api/email/thread/${threadId}?user_id=${userId}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    const r = await handleResp<any[]>(resp);
    const raw = r.data || [];
    raw.forEach((email: any) => {
      email.to_emails = (email.to_emails || []).map((t: any) => ({ email: t.email || t }));
      email.cc_emails = (email.cc_emails || []).map((t: any) => ({ email: t.email || t }));
      email.bcc_emails = (email.bcc_emails || []).map((t: any) => ({ email: t.email || t }));
    });
    return { data: raw, status: r.status };
  },

  async createEmail(payload: any): ApiResult<any> {
    const url = apiUrl("/api/email/create");
    const bodyClean = {
      user_id: payload.user_id,
      from_email: payload.from_email,
      from_name: payload.from_name,
      subject: payload.subject || "(no subject)",
      body: payload.body || "",
      is_draft: !!payload.is_draft,
      folder_id: payload.folder_id || null,
      in_reply_to: payload.in_reply_to || null,
      to_emails: payload.to_emails || [],
      cc_emails: payload.cc_emails || [],
      bcc_emails: payload.bcc_emails || [],
      attachments: payload.attachments || [],
      p2p_enabled: !!payload.p2p_enabled,
      p2p_delivered: !!payload.p2p_delivered,
      thread_id: payload.thread_id || payload.threadId || null,
      draft_id: payload.draft_id || null,
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(bodyClean),
    });
    return handleResp<any>(resp);
  },

  async updateEmail(emailId: number | string, data: any): ApiResult<any> {
    const url = apiUrl("/api/email/update");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id: Number(emailId), ...data }),
    });
    return handleResp<any>(resp);
  },

  async updateDraft(emailId: number | string, data: any): ApiResult<any> {
    const url = apiUrl("/api/email/draft/update");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ id: Number(emailId), ...data }),
    });
    return handleResp<any>(resp);
  },

  async updateEmailAttachment(data: any): ApiResult<any> {
    const url = apiUrl("/api/email/attachment/update");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(data),
    });
    return handleResp<any>(resp);
  },

  async moveEmail(email_id: number, user_id: number, target_folder: number): ApiResult<any> {
    const url = apiUrl("/api/email/move");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id, target_folder }),
    });
    return handleResp<any>(resp);
  },

  async deleteEmail(email_id: number, user_id: number): ApiResult<any> {
    const url = apiUrl("/api/email/delete");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id }),
    });
    return handleResp<any>(resp);
  },

  async deletePermanently(email_id: number, user_id: number): ApiResult<any> {
    const url = apiUrl("/api/email/delete-permanent");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id }),
    });
    return handleResp<any>(resp);
  },

  async performBulkAction(userId: number, email_ids: number[], action: 'delete' | 'star' | 'read', value?: boolean): ApiResult<any> {
    const url = apiUrl("/api/email/bulk-actions");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, email_ids, action, value }),
    });
    return handleResp<any>(resp);
  },

  async star(email_id: number, user_id: number, status: boolean): ApiResult<any> {
    const url = apiUrl("/api/email/star");
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id, status }),
    });
    return handleResp<any>(resp);
  },

  async getCarbonMetricsMe(mode?: 'realistic' | 'medium' | 'gamified') {
    const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
    const url = apiUrl(`/api/carbon/metrics/me${qs}`);
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
    });
    return handleResp<any>(resp);
  },

  async submitCarbonCredits(payload: any) {
    const url = apiUrl('/api/carbon/submit');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResp<any>(resp);
  },

  async checkEmailExists(email: string): ApiResult<any> {
    const url = apiUrl(`/api/users/email/${encodeURIComponent(email)}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    return handleResp<any>(resp);
  },

  async getEmailById(emailId: number | string): ApiResult<any> {
    const url = apiUrl(`/api/email/${emailId}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    return handleResp<any>(resp);
  },

  async searchUsers(query: string): ApiResult<any[]> {
    const url = apiUrl(`/api/users/search?q=${encodeURIComponent(query)}`);
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });
    return handleResp<any[]>(resp);
  },
};

