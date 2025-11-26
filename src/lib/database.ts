// Placeholder - all operations now go through emailService API
export const dbOperations = {
  async getUser(id: string) {
    return null;
  },
  async getUserByEmail(email: string) {
    return null;
  },
  async createUser(user: any) {
    return { success: false };
  },
  async updateUser(id: string, updates: any) {
    return { success: false };
  },
  async getEmails(userId: string) {
    return [];
  },
  async createFolder(folder: any) {
    return { success: false };
  }
};
