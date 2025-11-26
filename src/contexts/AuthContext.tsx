// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authService } from "../lib/authService";

interface User {
  id: number;
  email: string;
  name: string;
  full_name?: string;
  storage_used?: number;
  storage_limit?: number;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load user from authService on mount
    const currentUser = authService.getCurrentUser();
    console.log('🔄 AuthContext: Loading user from authService:', currentUser);
    if (currentUser) {
      setUser(currentUser);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    console.log('🔐 AuthContext: Login called');
    const result = await authService.login(email, password);
    console.log('🔐 AuthContext: Login result:', result);
    
    if (result.success && result.user) {
      console.log('✅ AuthContext: Setting user state:', result.user);
      setUser(result.user);
      return { success: true };
    }
    
    console.error('❌ AuthContext: Login failed:', result.error);
    return { success: false, error: result.error };
  };

  const register = async (name: string, email: string, password: string) => {
    console.log('📝 AuthContext: Register called');
    const result = await authService.register(name, email, password);
    console.log('📝 AuthContext: Register result:', result);
    
    if (result.success && result.user) {
      console.log('✅ AuthContext: Setting user state:', result.user);
      setUser(result.user);
      return { success: true };
    }
    
    console.error('❌ AuthContext: Register failed:', result.error);
    return { success: false, error: result.error };
  };

  const logout = () => {
    console.log('👋 AuthContext: Logout called');
    authService.logout();
    setUser(null);
  };

  console.log('🔍 AuthContext: Current state - user:', user, 'isAuthenticated:', !!user, 'loading:', loading);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      // canonical names
      login,
      register,
      logout,
      isAuthenticated: !!user,
      // aliases (for components that use signIn/signUp)
      signIn: login,
      signUp: register
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
