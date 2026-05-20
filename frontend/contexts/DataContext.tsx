import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';

type NotificationItem = {
  id: string;
  is_read?: boolean;
  created_at: string;
  title: string;
  message: string;
};

type DataContextType = {
  scans: any[];
  notifications: NotificationItem[];
  visites: any[];
  loadingScans: boolean;
  loadingNotifications: boolean;
  loadingVisites: boolean;
  refreshScans: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshVisites: () => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
  updateScan: (scanId: string, patch: Record<string, unknown>) => void;
  deleteVisite: (businessId: string) => Promise<void>;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

function shouldSilenceBackgroundError(error: any) {
  const status = error?.response?.status;
  return status === 401 || status === 403 || status === 404;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [scans, setScans] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [visites, setVisites] = useState<any[]>([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [loadingVisites, setLoadingVisites] = useState(false);

  const refreshScans = useCallback(async () => {
    setLoadingScans(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        setScans([]);
        return;
      }
      const response = await axios.get(`${API_URL}/api/scans`, { headers });
      setScans(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setScans([]);
      if (!shouldSilenceBackgroundError(error)) {
        console.error('Error refreshing scans:', error);
      }
    } finally {
      setLoadingScans(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    setLoadingNotifications(true);
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
      if (!shouldSilenceBackgroundError(error)) {
        console.error('Error refreshing notifications:', error);
      }
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const refreshVisites = useCallback(async () => {
    setLoadingVisites(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        setVisites([]);
        return;
      }
      const response = await axios.get(`${API_URL}/api/businesses/visites`, { headers });
      setVisites(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setVisites([]);
      if (!shouldSilenceBackgroundError(error)) {
        console.error('Error refreshing visites:', error);
      }
    } finally {
      setLoadingVisites(false);
    }
  }, []);

  const deleteScan = useCallback(async (scanId: string) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    await axios.delete(`${API_URL}/api/scans/${scanId}`, { headers });
    setScans((current) => current.filter((scan) => scan.id !== scanId));
  }, []);

  const updateScan = useCallback((scanId: string, patch: Record<string, unknown>) => {
    setScans((current) =>
      current.map((scan) => (scan.id === scanId ? { ...scan, ...patch } : scan)),
    );
  }, []);

  const deleteVisite = useCallback(async (businessId: string) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    await axios.patch(
      `${API_URL}/api/businesses/${businessId}/status`,
      { visite_status: 'client' },
      { headers },
    );
    setVisites((current) => current.filter((business) => business.id !== businessId));
  }, []);

  useEffect(() => {
    refreshScans();
    refreshNotifications();
    refreshVisites();
  }, [refreshNotifications, refreshScans, refreshVisites]);

  const value = useMemo(
    () => ({
      scans,
      notifications,
      visites,
      loadingScans,
      loadingNotifications,
      loadingVisites,
      refreshScans,
      refreshNotifications,
      refreshVisites,
      deleteScan,
      updateScan,
      deleteVisite,
    }),
    [
      scans,
      notifications,
      visites,
      loadingScans,
      loadingNotifications,
      loadingVisites,
      refreshScans,
      refreshNotifications,
      refreshVisites,
      deleteScan,
      updateScan,
      deleteVisite,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
