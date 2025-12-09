// src/lib/emailService.ts

const API = import.meta.env.VITE_API_URL;

export const emailService = {
  async getEmails(userId: number, folderId: number) {
    const res = await fetch(`${API}/emails/${userId}/${folderId}`);
    const data = await res.json();
    return data.data;
  },

  async createEmail(payload: any) {
    const res = await fetch(`${API}/email/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async moveEmail(emailId: number, userId: number, targetFolder: number) {
    const res = await fetch(`${API}/email/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_id: emailId,
        user_id: userId,
        target_folder: targetFolder
      })
    });
    return res.json();
  },

  async deleteEmail(emailId: number, userId: number) {
    const res = await fetch(`${API}/email/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: emailId, user_id: userId })
    });
    return res.json();
  },

  async starEmail(emailId: number, userId: number, status: number) {
    const res = await fetch(`${API}/email/star`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_id: emailId,
        user_id: userId,
        status
      })
    });
    return res.json();
  },

  async markRead(emailId: number, userId: number, status: number) {
    const res = await fetch(`${API}/email/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_id: emailId,
        user_id: userId,
        status
      })
    });
    return res.json();
  }
};
