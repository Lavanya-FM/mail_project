/**
 * Email Threading Service
 * Manages email threads for replies, forwards, and related conversations
 */

import { emailService } from './emailService';

export interface ThreadedEmail {
  id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  from_name?: string;
  created_at: string;
  is_reply: boolean;
  is_forward: boolean;
  body?: string;
  to_emails?: any[];
}

export interface EmailThread {
  thread_id: string;
  subject: string;
  emails: ThreadedEmail[];
  unread_count: number;
  last_email_date: string;
}

export const threadingService = {
  /**
   * Generate thread ID from subject and participants
   */
  generateThreadId: (subject: string, participants: string[]): string => {
    // Normalize subject (remove Re:, Fwd:, etc.)
    const normalizedSubject = subject
      .replace(/^(Re:|Fwd:|Re\[.*?\]:)/gi, '')
      .trim()
      .toLowerCase();

    // Sort participants for consistency
    const sortedParticipants = participants.sort().join('|');

    // Create hash-like ID using btoa (browser-compatible)
    const combined = `${normalizedSubject}|${sortedParticipants}`;
    const encoded = btoa(combined).slice(0, 16);
    return `thread_${encoded}`;
  },

  /**
   * Extract participants from email
   */
  getParticipants: (email: any): string[] => {
    const participants = new Set<string>();
    
    if (email.from_email) participants.add(email.from_email);
    if (email.to_emails && Array.isArray(email.to_emails)) {
      email.to_emails.forEach((to: any) => {
        if (to.email) participants.add(to.email);
      });
    }
    if (email.cc_emails && Array.isArray(email.cc_emails)) {
      email.cc_emails.forEach((cc: any) => {
        if (cc.email) participants.add(cc.email);
      });
    }

    return Array.from(participants);
  },

  /**
   * Check if email is a reply
   */
  isReply: (subject: string): boolean => {
    return /^Re:/i.test(subject);
  },

  /**
   * Check if email is a forward
   */
  isForward: (subject: string): boolean => {
    return /^Fwd:/i.test(subject);
  },

  /**
   * Get base subject (without Re:, Fwd:, etc.)
   */
  getBaseSubject: (subject: string): string => {
    return subject
      .replace(/^(Re:|Fwd:|Re\[.*?\]:)/gi, '')
      .trim();
  },

  /**
   * Create reply with threading
   */
  createReply: async (
    originalEmail: any,
    replyBody: string,
    userId: string,
    userEmail: string,
    toEmails: any[],
    ccEmails?: any[]
  ) => {
    try {
      // Get or create thread ID
      const participants = threadingService.getParticipants(originalEmail);
      const threadId = originalEmail.thread_id || 
        threadingService.generateThreadId(originalEmail.subject || '', participants);

      // Create reply subject
      const baseSubject = threadingService.getBaseSubject(originalEmail.subject || '');
      const replySubject = originalEmail.subject?.startsWith('Re:') 
        ? originalEmail.subject 
        : `Re: ${baseSubject}`;

      // Create reply email
      const replyEmail = {
        user_id: userId,
        from_email: userEmail,
        to_emails: toEmails,
        cc_emails: ccEmails || [],
        bcc_emails: [],
        subject: replySubject,
        body: replyBody,
        thread_id: threadId,
        is_draft: false,
        has_attachments: false,
      };

      const result = await emailService.createEmail(replyEmail);
      return result;
    } catch (error) {
      console.error('Error creating reply:', error);
      throw error;
    }
  },

  /**
   * Create forward with threading
   */
  createForward: async (
    originalEmail: any,
    forwardBody: string,
    userId: string,
    userEmail: string,
    toEmails: any[],
    ccEmails?: any[]
  ) => {
    try {
      // Create new thread for forward (separate from original)
      const participants = [userEmail, ...toEmails.map((t: any) => t.email)];
      const threadId = threadingService.generateThreadId(
        originalEmail.subject || '',
        participants
      );

      // Create forward subject
      const baseSubject = threadingService.getBaseSubject(originalEmail.subject || '');
      const forwardSubject = originalEmail.subject?.startsWith('Fwd:') 
        ? originalEmail.subject 
        : `Fwd: ${baseSubject}`;

      // Create forward email
      const forwardEmail = {
        user_id: userId,
        from_email: userEmail,
        to_emails: toEmails,
        cc_emails: ccEmails || [],
        bcc_emails: [],
        subject: forwardSubject,
        body: forwardBody,
        thread_id: threadId,
        is_draft: false,
        has_attachments: false,
      };

      const result = await emailService.createEmail(forwardEmail);
      return result;
    } catch (error) {
      console.error('Error creating forward:', error);
      throw error;
    }
  },

  /**
   * Get all emails in a thread
   */
  getThread: async (threadId: string, userId: string): Promise<EmailThread | null> => {
    try {
      const { data: emails } = await emailService.getEmails(userId);
      
      if (!emails) return null;

      // Filter emails in this thread
      const threadEmails = emails
        .filter((email: any) => email.thread_id === threadId)
        .sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map((email: any) => ({
          id: email.id,
          thread_id: email.thread_id,
          subject: email.subject,
          from_email: email.from_email,
          from_name: email.from_name,
          created_at: email.created_at,
          is_reply: threadingService.isReply(email.subject || ''),
          is_forward: threadingService.isForward(email.subject || ''),
          body: email.body,
          to_emails: email.to_emails,
        }));

      if (threadEmails.length === 0) return null;

      const unreadCount = threadEmails.filter((e: any) => !e.is_read).length;
      const lastEmailDate = threadEmails[threadEmails.length - 1].created_at;

      return {
        thread_id: threadId,
        subject: threadingService.getBaseSubject(threadEmails[0].subject || ''),
        emails: threadEmails,
        unread_count: unreadCount,
        last_email_date: lastEmailDate,
      };
    } catch (error) {
      console.error('Error getting thread:', error);
      return null;
    }
  },

  /**
   * Get all threads for a user
   */
  getThreads: async (userId: string): Promise<EmailThread[]> => {
    try {
      const { data: emails } = await emailService.getEmails(userId);
      
      if (!emails) return [];

      // Group emails by thread_id
      const threadMap = new Map<string, any[]>();
      
      emails.forEach((email: any) => {
        if (email.thread_id) {
          if (!threadMap.has(email.thread_id)) {
            threadMap.set(email.thread_id, []);
          }
          threadMap.get(email.thread_id)!.push(email);
        }
      });

      // Convert to EmailThread objects
      const threads: EmailThread[] = [];
      
      threadMap.forEach((threadEmails, threadId) => {
        threadEmails.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const unreadCount = threadEmails.filter((e: any) => !e.is_read).length;
        const lastEmailDate = threadEmails[threadEmails.length - 1].created_at;

        threads.push({
          thread_id: threadId,
          subject: threadingService.getBaseSubject(threadEmails[0].subject || ''),
          emails: threadEmails.map((email: any) => ({
            id: email.id,
            thread_id: email.thread_id,
            subject: email.subject,
            from_email: email.from_email,
            from_name: email.from_name,
            created_at: email.created_at,
            is_reply: threadingService.isReply(email.subject || ''),
            is_forward: threadingService.isForward(email.subject || ''),
          })),
          unread_count: unreadCount,
          last_email_date: lastEmailDate,
        });
      });

      // Sort by last email date (newest first)
      return threads.sort((a, b) => 
        new Date(b.last_email_date).getTime() - new Date(a.last_email_date).getTime()
      );
    } catch (error) {
      console.error('Error getting threads:', error);
      return [];
    }
  },

  /**
   * Mark entire thread as read
   */
  markThreadAsRead: async (threadId: string, userId: string): Promise<boolean> => {
    try {
      const { data: emails } = await emailService.getEmails(userId);
      
      if (!emails) return false;

      const threadEmails = emails.filter((e: any) => e.thread_id === threadId);
      
      for (const email of threadEmails) {
        if (!email.is_read) {
          await emailService.updateEmail(email.id, { is_read: true });
        }
      }

      return true;
    } catch (error) {
      console.error('Error marking thread as read:', error);
      return false;
    }
  },

  /**
   * Star entire thread
   */
  starThread: async (threadId: string, userId: string, starred: boolean): Promise<boolean> => {
    try {
      const { data: emails } = await emailService.getEmails(userId);
      
      if (!emails) return false;

      const threadEmails = emails.filter((e: any) => e.thread_id === threadId);
      
      for (const email of threadEmails) {
        await emailService.updateEmail(email.id, { is_starred: starred });
      }

      return true;
    } catch (error) {
      console.error('Error starring thread:', error);
      return false;
    }
  },
};
