import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  created_at: string;
  // Note: updated_at is not included as it doesn't exist in the current schema
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'id' | 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      folders: {
        Row: {
          id: number;
          name: string;
          icon: string;
          color: string;
          position: number;
          is_system: boolean;
          user_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['folders']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['folders']['Insert']>;
      };
      emails: {
        Row: {
          id: number;
          user_id: string;
          folder_id: number;
          from_email: string;
          from_name: string | null;
          to_emails: Array<{ email: string; name: string }>;
          cc_emails: Array<{ email: string; name: string }> | null;
          bcc_emails: Array<{ email: string; name: string }> | null;
          subject: string;
          body: string;
          is_read: boolean;
          is_starred: boolean;
          is_draft: boolean;
          is_snoozed: boolean;
          has_attachments: boolean;
          thread_id: string | null;
          sent_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['emails']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['emails']['Insert']>;
      };
    };
  };
}
