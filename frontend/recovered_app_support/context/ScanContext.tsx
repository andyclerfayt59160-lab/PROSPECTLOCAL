import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || process.env.REACT_APP_BACKEND_URL || '';

interface ActiveScan {
  id: string;
  query_label: string;
  status: string;
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: any;
}

interface ScanContextType {
  activeScans: ActiveScan[];
  notifications: Notification[];
  unreadCount: number;
  isScanning: boolean;
  currentScanLabel: string;
  addActiveScan: (scan: ActiveScan) => void;
  removeActiveScan: (scanId: string) => void;
  refreshActiveScans: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export const useScanContext = () => {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error('useScanContext must be used within a ScanProvider');
  }
  return context;
};

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const refreshActiveScans = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/scans/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setActiveScans(response.data.active_scans || []);
    } catch (error) {
      console.error('Error fetching active scans:', error);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications(response.data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, []);

  const addActiveScan = useCallback((scan: ActiveScan) => {
    setActiveScans(prev => [...prev, scan]);
  }, []);

  const removeActiveScan = useCallback((scanId: string) => {
    setActiveScans(prev => prev.filter(s => s.id !== scanId));
  }, []);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/notifications/${notificationId}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  }, []);

  // Start polling when there are active scans
  useEffect(() => {
    if (activeScans.length > 0 && !pollingInterval) {
      const interval = setInterval(() => {
        refreshActiveScans();
        refreshNotifications();
      }, 3000); // Poll every 3 seconds
      setPollingInterval(interval);
    } else if (activeScans.length === 0 && pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [activeScans.length, pollingInterval, refreshActiveScans, refreshNotifications]);

  // Initial load
  useEffect(() => {
    refreshActiveScans();
    refreshNotifications();
  }, [refreshActiveScans, refreshNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const isScanning = activeScans.length > 0;
  const currentScanLabel = activeScans[0]?.query_label || '';

  return (
    <ScanContext.Provider
      value={{
        activeScans,
        notifications,
        unreadCount,
        isScanning,
        currentScanLabel,
        addActiveScan,
        removeActiveScan,
        refreshActiveScans,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
};

export default ScanContext;
