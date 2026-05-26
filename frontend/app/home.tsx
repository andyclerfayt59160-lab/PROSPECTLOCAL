import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  Alert,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Clipboard from 'expo-clipboard';
import { useScan } from '../context/ScanContext';

import { API_URL } from '../utils/api';
import { clearStoredSession, handleAuthError, redirectToLogin } from '../utils/authHelpers';

interface DailyCockpitStats {
  aTraiter: number;
  rappelsEnRetard: number;
  visitesPretes: number;
  conflitsDonnees: number;
  rebondsUtiles: number;
  directsFragiles: number;
  visitesFaitesAujourdhui: number;
  resteTerrain: number;
  interactionsAujourdhui: number;
  rappelsCreesAujourdhui: number;
  clientsAujourdhui: number;
}

interface ActionBriefItem {
  business_id: string;
  business_name: string;
  city?: string;
  pl_reference?: string;
  business_phone?: string;
  source: string;
  note?: string;
  due_at?: string;
  next_best_action?: string;
  next_best_action_detail?: string;
  contact_route_label?: string;
  phone_reliability_label?: string;
  phone_reliability_reason?: string;
  solocal_priority_label?: string;
  related_clue_potential?: boolean;
}

interface ActionBriefState {
  now: {
    count: number;
    items: ActionBriefItem[];
  };
  tomorrow: {
    callbacks: number;
    revisits: number;
    rebound_backlog: number;
    fragile_backlog: number;
    total: number;
    items: ActionBriefItem[];
  };
}

const ACTION_BRIEF_ALL_LOCALITIES_KEY = '__all_localities__';
const ACTION_BRIEF_UNKNOWN_LOCALITY_KEY = '__unknown_locality__';

interface ActionBriefLocalityOption {
  key: string;
  label: string;
  count: number;
}

const normalizeActionBriefLocality = (value?: string) => (value || '').trim();

const getActionBriefLocalityKey = (value?: string) => {
  const normalized = normalizeActionBriefLocality(value);
  return normalized ? normalized.toLowerCase() : ACTION_BRIEF_UNKNOWN_LOCALITY_KEY;
};

const buildActionBriefLocalityOptions = (brief: ActionBriefState): ActionBriefLocalityOption[] => {
  const items = [...(brief.now.items || []), ...(brief.tomorrow.items || [])];
  const counts = new Map<string, ActionBriefLocalityOption>();

  for (const item of items) {
    const locality = normalizeActionBriefLocality(item.city);
    const key = getActionBriefLocalityKey(item.city);
    const label = locality || 'Sans localite';
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, { key, label, count: 1 });
  }

  const ordered = Array.from(counts.values()).sort((a, b) => {
    if (a.key === ACTION_BRIEF_UNKNOWN_LOCALITY_KEY) return 1;
    if (b.key === ACTION_BRIEF_UNKNOWN_LOCALITY_KEY) return -1;
    return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
  });

  return [
    {
      key: ACTION_BRIEF_ALL_LOCALITIES_KEY,
      label: 'Toutes localites',
      count: items.length,
    },
    ...ordered,
  ];
};

const sortActionBriefItemsByLocality = (items: ActionBriefItem[]) =>
  [...items].sort((a, b) => {
    const cityA = normalizeActionBriefLocality(a.city) || 'zzzz';
    const cityB = normalizeActionBriefLocality(b.city) || 'zzzz';
    const cityCompare = cityA.localeCompare(cityB, 'fr', { sensitivity: 'base' });
    if (cityCompare !== 0) return cityCompare;
    return (a.business_name || '').localeCompare(b.business_name || '', 'fr', { sensitivity: 'base' });
  });

const filterActionBriefItemsByLocality = (items: ActionBriefItem[], localityKey: string) => {
  const sortedItems = sortActionBriefItemsByLocality(items);
  if (localityKey === ACTION_BRIEF_ALL_LOCALITIES_KEY) {
    return sortedItems;
  }

  return sortedItems.filter((item) => getActionBriefLocalityKey(item.city) === localityKey);
};

