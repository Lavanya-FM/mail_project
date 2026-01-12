// ✅ User returned from backend (SAFE)
export interface UserDTO {
  id: number;
  full_name: string;
  email: string;
  email_username?: string;
  storage_used?: number;
  storage_limit?: number;
}

// ❌ NEVER allow password in frontend types
export interface LoginResponse {
  user: UserDTO;
}

export interface AuthResult {
  success: boolean;
  user?: UserDTO;
  error?: string;
}
