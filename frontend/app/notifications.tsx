import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  scan_id?: string;
  business_id?: string;
  data?: any;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        router.replace('/login');
        return;
      }

      const response = await axios.get(`${API_URL}/api/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
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
  };

  const markAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    const scanId = notification.scan_id || notification.data?.scan_id;
    const businessId = notification.business_id || notification.data?.business_id;

    // Navigate based on notification type
    if (scanId) {
      router.push(`/results?scanId=${scanId}&direct=1`);
    } else if (businessId) {
      router.push(`/businessdetail?businessId=${businessId}`);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'scan_complete':
        return { icon: 'checkmark-circle', color: '#10B981', bg: '#ECFDF5' };
      case 'new_businesses':
        return { icon: 'business', color: '#6366F1', bg: '#EEF2FF' };
      case 'visite_terrain':
        return { icon: 'walk', color: '#F59E0B', bg: '#FFFBEB' };
      case 'enrichment_complete':
        return { icon: 'cloud-done', color: '#8B5CF6', bg: '#F5F3FF' };
      default:
        return { icon: 'notifications', color: '#6B7280', bg: '#F3F4F6' };
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Chargement des notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/home')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="notifications" size={24} color="#6366F1" />
          <Text style={styles.headerText}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Tout lire</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#6366F1']} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptySubtext}>
              Vos notifications apparaîtront ici lorsque vous aurez de nouvelles activités
            </Text>
          </View>
        ) : (
          <>
            {/* Today's notifications */}
            {notifications.filter(n => {
              const date = new Date(n.created_at);
              const today = new Date();
              return date.toDateString() === today.toDateString();
            }).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Aujourd'hui</Text>
                {notifications
                  .filter(n => {
                    const date = new Date(n.created_at);
                    const today = new Date();
                    return date.toDateString() === today.toDateString();
                  })
                  .map(notification => {
                    const { icon, color, bg } = getNotificationIcon(notification.type);
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        style={[
                          styles.notificationCard,
                          !notification.is_read && styles.notificationUnread,
                        ]}
                        onPress={() => handleNotificationPress(notification)}
                      >
                        <View style={[styles.iconContainer, { backgroundColor: bg }]}>
                          <Ionicons name={icon as any} size={24} color={color} />
                        </View>
                        <View style={styles.notificationContent}>
                          <Text
                            style={[
                              styles.notificationTitle,
                              !notification.is_read && styles.notificationTitleUnread,
                            ]}
                          >
                            {notification.title}
                          </Text>
                          <Text style={styles.notificationMessage} numberOfLines={2}>
                            {notification.message}
                          </Text>
                          <Text style={styles.notificationTime}>
                            {formatDate(notification.created_at)}
                          </Text>
                        </View>
                        {!notification.is_read && <View style={styles.unreadDot} />}
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {/* Earlier notifications */}
            {notifications.filter(n => {
              const date = new Date(n.created_at);
              const today = new Date();
              return date.toDateString() !== today.toDateString();
            }).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Plus tôt</Text>
                {notifications
                  .filter(n => {
                    const date = new Date(n.created_at);
                    const today = new Date();
                    return date.toDateString() !== today.toDateString();
                  })
                  .map(notification => {
                    const { icon, color, bg } = getNotificationIcon(notification.type);
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        style={[
                          styles.notificationCard,
                          !notification.is_read && styles.notificationUnread,
                        ]}
                        onPress={() => handleNotificationPress(notification)}
                      >
                        <View style={[styles.iconContainer, { backgroundColor: bg }]}>
                          <Ionicons name={icon as any} size={24} color={color} />
                        </View>
                        <View style={styles.notificationContent}>
                          <Text
                            style={[
                              styles.notificationTitle,
                              !notification.is_read && styles.notificationTitleUnread,
                            ]}
                          >
                            {notification.title}
                          </Text>
                          <Text style={styles.notificationMessage} numberOfLines={2}>
                            {notification.message}
                          </Text>
                          <Text style={styles.notificationTime}>
                            {formatDate(notification.created_at)}
                          </Text>
                        </View>
                        {!notification.is_read && <View style={styles.unreadDot} />}
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F8',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  markAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  markAllText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 280,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  notificationUnread: {
    backgroundColor: '#F8FAFF',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  notificationTitleUnread: {
    fontWeight: '700',
    color: '#1a1a2e',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366F1',
    marginRight: 8,
  },
});