const getNotificationTarget = (notification: any) => {
  const scanId = notification?.scan_id || notification?.data?.scan_id;
  const businessId = notification?.business_id || notification?.data?.business_id;

  if (scanId) {
    return `/results?scanId=${scanId}`;
  }
  if (businessId) {
    return `/businessdetail?businessId=${businessId}`;
  }
  return null;
};

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompactScreen = width < 1100;
  const [userName, setUserName] = useState('');
  const [showApiOnboarding, setShowApiOnboarding] = useState(false);
  const [apiKeysStatus, setApiKeysStatus] = useState({
    hasGoogleKey: false,
    hasSerperKey: false,
    hasPappersKey: false,
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [copiedPhoneKey, setCopiedPhoneKey] = useState<string | null>(null);
  const [selectedActionBriefLocalityKey, setSelectedActionBriefLocalityKey] = useState(
    ACTION_BRIEF_ALL_LOCALITIES_KEY
  );
  const [pulseAnim] = useState(new Animated.Value(1));
  const [cockpitStats, setCockpitStats] = useState<DailyCockpitStats>({
    aTraiter: 0,
    rappelsEnRetard: 0,
    visitesPretes: 0,
    conflitsDonnees: 0,
    rebondsUtiles: 0,
    directsFragiles: 0,
    visitesFaitesAujourdhui: 0,
    resteTerrain: 0,
    interactionsAujourdhui: 0,
    rappelsCreesAujourdhui: 0,
    clientsAujourdhui: 0,
  });
  const [actionBrief, setActionBrief] = useState<ActionBriefState>({
    now: { count: 0, items: [] },
    tomorrow: { callbacks: 0, revisits: 0, rebound_backlog: 0, fragile_backlog: 0, total: 0, items: [] },
  });
  
  // ✅ Utilise le contexte global au lieu de polling local
  const { 
    activeScans, 
    notifications, 
    unreadCount, 
    markAllRead: contextMarkAllRead,
    refreshNotifications 
  } = useScan();

  const actionBriefLocalityOptions = buildActionBriefLocalityOptions(actionBrief);
  const filteredNowItems = filterActionBriefItemsByLocality(
    actionBrief.now.items || [],
    selectedActionBriefLocalityKey
  );
  const filteredTomorrowItems = filterActionBriefItemsByLocality(
    actionBrief.tomorrow.items || [],
    selectedActionBriefLocalityKey
  );

  useEffect(() => {
    checkAuth();
    // Refresh notifications au montage du composant
    refreshNotifications();
    loadCockpitStats();
  }, []);

  useEffect(() => {
    if (activeScans.length > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [activeScans.length]);

  useEffect(() => {
    if (
      selectedActionBriefLocalityKey !== ACTION_BRIEF_ALL_LOCALITIES_KEY &&
      !actionBriefLocalityOptions.some((option) => option.key === selectedActionBriefLocalityKey)
    ) {
      setSelectedActionBriefLocalityKey(ACTION_BRIEF_ALL_LOCALITIES_KEY);
    }
  }, [actionBriefLocalityOptions, selectedActionBriefLocalityKey]);

  const checkAuth = async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      redirectToLogin(router);
      return;
    }
    const name = await AsyncStorage.getItem('userName');
    setUserName(name || 'Utilisateur');

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
        hasPappersKey: hasPappers,
      });
      setShowApiOnboarding(!hasGoogle || !hasSerper);
    } catch (error) {
      console.error('Error checking API keys:', error);
      const wasAuthError = await handleAuthError(error, true, router);
      if (!wasAuthError) {
        setShowApiOnboarding(false);
      }
    }
  };

  const loadCockpitStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const [dashboardResponse, pipelineResponse, callbacksResponse, conflictsResponse, visitesResponse, daySummaryResponse, actionBriefResponse] = await Promise.all([
        axios.get(`${API_URL}/api/stats/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/crm/pipeline`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/crm/callbacks-due`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/duplicates/conflicts`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/businesses/visites`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/crm/day-summary`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/crm/action-brief`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const pipeline = pipelineResponse.data?.pipeline || [];
      const newCount = pipeline.find((item: any) => item.status === 'new')?.count || 0;
      const toCallCount = pipeline.find((item: any) => item.status === 'to_call')?.count || 0;
      const callbackCount = pipeline.find((item: any) => item.status === 'callback')?.count || 0;
      const overdueCount = callbacksResponse.data?.overdue_count || 0;
      const visitesPretes = dashboardResponse.data?.visites_terrain_pending || 0;
      const conflitPhones = conflictsResponse.data?.stats?.shared_phone_groups || 0;
      const reviewPhones = conflictsResponse.data?.stats?.review_required_count || 0;
      const rebondsUtiles = pipelineResponse.data?.rebound_count || 0;
      const directsFragiles = pipelineResponse.data?.fragile_count || 0;
      const visites = visitesResponse.data?.businesses || [];

      const today = new Date();
      const visitesFaitesAujourdhui = visites.filter((business: any) => {
        if (!business?.visited_at) return false;
        const visitedAt = new Date(business.visited_at);
        return (
          visitedAt.getFullYear() === today.getFullYear() &&
          visitedAt.getMonth() === today.getMonth() &&
          visitedAt.getDate() === today.getDate()
        );
      }).length;

      const resteTerrain = visites.filter((business: any) =>
        ['non_visite', 'a_revisiter'].includes(business?.visite_status || 'non_visite')
      ).length;
      const daySummary = daySummaryResponse.data || {};
      const brief = actionBriefResponse.data || {
        now: { count: 0, items: [] },
        tomorrow: { callbacks: 0, revisits: 0, rebound_backlog: 0, fragile_backlog: 0, total: 0, items: [] },
      };

      setCockpitStats({
        aTraiter: newCount + toCallCount + callbackCount,
        rappelsEnRetard: overdueCount,
        visitesPretes,
        conflitsDonnees: conflitPhones + reviewPhones,
        rebondsUtiles,
        directsFragiles,
        visitesFaitesAujourdhui,
        resteTerrain,
        interactionsAujourdhui: daySummary.interactions_today || 0,
        rappelsCreesAujourdhui: daySummary.callbacks_created_today || 0,
        clientsAujourdhui: daySummary.clients_today || 0,
      });
      setActionBrief(brief);
    } catch (error) {
      console.error('Error loading cockpit stats:', error);
      await handleAuthError(error, true, router);
    }
  };

  const handleLogout = async () => {
    await clearStoredSession();
    redirectToLogin(router);
  };

  const markAllRead = async () => {
    await contextMarkAllRead();
  };

  const openActionBriefItem = (item: ActionBriefItem) => {
    if (!item?.business_id) {
      router.push('/crm');
      return;
    }


    if (item.next_best_action === 'Préparer une visite') {
      router.push('/visites');
      return;
    }

    if (
      item.next_best_action === 'Exploiter le rebond' ||
      item.next_best_action === 'Vérifier la coordonnée' ||
      item.next_best_action === 'Creuser la fiche' ||
      item.related_clue_potential
    ) {
      router.push(`/businessdetail?businessId=${item.business_id}`);
      return;
    }

    router.push(`/businessdetail?businessId=${item.business_id}`);
  };

  const openActionBriefWorkbench = (item: ActionBriefItem) => {
    if (!item?.business_id) {
      router.push('/crm');
      return;
    }

    if (item.source === 'callback' || item.source === 'callback_tomorrow') {
      router.push('/crm?tab=callbacks');
      return;
    }

    if (item.next_best_action === 'PrÃ©parer une visite') {
      router.push('/visites');
      return;
    }

    router.push(`/businessdetail?businessId=${item.business_id}`);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    return `Il y a ${Math.floor(diff / 86400)}j`;
  };

  const formatDueDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyPhone = async (phone: string, key: string) => {
    if (!phone) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phone);
      } else {
        await Clipboard.setStringAsync(phone);
      }
      setCopiedPhoneKey(key);
      setTimeout(() => setCopiedPhoneKey((current) => (current === key ? null : current)), 1600);
    } catch (error) {
      console.error('Phone copy error:', error);
      Alert.alert('Copie impossible', 'Le numero n a pas pu etre copie dans le presse-papier.');
    }
  };

  const callPhone = async (phone?: string) => {
    if (!phone) return;

    const telUrl = `tel:${phone.replace(/\s+/g, '')}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (canOpen) {
        await Linking.openURL(telUrl);
        return;
      }
    } catch (error) {
      console.error('Phone open error:', error);
    }

    await copyPhone(phone, `call-fallback-${phone}`);
    Alert.alert(
      'Numero copie',
      'Aucun composeur telephonique n est disponible ici. Le numero a ete copie pour te faire gagner du temps.'
    );
  };

  const isScanning = activeScans.length > 0;

  return (
    <View style={styles.container}>
      {/* Header with Scan Progress & Notifications */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>PROSPECTLOCAL</Text>
          <Text style={styles.version}>V2</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Active Scan Badge */}
          {isScanning && (
            <Animated.View style={[styles.scanningBadge, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.scanningDot} />
              <Text style={styles.scanningText}>
                {activeScans[0]?.progress_message
                  ? `${activeScans[0].progress_message}${typeof activeScans[0]?.progress === 'number' ? ` (${activeScans[0].progress}%)` : ''}`
                  : 'Scan en cours...'}
              </Text>
            </Animated.View>
          )}
          
          {/* Notifications Bell */}
          <TouchableOpacity style={styles.notificationBtn} onPress={() => setShowNotifications(true)}>
            <Ionicons name="notifications-outline" size={24} color="#666" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerIcon}>
            <Ionicons name="settings-outline" size={22} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.headerIcon}>
            <Ionicons name="log-out-outline" size={22} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Choisissez votre type de prospection</Text>
          <Text style={styles.welcomeSubtitle}>
            Deux approches complémentaires pour trouver vos prospects
          </Text>
        </View>

        <View style={styles.cockpitSection}>
          <View style={styles.cockpitHeader}>
            <View>
              <Text style={styles.cockpitTitle}>Cockpit du jour</Text>
              <Text style={styles.cockpitSubtitle}>Les actions les plus rentables à traiter maintenant</Text>
            </View>
          </View>
          <View style={styles.cockpitGrid}>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardPrimary]}
              onPress={() => router.push('/crm?tab=pipeline&lane=call&status=all')}
            >
              <Ionicons name="call-outline" size={22} color="#1D4ED8" />
              <Text style={styles.cockpitValue}>{cockpitStats.aTraiter}</Text>
              <Text style={styles.cockpitLabel}>À traiter aujourd'hui</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardWarning]}
              onPress={() => router.push('/crm?tab=callbacks')}
            >
              <Ionicons name="alarm-outline" size={22} color="#B45309" />
              <Text style={styles.cockpitValue}>{cockpitStats.rappelsEnRetard}</Text>
              <Text style={styles.cockpitLabel}>Rappels en retard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cockpitCard, styles.cockpitCardSuccess]} onPress={() => router.push('/visites')}>
              <Ionicons name="walk-outline" size={22} color="#047857" />
              <Text style={styles.cockpitValue}>{cockpitStats.visitesPretes}</Text>
              <Text style={styles.cockpitLabel}>Visites prêtes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cockpitCard, styles.cockpitCardDanger]} onPress={() => router.push('/duplicates')}>
              <Ionicons name="alert-circle-outline" size={22} color="#B91C1C" />
              <Text style={styles.cockpitValue}>{cockpitStats.conflitsDonnees}</Text>
              <Text style={styles.cockpitLabel}>Conflits de donnees</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardInfo]}
              onPress={() => router.push('/crm?tab=pipeline&lane=rebound&status=all')}
            >
              <Ionicons name="git-network-outline" size={22} color="#1D4ED8" />
              <Text style={styles.cockpitValue}>{cockpitStats.rebondsUtiles}</Text>
              <Text style={styles.cockpitLabel}>Rebonds utiles</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardWarning]}
              onPress={() => router.push('/crm?tab=pipeline&lane=fragile&status=all')}
            >
              <Ionicons name="alert-circle-outline" size={22} color="#B45309" />
              <Text style={styles.cockpitValue}>{cockpitStats.directsFragiles}</Text>
              <Text style={styles.cockpitLabel}>Directs fragiles</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardSuccess]}
              onPress={() => router.push('/visites')}
            >
              <Ionicons name="checkmark-done-outline" size={22} color="#047857" />
              <Text style={styles.cockpitValue}>{cockpitStats.visitesFaitesAujourdhui}</Text>
              <Text style={styles.cockpitLabel}>Visites faites aujourd'hui</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cockpitCard, styles.cockpitCardPrimary]}
              onPress={() => router.push('/visites')}
            >
              <Ionicons name="trail-sign-outline" size={22} color="#1D4ED8" />
              <Text style={styles.cockpitValue}>{cockpitStats.resteTerrain}</Text>
              <Text style={styles.cockpitLabel}>Reste terrain</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>Récap du jour</Text>
          <Text style={styles.recapSubtitle}>Ce que la journée a déjà produit côté terrain et CRM.</Text>
          <View style={styles.recapGrid}>
            <View style={styles.recapCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#4F46E5" />
              <Text style={styles.recapValue}>{cockpitStats.interactionsAujourdhui}</Text>
              <Text style={styles.recapLabel}>Interactions</Text>
            </View>
            <View style={styles.recapCard}>
              <Ionicons name="alarm-outline" size={20} color="#B45309" />
              <Text style={styles.recapValue}>{cockpitStats.rappelsCreesAujourdhui}</Text>
              <Text style={styles.recapLabel}>Rappels créés</Text>
            </View>
            <View style={styles.recapCard}>
              <Ionicons name="walk-outline" size={20} color="#047857" />
              <Text style={styles.recapValue}>{cockpitStats.visitesFaitesAujourdhui}</Text>
              <Text style={styles.recapLabel}>Visites faites</Text>
            </View>
            <View style={styles.recapCard}>
              <Ionicons name="trophy-outline" size={20} color="#B45309" />
              <Text style={styles.recapValue}>{cockpitStats.clientsAujourdhui}</Text>
              <Text style={styles.recapLabel}>Clients du jour</Text>
            </View>
          </View>
        </View>

        <View style={styles.prioritySection}>
          <Text style={styles.prioritySectionTitle}>Quoi faire maintenant</Text>
          <Text style={styles.prioritySectionSubtitle}>
            Les prochaines actions les plus utiles proposees automatiquement.
          </Text>
          {actionBriefLocalityOptions.length > 1 && (
            <View style={styles.localityFilterWrap}>
              <Text style={styles.localityFilterLabel}>Filtrer par localite</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.localityFilterRow}
              >
                {actionBriefLocalityOptions.map((option) => {
                  const isActive = option.key === selectedActionBriefLocalityKey;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.localityChip, isActive && styles.localityChipActive]}
                      onPress={() => setSelectedActionBriefLocalityKey(option.key)}
                    >
                      <Text style={[styles.localityChipText, isActive && styles.localityChipTextActive]}>
                        {option.label}
                      </Text>
                      <View style={[styles.localityChipCount, isActive && styles.localityChipCountActive]}>
                        <Text style={[styles.localityChipCountText, isActive && styles.localityChipCountTextActive]}>
                          {option.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {filteredNowItems.length > 0 ? (
            filteredNowItems.map((item, index) => (
              <View
                key={`${item.source}-${item.business_id}`}
                style={styles.priorityCard}
              >
                {(index === 0 ||
                  getActionBriefLocalityKey(filteredNowItems[index - 1]?.city) !== getActionBriefLocalityKey(item.city)) && (
                  <View style={styles.localitySectionBadge}>
                    <Ionicons name="location-outline" size={14} color="#4F46E5" />
                    <Text style={styles.localitySectionBadgeText}>
                      {normalizeActionBriefLocality(item.city) || 'Sans localite'}
                    </Text>
                  </View>
                )}
                <View style={styles.priorityCardHeader}>
                  <View style={styles.priorityTitleWrap}>
                    <Text style={styles.priorityBusinessName}>
                      {item.business_name}
                      {item.pl_reference ? ` - ${item.pl_reference}` : ''}
                    </Text>
                    <Text style={styles.priorityBusinessMeta}>
                      {item.next_best_action || 'Ouvrir la fiche'}
                      {item.city ? ` - ${item.city}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="flash-outline" size={18} color="#7C3AED" />
                </View>
                {!!item.next_best_action_detail && (
                  <Text style={styles.priorityDetail}>{item.next_best_action_detail}</Text>
                )}
                {(!!item.business_phone || !!item.phone_reliability_label) && (
                  <View style={styles.priorityContactRow}>
                    {!!item.business_phone && (
                      <Text style={styles.priorityPhoneText}>{item.business_phone}</Text>
                    )}
                    {!!item.business_phone && (
                      <TouchableOpacity
                        style={styles.priorityPhoneCallBtn}
                        onPress={() => callPhone(item.business_phone)}
                      >
                        <Ionicons name="call-outline" size={13} color="#047857" />
                        <Text style={styles.priorityPhoneCallText}>Appeler</Text>
                      </TouchableOpacity>
                    )}
                    {!!item.business_phone && (
                      <TouchableOpacity
                        style={[
                          styles.priorityPhoneCopyBtn,
                          copiedPhoneKey === item.business_id && styles.priorityPhoneCopyBtnActive,
                        ]}
                        onPress={() => copyPhone(item.business_phone!, item.business_id)}
                      >
                        <Ionicons
                          name={copiedPhoneKey === item.business_id ? 'checkmark-outline' : 'copy-outline'}
                          size={13}
                          color={copiedPhoneKey === item.business_id ? '#047857' : '#4F46E5'}
                        />
                        <Text
                          style={[
                            styles.priorityPhoneCopyText,
                            copiedPhoneKey === item.business_id && styles.priorityPhoneCopyTextActive,
                          ]}
                        >
                          {copiedPhoneKey === item.business_id ? 'Copie' : 'Copier'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!!item.phone_reliability_label && (
                      <Text style={styles.priorityContactMeta}>{item.phone_reliability_label}</Text>
                    )}
                  </View>
                )}
                {(!!item.due_at || !!item.note) && (
                  <View style={styles.priorityContextCard}>
                    {!!item.due_at && (
                      <Text style={styles.priorityContextText}>
                        Rappel prevu : {formatDueDate(item.due_at)}
                      </Text>
                    )}
                    {!!item.note && (
                      <Text style={styles.priorityContextText} numberOfLines={2}>
                        {item.note}
                      </Text>
                    )}
                  </View>
                )}
                <View style={styles.priorityBadges}>
                  {!!item.solocal_priority_label && (
                    <View style={styles.priorityBadgePrimary}>
                      <Text style={styles.priorityBadgePrimaryText}>{item.solocal_priority_label}</Text>
                    </View>
                  )}
                  {!!item.contact_route_label && (
                    <View style={styles.priorityBadgeNeutral}>
                      <Text style={styles.priorityBadgeNeutralText}>{item.contact_route_label}</Text>
                    </View>
                  )}
                  {item.source === 'callback' && (
                    <View style={styles.priorityBadgeWarning}>
                      <Text style={styles.priorityBadgeWarningText}>Rappel prioritaire</Text>
                    </View>
                  )}
                </View>
                <View style={styles.priorityActionsRow}>
                  <TouchableOpacity
                    style={styles.priorityActionBtn}
                    onPress={() => router.push(`/businessdetail?businessId=${item.business_id}`)}
                  >
                    <Text style={styles.priorityActionBtnText}>Fiche</Text>
                    <Ionicons name="open-outline" size={14} color="#4F46E5" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.priorityActionBtn, styles.priorityActionBtnPrimary]}
                    onPress={() => openActionBriefWorkbench(item)}
                  >
                    <Text style={styles.priorityActionBtnPrimaryText}>Traiter</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.priorityEmpty}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
              <Text style={styles.priorityEmptyText}>Aucune action chaude détectée pour l'instant.</Text>
            </View>
          )}
        </View>

        <View style={styles.tomorrowSection}>
          <Text style={styles.prioritySectionTitle}>A reprendre demain</Text>
          <Text style={styles.prioritySectionSubtitle}>
            Le prochain lot de sujets a reprendre sans perdre le fil.
          </Text>
          <View style={styles.tomorrowGrid}>
            <TouchableOpacity style={styles.tomorrowCard} onPress={() => router.push('/crm?tab=callbacks')}>
              <Ionicons name="alarm-outline" size={18} color="#B45309" />
              <Text style={styles.tomorrowValue}>{actionBrief.tomorrow.callbacks}</Text>
              <Text style={styles.tomorrowLabel}>Rappels demain</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tomorrowCard} onPress={() => router.push('/visites')}>
              <Ionicons name="refresh-outline" size={18} color="#7C3AED" />
              <Text style={styles.tomorrowValue}>{actionBrief.tomorrow.revisits}</Text>
              <Text style={styles.tomorrowLabel}>À revisiter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tomorrowCard} onPress={() => router.push('/crm?tab=pipeline&lane=rebound&status=all')}>
              <Ionicons name="git-network-outline" size={18} color="#2563EB" />
              <Text style={styles.tomorrowValue}>{actionBrief.tomorrow.rebound_backlog}</Text>
              <Text style={styles.tomorrowLabel}>Rebonds backlog</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tomorrowCard} onPress={() => router.push('/crm?tab=pipeline&lane=fragile&status=all')}>
              <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
              <Text style={styles.tomorrowValue}>{actionBrief.tomorrow.fragile_backlog}</Text>
              <Text style={styles.tomorrowLabel}>Directs fragiles</Text>
            </TouchableOpacity>
          </View>
          {filteredTomorrowItems.length > 0 && (
            <View style={styles.tomorrowList}>
              {filteredTomorrowItems.map((item, index) => (
                <View
                  key={`tomorrow-${item.source}-${item.business_id}`}
                  style={styles.tomorrowListItem}
                >
                  <View style={styles.tomorrowListText}>
                    {(index === 0 ||
                      getActionBriefLocalityKey(filteredTomorrowItems[index - 1]?.city) !== getActionBriefLocalityKey(item.city)) && (
                      <View style={styles.localitySectionBadge}>
                        <Ionicons name="location-outline" size={14} color="#4F46E5" />
                        <Text style={styles.localitySectionBadgeText}>
                          {normalizeActionBriefLocality(item.city) || 'Sans localite'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.tomorrowListTitle}>
                      {item.business_name}
                      {item.pl_reference ? ` - ${item.pl_reference}` : ''}
                    </Text>
                    <Text style={styles.tomorrowListSubtitle}>
                      {item.next_best_action || 'A reprendre'}
                      {item.city ? ` - ${item.city}` : ''}
                    </Text>
                    {(!!item.business_phone || !!item.phone_reliability_label) && (
                      <Text style={styles.tomorrowListMeta}>
                        {[item.business_phone, item.phone_reliability_label].filter(Boolean).join(' - ')}
                      </Text>
                    )}
                    {(!!item.due_at || !!item.note) && (
                      <Text style={styles.tomorrowListMeta} numberOfLines={2}>
                        {[
                          item.due_at ? `Rappel : ${formatDueDate(item.due_at)}` : null,
                          item.note || null,
                        ].filter(Boolean).join(' - ')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.tomorrowActionsRow}>
                    {!!item.business_phone && (
                      <TouchableOpacity
                        style={styles.tomorrowActionBtn}
                        onPress={() => copyPhone(item.business_phone!, `tomorrow-${item.business_id}`)}
                      >
                        <Ionicons
                          name={copiedPhoneKey === `tomorrow-${item.business_id}` ? 'checkmark-outline' : 'copy-outline'}
                          size={13}
                          color={copiedPhoneKey === `tomorrow-${item.business_id}` ? '#047857' : '#4F46E5'}
                        />
                        <Text
                          style={[
                            styles.tomorrowActionBtnText,
                            copiedPhoneKey === `tomorrow-${item.business_id}` && styles.tomorrowActionBtnTextActive,
                          ]}
                        >
                          {copiedPhoneKey === `tomorrow-${item.business_id}` ? 'Copie' : 'Copier'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!!item.business_phone && (
                      <TouchableOpacity
                        style={[styles.tomorrowActionBtn, styles.tomorrowActionBtnSuccess]}
                        onPress={() => callPhone(item.business_phone)}
                      >
                        <Ionicons name="call-outline" size={13} color="#047857" />
                        <Text style={[styles.tomorrowActionBtnText, styles.tomorrowActionBtnTextSuccess]}>Appeler</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.tomorrowActionBtn}
                      onPress={() => router.push(`/businessdetail?businessId=${item.business_id}`)}
                    >
                      <Text style={styles.tomorrowActionBtnText}>Fiche</Text>
                      <Ionicons name="open-outline" size={13} color="#4F46E5" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tomorrowActionBtn, styles.tomorrowActionBtnPrimary]}
                      onPress={() => openActionBriefWorkbench(item)}
                    >
                      <Text style={styles.tomorrowActionBtnPrimaryText}>Traiter</Text>
                      <Ionicons name="arrow-forward" size={13} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Main Cards */}
        <View style={[styles.cardsContainer, isCompactScreen && styles.cardsContainerCompact]}>
          {/* Card 1: Scan Tout Internet */}
          <TouchableOpacity
            style={[styles.mainCard, styles.cardInternet, isCompactScreen && styles.mainCardCompact]}
            onPress={() => router.push('/webscan')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIconContainer}>
              <Ionicons name="globe" size={48} color="#FFF" />
            </View>
            <Text style={styles.cardTitle}>SCAN TOUT INTERNET</Text>
            <Text style={styles.cardDescription}>
              Recherche exhaustive sur toutes les sources : Google, Pages Jaunes,
              annuaires, réseaux sociaux, sites web...
            </Text>
            <View style={styles.cardFeatures}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>Multi-sources</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>SIRET vérifiés</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>Enrichissement auto</Text>
              </View>
            </View>
            <View style={styles.cardAction}>
              <Text style={styles.cardActionText}>Accéder</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>

          {/* Card 2: Scan Pappers+ */}
          <TouchableOpacity
            style={[styles.mainCard, styles.cardPappers, isCompactScreen && styles.mainCardCompact]}
            onPress={() => router.push('/pappersscan')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIconContainer}>
              <Ionicons name="business" size={48} color="#FFF" />
            </View>
            <Text style={styles.cardTitle}>SCAN PAPPERS+</Text>
            <Text style={styles.cardDescription}>
              Ciblez les entreprises récemment créées avec des filtres 
              temporels précis : 7j, 1 mois, 3 mois, 6 mois, 1 an, 2 ans
            </Text>
            <View style={styles.cardFeatures}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>Nouvelles entreprises</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>Filtres temporels</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.featureText}>Visites terrain auto</Text>
              </View>
            </View>
            <View style={styles.cardAction}>
              <Text style={styles.cardActionText}>Accéder</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>Accès rapides</Text>
          <View style={styles.quickLinksGrid}>
            <View style={styles.quickLinksRow}>
              <TouchableOpacity 
                style={styles.quickLink}
                onPress={() => router.push('/stats')}
              >
                <Ionicons name="stats-chart" size={22} color="#6366F1" />
                <Text style={styles.quickLinkText}>Stats</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickLink}
                onPress={() => router.push('/visites')}
              >
                <Ionicons name="walk" size={22} color="#F59E0B" />
                <Text style={styles.quickLinkText}>Visites</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickLink}
                onPress={() => router.push('/settings')}
              >
                <Ionicons name="key" size={22} color="#9C27B0" />
                <Text style={styles.quickLinkText}>API</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickLink}
                onPress={() => router.push('/notifications')}
              >
                <Ionicons name="notifications" size={22} color="#3B82F6" />
                <Text style={styles.quickLinkText}>Notifs</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.quickLinksRow}>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#FFF7ED' }]}
                onPress={() => router.push('/surveillance')}
              >
                <Ionicons name="radar" size={22} color="#F97316" />
                <Text style={[styles.quickLinkText, { color: '#F97316' }]}>Surveill.</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#FEF3C7' }]}
                onPress={() => router.push('/duplicates')}
              >
                <Ionicons name="git-merge" size={22} color="#D97706" />
                <Text style={[styles.quickLinkText, { color: '#D97706' }]}>Doublons</Text>
              </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#ECFDF5' }]}
                onPress={() => router.push('/crm?tab=pipeline&lane=all&status=all')}
              >
                <Ionicons name="people" size={22} color="#059669" />
                <Text style={[styles.quickLinkText, { color: '#059669' }]}>CRM</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#F3E8FF' }]}
                onPress={() => router.push('/export')}
              >
                <Ionicons name="download" size={22} color="#7C3AED" />
                <Text style={[styles.quickLinkText, { color: '#7C3AED' }]}>Export</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.quickLinksRow}>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#FEE2E2' }]}
                onPress={() => router.push('/credits')}
              >
                <Ionicons name="speedometer" size={22} color="#DC2626" />
                <Text style={[styles.quickLinkText, { color: '#DC2626' }]}>Crédits</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#D1FAE5' }]}
                onPress={() => router.push('/health')}
                data-testid="health-button"
              >
                <Ionicons name="pulse" size={22} color="#059669" />
                <Text style={[styles.quickLinkText, { color: '#059669' }]}>Santé</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.quickLink, { backgroundColor: '#DBEAFE' }]}
                onPress={() => router.push('/crm?tab=pipeline&lane=rebound&status=all')}
              >
                <Ionicons name="git-network" size={22} color="#1D4ED8" />
                <Text style={[styles.quickLinkText, { color: '#1D4ED8' }]}>Rebond</Text>
              </TouchableOpacity>
              <View style={styles.quickLinkPlaceholder} />
            </View>
          </View>
        </View>
      </ScrollView>

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
                  <Text style={styles.emptyNotifText}>Aucune notification</Text>
                </View>
              ) : (
                notifications.map((notif) => (
                  <TouchableOpacity 
                    key={notif.id} 
                    style={[styles.notificationItem, !notif.is_read && styles.notificationUnread]}
                    onPress={() => {
                      const target = getNotificationTarget(notif);
                      if (!target) return;
                      setShowNotifications(false);
                      router.push(target as any);
                    }}
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
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showApiOnboarding}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingModal}>
            <Ionicons name="key" size={44} color="#F59E0B" />
            <Text style={styles.onboardingTitle}>Configuration requise</Text>
            <Text style={styles.onboardingSubtitle}>
              Chaque utilisateur doit configurer ses propres clés API avant de lancer des scans.
            </Text>

            <View style={styles.onboardingChecklist}>
              <View style={styles.onboardingCheckItem}>
                <Ionicons
                  name={apiKeysStatus.hasGoogleKey ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={apiKeysStatus.hasGoogleKey ? '#10B981' : '#EF4444'}
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Google Places</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasGoogleKey ? 'Configurée' : 'Requise pour les scans Internet'}
                  </Text>
                </View>
              </View>

              <View style={styles.onboardingCheckItem}>
                <Ionicons
                  name={apiKeysStatus.hasSerperKey ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={apiKeysStatus.hasSerperKey ? '#10B981' : '#EF4444'}
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Serper.dev</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasSerperKey ? 'Configurée' : 'Requise pour la recherche web et PagesJaunes'}
                  </Text>
                </View>
              </View>

              <View style={styles.onboardingCheckItem}>
                <Ionicons
                  name={apiKeysStatus.hasPappersKey ? 'checkmark-circle' : 'information-circle'}
                  size={22}
                  color={apiKeysStatus.hasPappersKey ? '#10B981' : '#F59E0B'}
                />
                <View style={styles.onboardingCheckText}>
                  <Text style={styles.onboardingCheckLabel}>Pappers</Text>
                  <Text style={styles.onboardingCheckStatus}>
                    {apiKeysStatus.hasPappersKey ? 'Configurée' : 'Optionnelle pour le scan Pappers'}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.onboardingInfoText}>
              Tes clés restent privées sur ton compte. Un utilisateur sans clés personnelles ne pourra pas scanner.
            </Text>

            <TouchableOpacity
              style={styles.onboardingPrimaryBtn}
              onPress={() => {
                setShowApiOnboarding(false);
                router.push('/settings?onboarding=1');
              }}
            >
              <Ionicons name="settings" size={18} color="#FFF" />
              <Text style={styles.onboardingPrimaryBtnText}>Configurer mes clés</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.onboardingSecondaryBtn}
              onPress={async () => {
                await AsyncStorage.clear();
                router.replace('/login');
              }}
            >
              <Ionicons name="log-out-outline" size={18} color="#475569" />
              <Text style={styles.onboardingSecondaryBtnText}>Se déconnecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  logo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  version: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeText: {
    fontSize: 14,
    color: '#666',
  },
  headerIcon: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  welcomeSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  cockpitSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  cockpitHeader: {
    marginBottom: 14,
  },
  cockpitTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  cockpitSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  cockpitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cockpitCard: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cockpitCardPrimary: {
    backgroundColor: '#EFF6FF',
  },
  cockpitCardWarning: {
    backgroundColor: '#FFF7ED',
  },
  cockpitCardSuccess: {
    backgroundColor: '#ECFDF5',
  },
  cockpitCardDanger: {
    backgroundColor: '#FEF2F2',
  },
  cockpitCardInfo: {
    backgroundColor: '#DBEAFE',
  },
  cockpitValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  cockpitLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  cardsContainerCompact: {
    flexDirection: 'column',
  },
  mainCard: {
    flex: 1,
    borderRadius: 20,
    padding: 24,
    minHeight: 320,
  },
  mainCardCompact: {
    minHeight: 260,
  },
  cardInternet: {
    backgroundColor: '#6366F1',
  },
  cardPappers: {
    backgroundColor: '#F97316',
  },
  cardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFeatures: {
    gap: 8,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '500',
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 'auto',
  },
  cardActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  statsSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  recapSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: -8,
    marginBottom: 14,
  },
  recapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recapCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  recapValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  recapLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  prioritySection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    gap: 12,
  },
  prioritySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  prioritySectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },
  localityFilterWrap: {
    gap: 8,
  },
  localityFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  localityFilterRow: {
    gap: 8,
    paddingRight: 12,
  },
  localityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  localityChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  localityChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  localityChipTextActive: {
    color: '#FFF',
  },
  localityChipCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
  },
  localityChipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  localityChipCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338CA',
  },
  localityChipCountTextActive: {
    color: '#FFF',
  },
  localitySectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  localitySectionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338CA',
  },
  priorityCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  priorityCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  priorityTitleWrap: {
    flex: 1,
    gap: 4,
  },
  priorityBusinessName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  priorityBusinessMeta: {
    fontSize: 12,
    color: '#475569',
  },
  priorityDetail: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  priorityContactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  priorityPhoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  priorityPhoneCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  priorityPhoneCopyBtnActive: {
    backgroundColor: '#D1FAE5',
  },
  priorityPhoneCopyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  priorityPhoneCopyTextActive: {
    color: '#047857',
  },
  priorityPhoneCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
  },
  priorityPhoneCallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  priorityContactMeta: {
    fontSize: 12,
    color: '#475569',
  },
  priorityContextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  priorityContextText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  priorityBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityBadgePrimary: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  priorityBadgePrimaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  priorityBadgeNeutral: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  priorityBadgeNeutralText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  priorityBadgeWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  priorityBadgeWarningText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  priorityActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  priorityActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
  },
  priorityActionBtnPrimary: {
    backgroundColor: '#4F46E5',
  },
  priorityActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  priorityActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  priorityEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
  },
  priorityEmptyText: {
    flex: 1,
    fontSize: 13,
    color: '#166534',
  },
  tomorrowSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    gap: 12,
  },
  tomorrowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tomorrowCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  tomorrowValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  tomorrowLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  tomorrowList: {
    gap: 10,
    marginTop: 6,
  },
  tomorrowListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tomorrowListText: {
    flex: 1,
    gap: 4,
  },
  tomorrowListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  tomorrowListSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  tomorrowListMeta: {
    fontSize: 12,
    color: '#475569',
  },
  tomorrowActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  tomorrowActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
  },
  tomorrowActionBtnPrimary: {
    backgroundColor: '#4F46E5',
  },
  tomorrowActionBtnSuccess: {
    backgroundColor: '#D1FAE5',
  },
  tomorrowActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tomorrowActionBtnTextActive: {
    color: '#047857',
  },
  tomorrowActionBtnTextSuccess: {
    color: '#047857',
  },
  tomorrowActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  quickLinksGrid: {
    gap: 10,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickLink: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  quickLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  onboardingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  onboardingModal: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  onboardingSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
  },
  onboardingChecklist: {
    gap: 12,
  },
  onboardingCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
  },
  onboardingCheckText: {
    flex: 1,
    gap: 2,
  },
  onboardingCheckLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  onboardingCheckStatus: {
    fontSize: 12,
    color: '#64748B',
  },
  onboardingInfoText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  onboardingPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
  },
  onboardingPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  onboardingSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 12,
  },
  onboardingSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  // Scan progress badge
  scanningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
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
  // Notification button
  notificationBtn: {
    padding: 8,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
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
  // Modal styles
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
    maxHeight: 400,
  },
  emptyNotifications: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyNotifText: {
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
    alignSelf: 'center',
  },
  quickLinkPlaceholder: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
