import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || process.env.REACT_APP_BACKEND_URL || '';

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

interface GlobalHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightComponent?: React.ReactNode;
}

export default function GlobalHeader({ title, showBack = false, onBack, rightComponent }: GlobalHeaderProps) {
  const router = useRouter();
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeScans.length > 0) {
      // Start pulsing animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeScans.length, pulseAnim]);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      // Fetch active scans
      const scansResponse = await axios.get(`${API_URL}/api/scans/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveScans(scansResponse.data.active_scans || []);

      // Fetch notifications
      const notifResponse = await axios.get(`${API_URL}/api/notifications?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(notifResponse.data || []);
    } catch (error) {
      // Silently fail polling
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const markAllRead = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const isScanning = activeScans.length > 0;

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    return `Il y a ${Math.floor(diff / 86400)}j`;
  };

  return (
    <>
      <View style={styles.header}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {/* Active Scan Indicator */}
          {isScanning && (
            <Animated.View style={[styles.scanningBadge, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.scanningDot} />
              <Text style={styles.scanningText} numberOfLines={1}>
                Scan en cours...
              </Text>
            </Animated.View>
          )}

          {/* Notifications Bell */}
          <TouchableOpacity 
            style={styles.notificationBtn}
            onPress={() => setShowNotifications(true)}
          >
            <Ionicons name="notifications-outline" size={22} color="#666" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {rightComponent}
        </View>
      </View>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <View style={styles.modalHeaderRight}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>Tout marquer lu</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotifications(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.notificationsList}>
              {notifications.length === 0 ? (
                <View style={styles.emptyNotifications}>
                  <Ionicons name="notifications-off-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>Aucune notification</Text>
                </View>
              ) : (
                notifications.map((notif) => (
                  <View 
                    key={notif.id} 
                    style={[styles.notificationItem, !notif.is_read && styles.notificationUnread]}
                  >
                    <View style={styles.notificationIcon}>
                      <Ionicons 
                        name={
                          notif.type === 'scan_complete' ? 'checkmark-circle' :
                          notif.type === 'enrichment_complete' ? 'globe' :
                          'information-circle'
                        } 
                        size={24} 
                        color={
                          notif.type === 'scan_complete' ? '#10B981' :
                          notif.type === 'enrichment_complete' ? '#6366F1' :
                          '#3B82F6'
                        }
                      />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationTitle}>{notif.title}</Text>
                      <Text style={styles.notificationMessage}>{notif.message}</Text>
                      <Text style={styles.notificationTime}>{formatTimeAgo(notif.created_at)}</Text>
                    </View>
                    {!notif.is_read && <View style={styles.unreadDot} />}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    maxWidth: 150,
  },
  scanningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
  },
  scanningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
  },
  notificationBtn: {
    padding: 8,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  notificationsList: {
    padding: 16,
  },
  emptyNotifications: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  notificationUnread: {
    backgroundColor: '#EEF2FF',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 2,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
    marginLeft: 8,
  },
});
