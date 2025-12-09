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

function authHeaders() {
  const token =
    localStorage.getItem("token") || (window as any).__authToken || null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// -------------------------------------------------------------
// NORMALIZE RECIPIENT LISTS
// -------------------------------------------------------------
function normalizeRecipientList(list: any): string[] {
  if (!list) return [];
  return (Array.isArray(list) ? list : [])
    .map((x) =>
      typeof x === "string"
        ? x.trim().toLowerCase()
        : (x?.email || x?.address || "").trim().toLowerCase()
    )
    .filter(Boolean);
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

// -------------------------------------------------------------
// GET FOLDERS
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
    }));

    localStorage.setItem("folders", JSON.stringify(folders));

    return { data: folders, status: result.status };
  },

  // -------------------------------------------------------------
  // GET EMAILS (with full normalization)
  // -------------------------------------------------------------
  async getEmails(
    userId: number | string,
    folderId?: number | string
  ): ApiResult<any[]> {
    let fid: number | null;

    if (!folderId) fid = getFolderIdByName("inbox");
    else if (isNaN(Number(folderId)))
      fid = getFolderIdByName(String(folderId));
    else fid = Number(folderId);

    if (!fid) return { error: "Invalid folderId", status: 400 };

    const url = apiUrl(`/api/emails/${userId}/${fid}`);

    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });

    const r = await handleResp<any>(resp);

    const raw = r.data || [];

    // Normalize recipients for UI
    raw.forEach((email: any) => {
      email.to_emails = (email.to_emails || []).map((t: any) => ({
        email: t.email || t,
      }));
      email.cc_emails = (email.cc_emails || []).map((t: any) => ({
        email: t.email || t,
      }));
      email.bcc_emails = (email.bcc_emails || []).map((t: any) => ({
        email: t.email || t,
      }));
    });

    return { data: raw, status: r.status };
  },

  // -------------------------------------------------------------
  // CREATE EMAIL (FULL PATCH WITH THREADING)
  // -------------------------------------------------------------
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
      thread_id: payload.thread_id || null,

      // Gmail-style threading
      in_reply_to: payload.in_reply_to || null,
      references: payload.references || null,

      // Normalize recipient arrays
      to_emails: normalizeRecipientList(payload.to_emails).map((e) => ({
        email: e,
      })),
      cc_emails: normalizeRecipientList(payload.cc_emails).map((e) => ({
        email: e,
      })),
      bcc_emails: normalizeRecipientList(payload.bcc_emails).map((e) => ({
        email: e,
      })),
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(bodyClean),
    });

    const result = await handleResp<any>(resp);

    if (result.error) console.error("Email send error:", result.error);

    return result;
  },

  // -------------------------------------------------------------
  // UPDATE EMAIL (read/star/folder)
  // -------------------------------------------------------------
  async updateEmail(emailId: number | string, data: any): ApiResult<any> {
    const url = apiUrl("/api/email/update");

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({
        email_id: Number(emailId),
        ...data,
      }),
    });

    return handleResp<any>(resp);
  },

  // -------------------------------------------------------------
  // MOVE EMAIL
  // -------------------------------------------------------------
  async moveEmail(
    email_id: number,
    user_id: number,
    target_folder: number
  ): ApiResult<any> {
    const url = apiUrl("/api/email/move");

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id, target_folder }),
    });

    return handleResp<any>(resp);
  },

  // -------------------------------------------------------------
  // DELETE EMAIL
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // STAR
  // -------------------------------------------------------------
  async star(
    email_id: number,
    user_id: number,
    status: boolean
  ): ApiResult<any> {
    const url = apiUrl("/api/email/star");

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ email_id, user_id, status }),
    });

    return handleResp<any>(resp);
  },

  // -------------------------------------------------------------
  // CHECK EMAIL EXISTENCE
  // -------------------------------------------------------------
  async checkEmailExists(email: string): ApiResult<any> {
    const url = apiUrl(`/api/users/email/${encodeURIComponent(email)}`);

    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
    });

    return handleResp<any>(resp);
  },
};
