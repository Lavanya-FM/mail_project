export interface Email {
  id: string | number;
  user_id?: string | number;
  folder_id?: string | number;
  thread_id?: string | number;
  from_email?: string;
  from_name?: string;
  to_emails?: any[];
  cc_emails?: any[];
  bcc_emails?: any[];
  subject?: string;
  body?: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_draft?: boolean;
  has_attachments?: boolean;
  created_at?: string;
  sent_at?: string;
  labels?: any[];
  status?: 'sent' | 'delivered' | 'read';
  delivery_status?: 'sending' | 'delivered' | 'failed' | 'draft' | 'not_sent';
  smtp_error?: string;
  scan_result?: {
    status: 'clean' | 'suspicious' | 'danger';
    flags: string[];
    timestamp: number;
  };
  [k: string]: any;
}

export interface Folder {
  id: string | number;
  name: string;
  user_id?: string | number;
  created_at?: string;
  icon?: string;
  color?: string;
  [k: string]: any;
}
