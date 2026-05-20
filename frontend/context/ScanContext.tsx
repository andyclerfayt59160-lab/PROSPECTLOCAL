import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';

interface ActiveScan {
  id: string;
  query_label: string;
  status: string;
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
  markAllRead: () => Promise<void>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

function shouldSilencePollingError(error: any) {
  const status = error?.response?.status;
  return status === 401 || status === 403 || status === 404;
}

const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING', 'IN_PROGRESS', 'PROCESSING']);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const refreshActiveScans = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        setActiveScans([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/scans/active`, { headers });
      const scans = Array.isArray(response.data?.active_scans) ? response.data.active_scans : [];
      setActiveScans(scans);
    } catch (error) {
      setActiveScans([]);
      if (!shouldSilencePollingError(error)) {
        console.error('Error fetching active scans:', error);
      }
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        setNotifications([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/notifications`, { headers });
      setNotifications(response.data?.notifications || []);
    } catch (error) {
      setNotifications([]);
      if (!shouldSilencePollingError(error)) {
        console.error('Error fetching notifications:', error);
      }
    }
  }, []);

  const addActiveScan = useCallback((scan: ActiveScan) => {
    setActiveScans((current) => {
      if (current.some((item) => item.id === scan.id)) {
        return current;
      }
      return [...current, scan];
    });
  }, []);

  const removeActiveScan = useCallback((scanId: string) => {
    setActiveScans((current) => current.filter((scan) => scan.id !== scanId));
  }, []);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return;
      await axios.patch(`${API_URL}/api/notifications/${notificationId}/read`, {}, { headers });
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: true } : notification,
        ),
      );
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return;
      await axios.patch(`${API_URL}/api/notifications/read-all`, {}, { headers });
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  }, []);

  useEffect(() => {
    refreshActiveScans();
    refreshNotifications();

    const interval = setInterval(() => {
      refreshActiveScans();
      refreshNotifications();
    }, 15000);

    return () => clearInterval(interval);
  }, [refreshActiveScans, refreshNotifications]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const isScanning = activeScans.length > 0;
  const currentScanLabel = activeScans[0]?.query_label || '';

  const value = useMemo(
    () => ({
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
      markAllRead: markAllNotificationsRead,
    }),
    [
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
    ],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScanContext() {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error('useScanContext must be used within a ScanProvider');
  }
  return context;
}

export const useScan = useScanContext;

export default ScanContext;
