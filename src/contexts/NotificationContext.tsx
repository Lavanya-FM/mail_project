import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'mail' | 'file' | 'call';
  timestamp: Date;
  isRead: boolean;
  link?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('jeemail_notifications');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('jeemail_notifications', JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => {
    const newNotification: AppNotification = {
      ...notification,
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date(),
      isRead: false,
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Listen for global notification events
  useEffect(() => {
    const handleGlobalNotification = (e: any) => {
      const { title, message, type, link } = e.detail || {};
      if (title && message) {
        addNotification({ title, message, type: type || 'info', link });
      }
    };

    window.addEventListener('app-notification', handleGlobalNotification);
    return () => window.removeEventListener('app-notification', handleGlobalNotification);
  }, [addNotification]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotification,
      clearAll
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
