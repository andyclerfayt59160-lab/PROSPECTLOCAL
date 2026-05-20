import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { useData } from '../contexts/DataContext';

import { API_URL } from '../utils/api';

interface Scan {
  id: string;
  query_label: string;
  location_label: string;
  radius_km: number;
  max_age_days?: number;
  domains?: string[];
  search_mode?: string;
  created_at: string;
  last_scanned_at?: string;
  status: string;
  total_results: number;
  result_count?: number;  // Dynamic count from API
  is_favorite: boolean;
  new_businesses_count?: number;
  scan_type?: string;
  // Web enrichment info
  web_enriched?: boolean;
  web_enriched_count?: number;
  web_phones_found?: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  scan_id?: string;
  new_business_ids: string[];
  is_read: boolean;
  created_at: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { 
    scans: cachedScans, 
    notifications: cachedNotifications,
    refreshScans, 
    refreshNotifications,
    deleteScan: deleteScanFromCache,
    updateScan,
    loadingScans,
  } = useData();
  
  const [user, setUser] = useState<any>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<Scan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rescanningAll, setRescanningAll] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [apiKeysStatus, setApiKeysStatus] = useState({
    hasGoogleKey: false,
    hasSerperKey: false,
    hasPappersKey: false
  });

  // Use cached data when available
  useEffect(() => {
    if (cachedScans.length > 0) {
      setScans(cachedScans as Scan[]);
    }
    if (cachedNotifications.length > 0) {
      setNotifications(cachedNotifications as Notification[]);
      setUnreadCount(cachedNotifications.filter(n => !n.is_read).length);
    }
  }, [cachedScans, cachedNotifications]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Pull-to-refresh handler
  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    await Promise.all([refreshScans(), refreshNotifications()]);
    await loadData();
    setPullRefreshing(false);
  }, [refreshScans, refreshNotifications]);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');
      
      if (!token) {
        router.replace('/login');
        return;
      }

      const parsedUser = JSON.parse(userData || '{}');
      setUser(parsedUser);

      // Load scans (update both local state and cache)
      const scansResponse = await axios.get(`${API_URL}/api/scans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setScans(scansResponse.data);

      // Load notifications
      const notifResponse = await axios.get(`${API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(notifResponse.data.notifications || []);
      setUnreadCount(notifResponse.data.unread_count || 0);
      
      // Every user needs personal keys in the hosted app.
      try {
        const keysResponse = await axios.get(`${API_URL}/api/user/api-keys`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const hasGoogle = keysResponse.data.has_google_key || false;
        const hasSerper = keysResponse.data.has_serper_key || false;
        const hasPappers = keysResponse.data.has_pappers_key || false;
        
        setApiKeysStatus({
          hasGoogleKey: hasGoogle,
          hasSerperKey: hasSerper,
          hasPappersKey: hasPappers
        });
        
        setShowOnboarding(!hasGoogle || !hasSerper);
      } catch (error) {
        console.error('Error checking API keys:', error);
        // Don't show onboarding on error - don't block the user
        setShowOnboarding(false);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    router.replace('/login');
  };

  const handleDeleteScan = async (scan: Scan) => {
    // Ouvrir le modal de confirmation
    setScanToDelete(scan);
    setDeleteModalVisible(true);
  };

  const confirmDeleteScan = async () => {
    if (!scanToDelete) return;
    
    setDeleting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(`${API_URL}/api/scans/${scanToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Mettre à jour la liste localement
      setScans(prev => prev.filter(s => s.id !== scanToDelete.id));
      
      // Fermer le modal
      setDeleteModalVisible(false);
      setScanToDelete(null);
    } catch (error) {
      console.error('Error deleting scan:', error);
      Alert.alert('Erreur', 'Impossible de supprimer le scan');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async (scanId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.patch(
        `${API_URL}/api/scans/${scanId}/favorite`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setScans(prev => prev.map(s => 
        s.id === scanId ? { ...s, is_favorite: response.data.is_favorite } : s
      ));
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier le favori');
    }
  };

  const handleRescan = async (scanId: string) => {
    setRefreshing(scanId);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/scans/${scanId}/rescan`,
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 180000 }
      );
      
      Alert.alert(
        '✅ Re-scan terminé',
        `${response.data.new_businesses_count} nouveaux établissements détectés !`,
        [
          { 
            text: 'Voir les résultats', 
            onPress: () => router.push({ pathname: '/results', params: { scanId } })
          }
        ]
      );
      
      // Reload data
      loadData();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de relancer le scan');
    } finally {
      setRefreshing(null);
    }
  };

  const handleExportScan = async (scanId: string, scanLabel: string) => {
    setExporting(scanId);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/scans/${scanId}/export/csv`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      // For web, create download link
      if (Platform.OS === 'web') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${scanLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        Alert.alert('Export', 'L\'export CSV est disponible sur la version web');
      }
    } catch (error) {
      console.error('Export error:', error);
      if (Platform.OS === 'web') {
        window.alert('❌ Erreur lors de l\'export');
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter le scan');
      }
    } finally {
      setExporting(null);
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/notifications/${notifId}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setNotifications(prev => prev.map(n => 
        n.id === notifId ? { ...n, is_read: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  };

  const handleRescanAll = async () => {
    if (scans.length === 0) {
      Alert.alert('Info', 'Aucun scan à relancer');
      return;
    }
    
    // Confirmation
    const confirmRescan = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(`🔄 Relancer les ${scans.length} scans ?\n\nCette opération peut prendre plusieurs minutes.`));
        } else {
          Alert.alert(
            '🔄 Re-scan global',
            `Relancer tous vos ${scans.length} scans pour détecter de nouveaux établissements ?\n\nCette opération peut prendre plusieurs minutes.`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Lancer', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };
    
    const confirmed = await confirmRescan();
    if (!confirmed) return;
    
    setRescanningAll(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/scans/rescan-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 } // 10 minutes timeout
      );
      
      const { new_businesses_total, total_scans, scan_results } = response.data;
      
      // Reload data
      await loadData();
      
      // Show result
      const message = new_businesses_total > 0
        ? `🎉 ${new_businesses_total} nouveaux établissements détectés sur ${total_scans} scans !`
        : `✅ Aucun nouvel établissement détecté sur ${total_scans} scans.`;
      
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Re-scan terminé', message);
      }
      
    } catch (error: any) {
      console.error('Error in global rescan:', error);
      const errorMsg = error.response?.data?.detail || 'Une erreur est survenue';
      if (Platform.OS === 'web') {
        window.alert(`❌ Erreur: ${errorMsg}`);
      } else {
        Alert.alert('Erreur', errorMsg);
      }
    } finally {
      setRescanningAll(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredScans = activeTab === 'favorites' 
    ? scans.filter(s => s.is_favorite) 
    : scans;

  const renderScanItem = ({ item }: { item: Scan }) => {
    // Format period display
    const formatPeriod = (days?: number) => {
      if (!days) return null;
      if (days <= 30) return `${days} jours`;
      if (days <= 60) return '2 mois';
      if (days <= 90) return '3 mois';
      if (days <= 180) return '6 mois';
      if (days <= 365) return '1 an';
      if (days <= 730) return '2 ans';
      return `${Math.round(days / 365)} ans`;
    };

    // Format domains display
    const formatDomains = (domains?: string[]) => {
      if (!domains || domains.length === 0) return null;
      const labels: { [key: string]: string } = {
        'habitat': 'Habitat', 'auto': 'Auto', 'beaute': 'Beauté',
        'commerce': 'Commerce', 'restauration': 'Resto', 'sante': 'Santé',
        'b2b': 'B2B', 'sport': 'Sport', 'education': 'Éducation'
      };
      return domains.slice(0, 3).map(d => labels[d] || d).join(', ') + 
        (domains.length > 3 ? '...' : '');
    };

    const periodText = formatPeriod(item.max_age_days);
    const domainsText = formatDomains(item.domains);

    return (
    <View style={styles.scanCard}>
      <View style={styles.scanHeader}>
        <View style={styles.scanInfo}>
          <Text style={styles.scanTitle} numberOfLines={1}>{item.query_label}</Text>
          <Text style={styles.scanLocation}>
            📍 {item.location_label} {item.radius_km > 0 ? `(${item.radius_km}km)` : ''}
          </Text>
          {/* Scan parameters */}
          <View style={styles.scanParams}>
            {periodText && (
              <View style={styles.paramBadge}>
                <Ionicons name="calendar-outline" size={12} color="#6366F1" />
                <Text style={styles.paramText}>≤ {periodText}</Text>
              </View>
            )}
            {domainsText && (
              <View style={[styles.paramBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="briefcase-outline" size={12} color="#D97706" />
                <Text style={[styles.paramText, { color: '#D97706' }]}>{domainsText}</Text>
              </View>
            )}
          </View>
          <Text style={styles.scanDate}>
            {formatDate(item.created_at)}
            {item.last_scanned_at && item.last_scanned_at !== item.created_at && (
              <Text style={styles.rescanDate}>
                {' '}• Mis à jour: {formatDate(item.last_scanned_at)}
              </Text>
            )}
          </Text>
        </View>
        <View style={styles.scanStats}>
          <View style={styles.statBadge}>
            <Text style={styles.statNumber}>{item.result_count || item.total_results}</Text>
            <Text style={styles.statLabel}>résultats</Text>
          </View>
          {item.new_businesses_count && item.new_businesses_count > 0 && (
            <View style={[styles.statBadge, styles.statBadgeNew]}>
              <Text style={[styles.statNumber, { color: '#FFF' }]}>+{item.new_businesses_count}</Text>
              <Text style={[styles.statLabel, { color: '#FFF' }]}>nouveaux</Text>
            </View>
          )}
          {/* Web enrichment indicator */}
          {item.web_phones_found && item.web_phones_found > 0 && (
            <View style={styles.enrichBadge}>
              <Ionicons name="globe-outline" size={14} color="#FFF" />
              <Text style={styles.enrichBadgeText}>+{item.web_phones_found} tél.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Status indicator */}
      {item.status === 'processing' && (
        <View style={styles.scanStatusBar}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.scanStatusText}>Scan en cours...</Text>
        </View>
      )}
      {item.status === 'done' && item.total_results === 0 && (
        <View style={[styles.scanStatusBar, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="alert-circle" size={16} color="#D97706" />
          <Text style={[styles.scanStatusText, { color: '#D97706' }]}>
            Aucun résultat - Essayez d'élargir les critères
          </Text>
        </View>
      )}

      <View style={styles.scanActions}>
        {/* Edit/Modify button - to re-run with different params */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnEdit]}
          onPress={() => {
            // Navigate to scan-pappers with pre-filled params
            router.push({
              pathname: '/scan-pappers',
              params: {
                editScanId: item.id,
                editDomains: JSON.stringify(item.domains || []),
                editRadius: item.radius_km?.toString() || '20',
                editMaxAge: item.max_age_days?.toString() || '360',
                editLocation: item.location_label || '',
                editSearchMode: item.search_mode || 'radius'
              }
            });
          }}
        >
          <Ionicons name="create-outline" size={18} color="#6366F1" />
        </TouchableOpacity>

        {/* Favorite button */}
        <TouchableOpacity
          style={[styles.actionBtn, item.is_favorite && styles.actionBtnFavorite]}
          onPress={() => handleToggleFavorite(item.id)}
        >
          <Ionicons 
            name={item.is_favorite ? "star" : "star-outline"} 
            size={18} 
            color={item.is_favorite ? "#FFF" : "#666"} 
          />
        </TouchableOpacity>

        {/* Re-scan button (only for favorites) */}
        {item.is_favorite && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnRescan]}
            onPress={() => handleRescan(item.id)}
            disabled={refreshing === item.id}
          >
            {refreshing === item.id ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="refresh" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
        )}

        {/* View button */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnView]}
          onPress={() => router.push({ pathname: '/results', params: { scanId: item.id } })}
        >
          <Ionicons name="eye" size={18} color="#FFF" />
          <Text style={styles.actionBtnText}>Voir</Text>
        </TouchableOpacity>

        {/* Export button */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnExport]}
          onPress={() => handleExportScan(item.id, item.query_label)}
        >
          {exporting === item.id ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="download-outline" size={18} color="#FFF" />
          )}
        </TouchableOpacity>

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDelete]}
          onPress={() => handleDeleteScan(item)}
        >
          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
      onPress={() => {
        handleMarkNotificationRead(item.id);
        if (item.scan_id) {
          setShowNotifications(false);
          router.push({ pathname: '/results', params: { scanId: item.scan_id } });
        }
      }}
    >
      <Text style={styles.notifTitle}>{item.title}</Text>
      <Text style={styles.notifMessage}>{item.message}</Text>
      <Text style={styles.notifDate}>{formatDate(item.created_at)}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ProspectLocalLogo size={42} variant="icon" />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>PROSPECTLOCAL V2</Text>
          <Text style={styles.headerSubtitle}>
            Bienvenue, {user?.email?.split('@')[0] || 'Utilisateur'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {/* Search button */}
          <TouchableOpacity 
            style={styles.searchHeaderButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search" size={18} color="#6366F1" />
          </TouchableOpacity>
          
          {/* Re-scan ALL button */}
          <TouchableOpacity 
            style={[styles.rescanAllButton, rescanningAll && styles.rescanAllButtonActive]}
            onPress={handleRescanAll}
            disabled={rescanningAll || scans.length === 0}
          >
            {rescanningAll ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="refresh" size={18} color="#FFF" />
            )}
          </TouchableOpacity>
          
          {/* Settings button (API keys) - for all users */}
          <TouchableOpacity 
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="key" size={18} color="#FF9500" />
          </TouchableOpacity>
          
          {/* Visites button */}
          <TouchableOpacity 
            style={styles.visitesButton}
            onPress={() => router.push('/visites')}
          >
            <Ionicons name="car" size={18} color="#FFF" />
          </TouchableOpacity>
          
          {/* Admin button - only for admin users */}
          {user?.role === 'admin' && (
            <TouchableOpacity 
              style={styles.adminButton}
              onPress={() => router.push('/admin')}
            >
              <Ionicons name="shield-checkmark" size={18} color="#6366F1" />
            </TouchableOpacity>
          )}
          {/* Notifications bell */}
          <TouchableOpacity 
            style={styles.notifButton}
            onPress={() => setShowNotifications(!showNotifications)}
          >
            <Ionicons name="notifications-outline" size={18} color="#1C1C1E" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications Panel */}
      {showNotifications && (
        <View style={styles.notifPanel}>
          <Text style={styles.notifPanelTitle}>🔔 Notifications</Text>
          {notifications.length === 0 ? (
            <Text style={styles.notifEmpty}>Aucune notification</Text>
          ) : (
            <FlatList
              data={notifications.slice(0, 5)}
              keyExtractor={(item) => item.id}
              renderItem={renderNotificationItem}
              style={styles.notifList}
            />
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Ionicons 
            name="list" 
            size={18} 
            color={activeTab === 'all' ? '#6366F1' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            Tous ({scans.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
        >
          <Ionicons 
            name="star" 
            size={18} 
            color={activeTab === 'favorites' ? '#6366F1' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
            Favoris ({scans.filter(s => s.is_favorite).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scan List */}
      {filteredScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>
            {activeTab === 'favorites' 
              ? "Aucun scan favori\nAjoutez des ⭐ pour suivre vos recherches"
              : "Aucun scan effectué\nLancez votre premier scan !"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredScans}
          keyExtractor={(item) => item.id}
          renderItem={renderScanItem}
          contentContainerStyle={styles.scanList}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={handlePullRefresh}
              colors={['#6366F1']}
              tintColor="#6366F1"
            />
          }
        />
      )}

      {/* Web Scan FAB */}
      <TouchableOpacity
        style={styles.fabWeb}
        onPress={() => router.push('/webscan')}
      >
        <Ionicons name="globe-outline" size={22} color="#FFF" />
        <Text style={styles.fabWebText}>Internet</Text>
      </TouchableOpacity>

      {/* Pappers Scan FAB */}
      <TouchableOpacity
        style={styles.fabPappers}
        onPress={() => router.push('/pappersscan')}
      >
        <Ionicons name="document-text" size={22} color="#FFF" />
        <Text style={styles.fabPappersText}>Pappers</Text>
      </TouchableOpacity>

      {/* New Scan FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/newscan')}
      >
        <Ionicons name="add" size={28} color="#FFF" />
        <Text style={styles.fabText}>Nouveau scan</Text>
      </TouchableOpacity>

      {/* Onboarding Modal - API Keys Required */}
      <Modal
        visible={showOnboarding}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.onboardingModal}>
            <View style={styles.onboardingHeader}>
              <Ionicons name="key" size={50} color="#FF9500" />
              <Text style={styles.onboardingTitle}>⚙️ Configuration obligatoire</Text>
              <Text style={styles.onboardingSubtitle}>
                Pour utiliser PROSPECTLOCAL V2, vous devez configurer vos clés API personnelles.
              </Text>
            </View>
            
            <View style={styles.onboardingChecklist}>
              <View style={styles.onboardingCheckItem}>
                <Ionicons 
                  name={apiKeysStatus.hasGoogleKey ? "checkmark-circle" : "close-circle"} 
                  size={24} 
                  color={apiKeysStatus.hasGoogleKey ? "#34C759" : "#FF3B30"} 
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Google Places API</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasGoogleKey ? '✓ Configurée' : '✗ Requise pour les scans'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.onboardingCheckItem}>
                <Ionicons 
                  name={apiKeysStatus.hasSerperKey ? "checkmark-circle" : "close-circle"} 
                  size={24} 
                  color={apiKeysStatus.hasSerperKey ? "#34C759" : "#FF3B30"} 
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Serper.dev API</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasSerperKey ? '✓ Configurée' : '✗ Requise pour Pages Jaunes'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.onboardingCheckItem}>
                <Ionicons 
                  name={apiKeysStatus.hasPappersKey ? "checkmark-circle" : "information-circle"} 
                  size={24} 
                  color={apiKeysStatus.hasPappersKey ? "#34C759" : "#FF9500"} 
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Pappers.fr API</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasPappersKey ? '✓ Configurée' : '○ Optionnelle (visites terrain)'}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={styles.onboardingInfo}>
              <Text style={styles.onboardingInfoText}>
                💡 Chaque utilisateur doit avoir ses propres clés API pour éviter la consommation des crédits partagés.
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.onboardingBtn}
              onPress={() => {
                setShowOnboarding(false);
                router.push('/settings');
              }}
            >
              <Ionicons name="settings" size={20} color="#FFF" />
              <Text style={styles.onboardingBtnText}>Configurer mes clés API</Text>
            </TouchableOpacity>
            
            <Text style={styles.onboardingWarning}>
              ⚠️ Sans clés API, vous ne pourrez pas lancer de scans
            </Text>
            
            <TouchableOpacity
              style={styles.onboardingLogoutBtn}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={18} color="#666" />
              <Text style={styles.onboardingLogoutText}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setDeleteModalVisible(false);
          setScanToDelete(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <Ionicons name="trash" size={40} color="#FF3B30" />
            </View>
            <Text style={styles.modalTitle}>Supprimer ce scan ?</Text>
            <Text style={styles.modalMessage}>
              {scanToDelete?.query_label} - {scanToDelete?.location_label}
            </Text>
            <Text style={styles.modalWarning}>
              ⚠️ Cette action est irréversible. Toutes les données de ce scan seront supprimées.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setScanToDelete(null);
                }}
              >
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnDelete, deleting && styles.modalBtnDisabled]}
                onPress={confirmDeleteScan}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalBtnDeleteText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    minHeight: 56,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    minWidth: 80,
    maxWidth: 150,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    flexWrap: 'nowrap',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#666',
    flexWrap: 'nowrap',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  rescanAllButton: {
    padding: 6,
    backgroundColor: '#34C759',
    borderRadius: 6,
  },
  rescanAllButtonActive: {
    backgroundColor: '#28A745',
  },
  searchHeaderButton: {
    padding: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  settingsButton: {
    padding: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
  },
  adminButton: {
    padding: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  visitesButton: {
    padding: 6,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  notifButton: {
    padding: 6,
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF3B30',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  logoutButton: {
    padding: 8,
  },
  notifPanel: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    maxHeight: 300,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  notifPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  notifEmpty: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  notifList: {
    maxHeight: 220,
  },
  notifItem: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  notifItemUnread: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  notifMessage: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  notifDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#6366F1',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#6366F1',
    fontWeight: '600',
  },
  scanList: {
    padding: 16,
    paddingBottom: 100,
  },
  scanCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scanInfo: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  scanLocation: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  scanDate: {
    fontSize: 12,
    color: '#999',
  },
  rescanDate: {
    color: '#6366F1',
  },
  scanParams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  paramBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paramText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  scanStats: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  statBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  statBadgeNew: {
    backgroundColor: '#4CAF50',
  },
  statBadgeEnriched: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  enrichBadge: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  enrichBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  scanStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  scanStatusText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  actionBtnEdit: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
  },
  scanActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    gap: 4,
  },
  actionBtnFavorite: {
    backgroundColor: '#FFD700',
  },
  actionBtnRescan: {
    backgroundColor: '#4CAF50',
  },
  actionBtnView: {
    flex: 1,
    backgroundColor: '#6366F1',
  },
  actionBtnExport: {
    backgroundColor: '#3B82F6',
  },
  actionBtnDelete: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    left: 16,
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fabText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fabPappers: {
    position: 'absolute',
    bottom: 84,
    right: 16,
    backgroundColor: '#FF9500',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 6,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fabPappersText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  fabWeb: {
    position: 'absolute',
    bottom: 140,
    right: 16,
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 6,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fabWebText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalWarning: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalBtnDelete: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
  },
  modalBtnDisabled: {
    opacity: 0.6,
  },
  modalBtnDeleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Onboarding Modal Styles
  onboardingModal: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    position: 'relative',
  },
  onboardingCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  onboardingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  onboardingSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  onboardingChecklist: {
    width: '100%',
    marginBottom: 20,
    gap: 12,
  },
  onboardingCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    gap: 12,
  },
  onboardingCheckText: {
    flex: 1,
  },
  onboardingCheckLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  onboardingCheckStatus: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  onboardingInfo: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
  },
  onboardingInfoText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
    lineHeight: 18,
  },
  onboardingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    gap: 10,
  },
  onboardingBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  onboardingWarning: {
    marginTop: 16,
    fontSize: 13,
    color: '#FF3B30',
    textAlign: 'center',
    fontWeight: '600',
  },
  onboardingLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    padding: 12,
  },
  onboardingLogoutText: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
});
