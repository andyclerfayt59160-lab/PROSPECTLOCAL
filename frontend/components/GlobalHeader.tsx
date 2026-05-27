import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useScan } from '../context/ScanContext';

interface GlobalHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightComponent?: React.ReactNode;
}

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/scan-internet': 'Scan Tout Internet',
  '/scan-pappers': 'Scan Pappers+',
  '/audit-site-externe': 'Audit site externe',
  '/portail-audit-sites': 'Portail audit sites',
  '/portail-audit-sites-login': 'Connexion audit sites',
  '/newscan': 'Nouveau scan web',
  '/pappersscan': 'Nouveau scan Pappers+',
  '/webscan': 'Nouveau scan internet',
  '/results': 'Résultats',
  '/businessdetail': 'Fiche établissement',
  '/visites': 'Visites terrain',
  '/visitedetail': 'Détail visite',
  '/stats': 'Statistiques',
  '/notifications': 'Notifications',
  '/surveillance': 'Surveillance',
  '/duplicates': 'Doublons',
  '/crm': 'CRM',
  '/settings': 'Paramètres',
  '/credits': 'Crédits API',
  '/export': 'Exports',
  '/health': 'Santé',
  '/search': 'Recherche',
  '/admin': 'Administration',
};

function formatTimeAgo(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return `Il y a ${Math.floor(diff / 86400)}j`;
}

function getNotificationTarget(notification: any) {
  const scanId = notification?.scan_id || notification?.data?.scan_id;
  const businessId = notification?.business_id || notification?.data?.business_id;

  if (scanId) {
    return `/results?scanId=${scanId}&direct=1`;
  }
  if (businessId) {
    return `/businessdetail?businessId=${businessId}`;
  }
  return null;
}

export default function GlobalHeader({ title, showBack, onBack, rightComponent }: GlobalHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const { activeScans, notifications, unreadCount, markAllRead, markNotificationRead } = useScan();

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    return TITLES[pathname] || 'PROSPECTLOCAL V2';
  }, [pathname, title]);

  const shouldShowBack = showBack ?? !['/dashboard', '/home'].includes(pathname);

  return (
    <>
      <View style={styles.header}>
        <View style={styles.leftSection}>
          {shouldShowBack ? (
            <TouchableOpacity onPress={onBack ?? (() => router.back())} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
          ) : null}
          <View>
            <Text style={styles.title}>{resolvedTitle}</Text>
            {activeScans.length > 0 ? (
              <Text style={styles.subtitle}>
                {activeScans[0]?.progress_message
                  ? `${activeScans[0].progress_message}${typeof activeScans[0]?.progress === 'number' ? ` (${activeScans[0].progress}%)` : ''}`
                  : `${activeScans.length} scan(s) en cours`}
              </Text>
            ) : (
              <Text style={styles.subtitle}>Prospection locale intelligente</Text>
            )}
          </View>
        </View>

        <View style={styles.rightSection}>
          <TouchableOpacity style={styles.notificationButton} onPress={() => setShowNotifications(true)}>
            <Ionicons name="notifications-outline" size={20} color="#334155" />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          {rightComponent}
        </View>
      </View>

      <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <View style={styles.modalActions}>
                {unreadCount > 0 ? (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={styles.markAll}>Tout marquer lu</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setShowNotifications(false)} style={styles.iconButton}>
                  <Ionicons name="close" size={20} color="#334155" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.list}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyText}>Aucune notification pour le moment.</Text>
              ) : (
                notifications.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={[styles.notificationItem, !notification.is_read && styles.unread]}
                    activeOpacity={0.8}
                    onPress={async () => {
                      if (!notification.is_read) {
                        await markNotificationRead(notification.id);
                      }
                      const target = getNotificationTarget(notification);
                      if (!target) {
                        return;
                      }
                      setShowNotifications(false);
                      router.push(target as any);
                    }}
                  >
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationTime}>{formatTimeAgo(notification.created_at)}</Text>
                  </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markAll: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  list: {
    padding: 16,
  },
  notificationItem: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  unread: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  notificationTime: {
    marginTop: 8,
    fontSize: 12,
    color: '#94A3B8',
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
