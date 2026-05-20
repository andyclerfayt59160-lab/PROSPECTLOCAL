import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import CrmModals from '../components/crm/CrmModals';

import { API_URL } from '../utils/api';

// Sales status configuration
const SALES_STATUSES = [
  { value: 'new', label: 'Nouveau', color: '#6B7280', icon: 'add-circle' },
  { value: 'to_call', label: 'A appeler', color: '#3B82F6', icon: 'call' },
  { value: 'called', label: 'Appele', color: '#8B5CF6', icon: 'call-outline' },
  { value: 'callback', label: 'Rappeler', color: '#F59E0B', icon: 'time' },
  { value: 'meeting_scheduled', label: 'RDV programme', color: '#10B981', icon: 'calendar' },
  { value: 'meeting_done', label: 'RDV effectué', color: '#059669', icon: 'checkmark-circle' },
  { value: 'proposal_sent', label: 'Devis envoye', color: '#6366F1', icon: 'document-text' },
  { value: 'won', label: 'Gagne', color: '#22C55E', icon: 'trophy' },
  { value: 'lost', label: 'Perdu', color: '#EF4444', icon: 'close-circle' },
  { value: 'not_interested', label: 'Non interesse', color: '#9CA3AF', icon: 'remove-circle' },
];

const INTERACTION_TYPES = [
  { value: 'call_outbound', label: 'Appel sortant', icon: 'call' },
  { value: 'call_inbound', label: 'Appel entrant', icon: 'call' },
  { value: 'email_sent', label: 'Email envoye', icon: 'mail' },
  { value: 'meeting', label: 'Reunion', icon: 'people' },
  { value: 'note', label: 'Note', icon: 'document-text' },
];

interface PipelineItem {
  status: string;
  label: string;
  color: string;
  count: number;
}

interface Business {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  sales_status?: string;
  pl_reference?: string;
  solocal_priority_score?: number;
  solocal_priority_label?: string;
  solocal_priority_reason?: string;
  recommended_contact_mode?: 'appel' | 'visite' | 'creuser' | 'verifier';
  related_clue_potential?: boolean;
  related_clue_reason?: string;
  next_best_action?: string;
  next_best_action_detail?: string;
  contact_route?: 'direct' | 'fragile' | 'rebound' | 'terrain' | 'research';
  contact_route_label?: string;
  contact_route_reason?: string;
  phone_reliability_status?: 'verified' | 'review' | 'rejected' | 'missing';
  phone_reliability_label?: string;
  phone_reliability_reason?: string;
}

interface Interaction {
  id: string;
  interaction_type: string;
  title?: string;
  content?: string;
  created_at: string;
  call_outcome?: string;
}

interface FocusMetric {
  key: string;
  label: string;
  value: number;
  tone: 'primary' | 'success' | 'warning';
}

type ActionLane = 'all' | 'call' | 'visit' | 'callback' | 'review' | 'rebound' | 'fragile';

const CONTACT_MODE_META = {
  appel: { label: 'A appeler', color: '#065F46', bg: '#D1FAE5', icon: 'call-outline' as const },
  visite: { label: 'À visiter', color: '#6D28D9', bg: '#EDE9FE', icon: 'walk-outline' as const },
  creuser: { label: 'A creuser', color: '#92400E', bg: '#FEF3C7', icon: 'search-outline' as const },
  verifier: { label: 'À vérifier', color: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' as const },
};

const REBOUND_META = {
  label: 'Rebond dispo',
  color: '#1D4ED8',
  bg: '#DBEAFE',
};

const CONTACT_ROUTE_META: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  direct: { color: '#065F46', bg: '#D1FAE5', icon: 'call-outline' },
  fragile: { color: '#B45309', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  rebound: { color: '#1D4ED8', bg: '#DBEAFE', icon: 'git-network-outline' },
  terrain: { color: '#6D28D9', bg: '#EDE9FE', icon: 'walk-outline' },
  research: { color: '#92400E', bg: '#FEF3C7', icon: 'search-outline' },
};

const PHONE_RELIABILITY_META: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  verified: { color: '#047857', bg: '#D1FAE5', icon: 'checkmark-circle-outline' },
  review: { color: '#B45309', bg: '#FEF3C7', icon: 'help-circle-outline' },
  rejected: { color: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle-outline' },
  missing: { color: '#6B7280', bg: '#F3F4F6', icon: 'remove-circle-outline' },
};

const ACTION_LANES: { key: ActionLane; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: 'all', label: 'Tout voir', icon: 'apps-outline', color: '#4F46E5', bg: '#EEF2FF' },
  { key: 'rebound', label: 'Rebond', icon: 'git-network-outline', color: '#1D4ED8', bg: '#DBEAFE' },
  { key: 'fragile', label: 'Direct fragile', icon: 'alert-circle-outline', color: '#B45309', bg: '#FEF3C7' },
  { key: 'call', label: 'A appeler', icon: 'call-outline', color: '#047857', bg: '#D1FAE5' },
  { key: 'visit', label: 'À visiter', icon: 'walk-outline', color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'callback', label: 'À relancer', icon: 'time-outline', color: '#B45309', bg: '#FEF3C7' },
  { key: 'review', label: 'À vérifier', icon: 'alert-circle-outline', color: '#B91C1C', bg: '#FEE2E2' },
];

export default function CRMPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string;
    lane?: string;
    status?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [callbacksCount, setCallbacksCount] = useState(0);
  const [copiedPhoneKey, setCopiedPhoneKey] = useState<string | null>(null);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'pipeline' | 'stats' | 'callbacks'>('pipeline');
  
  // Stats
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Callbacks list
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = useState(false);
  const [actionLane, setActionLane] = useState<ActionLane>('all');
  
  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  
  // Interaction modal
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [interactionType, setInteractionType] = useState('note');
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionCallbackDate, setInteractionCallbackDate] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);
  
  // History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingInteractionId, setDeletingInteractionId] = useState<string | null>(null);

  useEffect(() => {
    const requestedTab = typeof params.tab === 'string' ? params.tab : '';
    const requestedLane = typeof params.lane === 'string' ? params.lane : '';
    const requestedStatus = typeof params.status === 'string' ? params.status : '';

    if (requestedTab === 'pipeline' || requestedTab === 'stats' || requestedTab === 'callbacks') {
      setActiveTab(requestedTab);
    }

    if (requestedLane === 'all' || requestedLane === 'call' || requestedLane === 'visit' || requestedLane === 'callback' || requestedLane === 'review' || requestedLane === 'rebound' || requestedLane === 'fragile') {
      setActionLane(requestedLane);
    }

    if (
      requestedStatus === 'all' ||
      SALES_STATUSES.some((status) => status.value === requestedStatus)
    ) {
      setSelectedStatus(requestedStatus || 'all');
    }
  }, [params.lane, params.status, params.tab]);

  useEffect(() => {
    fetchPipeline();
  }, []);

  useEffect(() => {
    if (activeTab === 'pipeline') {
      fetchBusinesses();
    } else if (activeTab === 'stats') {
      fetchStats();
    } else if (activeTab === 'callbacks') {
      fetchCallbacksDue();
    }
  }, [selectedStatus, activeTab]);

  const fetchPipeline = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/crm/pipeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPipeline(response.data.pipeline || []);
      setCallbacksCount(response.data.callbacks_due || 0);
    } catch (error) {
      console.error('Error fetching pipeline:', error);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/crm/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchCallbacksDue = async () => {
    setLoadingCallbacks(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/crm/callbacks-due`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCallbacks(response.data.callbacks || []);
    } catch (error) {
      console.error('Error fetching callbacks:', error);
    } finally {
      setLoadingCallbacks(false);
    }
  };

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const params = selectedStatus !== 'all' ? `?status=${selectedStatus}` : '';
      const response = await axios.get(`${API_URL}/api/crm/businesses${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBusinesses(response.data.businesses || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching businesses:', error);
    } finally {
      setLoading(false);
    }
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
      console.error('CRM phone copy error:', error);
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
      console.error('CRM phone open error:', error);
    }

    await copyPhone(phone, `call-fallback-${phone}`);
    Alert.alert(
      'Numero copie',
      'Aucun composeur telephonique n est disponible ici. Le numero a ete copie pour te faire gagner du temps.'
    );
  };

  const updateStatus = async (newStatus: string) => {
    if (!selectedBusiness) return;
    
    setChangingStatus(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(`${API_URL}/api/crm/status`, {
        business_id: selectedBusiness.id,
        sales_status: newStatus
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setShowStatusModal(false);
      fetchPipeline();
      fetchBusinesses();
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur lors du changement de statut');
    } finally {
      setChangingStatus(false);
    }
  };

  const buildCallbackIso = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  };

  const saveInteraction = async () => {
    if (!selectedBusiness || !interactionNote.trim()) return;
    
    setSavingInteraction(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const callbackDateIso = buildCallbackIso(interactionCallbackDate);
      if (interactionCallbackDate.trim() && !callbackDateIso) {
        Alert.alert('Date invalide', 'Utilise un format du type 2026-04-27 15:30.');
        setSavingInteraction(false);
        return;
      }
      await axios.post(`${API_URL}/api/crm/interactions`, {
        business_id: selectedBusiness.id,
        interaction_type: interactionType,
        title: INTERACTION_TYPES.find(t => t.value === interactionType)?.label,
        content: interactionNote,
        callback_date: callbackDateIso
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setShowInteractionModal(false);
      setInteractionNote('');
      setInteractionCallbackDate('');
      fetchPipeline();
      if (activeTab === 'pipeline') fetchBusinesses();
      if (activeTab === 'callbacks') fetchCallbacksDue();
      Alert.alert('Succès', 'Interaction enregistrée');
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur');
    } finally {
      setSavingInteraction(false);
    }
  };

  const loadHistory = async (business: Business) => {
    setSelectedBusiness(business);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/crm/interactions/${business.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInteractions(response.data.interactions || []);
    } catch (error) {
      console.error('Error loading history:', error);
      setInteractions([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteInteraction = (interaction: Interaction) => {
    Alert.alert(
      'Supprimer cette interaction ?',
      'Cette action retirera cette note ou ce rappel de l historique CRM.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeletingInteractionId(interaction.id);
            try {
              const token = await AsyncStorage.getItem('token');
              await axios.delete(`${API_URL}/api/crm/interactions/${interaction.id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              setInteractions((current) => current.filter((item) => item.id !== interaction.id));
              fetchPipeline();
              fetchBusinesses();
              fetchCallbacksDue();
              fetchStats();
            } catch (error: any) {
              Alert.alert('Erreur', error.response?.data?.detail || 'Suppression impossible');
            } finally {
              setDeletingInteractionId(null);
            }
          }
        }
      ]
    );
  };

  const openStatusModal = (business: Business) => {
    setSelectedBusiness(business);
    setShowStatusModal(true);
  };

  const openBusinessDetail = (business: Business) => {
    router.push(`/businessdetail?businessId=${business.id}`);
  };

  const openPipelineLane = (lane: ActionLane, status: string = 'all') => {
    setSelectedStatus(status);
    setActionLane(lane);
    setActiveTab('pipeline');
  };

  const openInteractionModal = (
    business: Business,
    defaultType: string = 'note',
    defaultCallbackDate: string = '',
    defaultNote: string = ''
  ) => {
    setSelectedBusiness(business);
    setInteractionType(defaultType);
    setInteractionNote(defaultNote);
    setInteractionCallbackDate(defaultCallbackDate);
    setShowInteractionModal(true);
  };

  const handleNextBestAction = (business: Business) => {
    const businessName = business.name || 'ce prospect';
    if (business.next_best_action === 'Appeler' || business.recommended_contact_mode === 'appel') {
      openInteractionModal(
        business,
        'call_outbound',
        '',
        `Appel prioritaire sur ${businessName}${business.phone ? ` (${business.phone})` : ''}.`
      );
      return;
    }

    if (business.next_best_action === 'Préparer une visite' || business.recommended_contact_mode === 'visite') {
      router.push('/visites');
      return;
    }

    if (
      business.next_best_action === 'Exploiter le rebond' ||
      business.next_best_action === 'Vérifier la coordonnée' ||
      business.next_best_action === 'Creuser la fiche' ||
      business.related_clue_potential ||
      business.contact_route === 'fragile' ||
      business.contact_route === 'research'
    ) {
      openBusinessDetail(business);
      return;
    }

    openInteractionModal(business, 'note', '', `Action à mener sur ${businessName}.`);
  };

  const getStatusInfo = (status: string) => {
    return SALES_STATUSES.find(s => s.value === status) || SALES_STATUSES[0];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBusinessPriority = (business: Business) => {
    const statusWeight: Record<string, number> = {
      callback: 0,
      to_call: 1,
      new: 2,
      called: 3,
      meeting_scheduled: 4,
      meeting_done: 5,
      proposal_sent: 6,
      won: 7,
      lost: 8,
      not_interested: 9,
    };

    let priority =
      (statusWeight[business.sales_status || 'new'] ?? 10)
      + (business.phone ? 0 : 20)
      + (business.city ? 0 : 5);

    if (business.related_clue_potential) {
      priority -= 4;
      if (!business.phone || business.recommended_contact_mode === 'verifier') {
        priority -= 4;
      }
    }

    return priority;
  };

  const matchesActionLane = (business: Business, lane: ActionLane) => {
      if (lane === 'all') return true;
      if (lane === 'call') return business.recommended_contact_mode === 'appel' || business.sales_status === 'to_call';
      if (lane === 'visit') return business.recommended_contact_mode === 'visite';
      if (lane === 'callback') return business.sales_status === 'callback';
      if (lane === 'review') return business.recommended_contact_mode === 'verifier';
      if (lane === 'rebound') return !!business.related_clue_potential;
      if (lane === 'fragile') return business.contact_route === 'fragile';
      return true;
    };

  const orderedBusinesses = useMemo(() => {
    return [...businesses]
      .filter((business) => matchesActionLane(business, actionLane))
      .sort((left, right) => {
      const priorityDelta = getBusinessPriority(left) - getBusinessPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const scoreDelta = (right.solocal_priority_score || 0) - (left.solocal_priority_score || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftName = left.name || '';
      const rightName = right.name || '';
      return leftName.localeCompare(rightName, 'fr');
    });
  }, [actionLane, businesses]);

  const focusMetrics = useMemo<FocusMetric[]>(() => {
    const actionableStatuses = new Set(['new', 'to_call', 'callback']);
    const actionable = orderedBusinesses.filter((business) => actionableStatuses.has(business.sales_status || 'new')).length;
    const reachable = orderedBusinesses.filter((business) => !!business.phone).length;
    const missingPhone = orderedBusinesses.filter((business) => !business.phone).length;

    return [
      { key: 'actionable', label: 'À traiter', value: actionable, tone: 'primary' },
      { key: 'reachable', label: 'Joignables', value: reachable, tone: 'success' },
      { key: 'missing-phone', label: 'Sans téléphone', value: missingPhone, tone: 'warning' },
    ];
  }, [orderedBusinesses]);

  const actionLaneCounts = useMemo(() => {
    return ACTION_LANES.reduce<Record<ActionLane, number>>((accumulator, lane) => {
      accumulator[lane.key] = businesses.filter((business) => matchesActionLane(business, lane.key)).length;
      return accumulator;
      }, {
        all: 0,
        rebound: 0,
        fragile: 0,
        call: 0,
        visit: 0,
        callback: 0,
        review: 0,
      });
  }, [businesses]);

  const actionLaneSummary = useMemo(() => {
    const currentCount = actionLaneCounts[actionLane];
    const laneMeta = ACTION_LANES.find((lane) => lane.key === actionLane) || ACTION_LANES[0];

    if (actionLane === 'all') {
      return {
        title: `${currentCount} prospect${currentCount > 1 ? 's' : ''} dans la file active`,
        subtitle: 'Commence par les joignables et les rappels en retard pour maximiser la journée.',
        color: '#4F46E5',
        bg: '#EEF2FF',
      };
    }

    if (actionLane === 'call') {
      return {
        title: `${currentCount} fiche à appeler`,
        subtitle: 'Priorité aux leads joignables avec score Solocal élevé.',
        color: laneMeta.color,
        bg: laneMeta.bg,
      };
    }

    if (actionLane === 'visit') {
      return {
        title: `${currentCount} fiche à visiter`,
        subtitle: 'Prépare la tournée terrain depuis la vue Visites pour éviter les détours.',
        color: laneMeta.color,
        bg: laneMeta.bg,
      };
    }

      if (actionLane === 'rebound') {
        return {
          title: `${currentCount} piste${currentCount > 1 ? 's' : ''} de rebond disponible${currentCount > 1 ? 's' : ''}`,
          subtitle: 'Exploite les dirigeants, noms commerciaux et pistes liées quand la coordonnée directe est fragile.',
          color: laneMeta.color,
          bg: laneMeta.bg,
        };
      }

      if (actionLane === 'fragile') {
        return {
          title: `${currentCount} contact${currentCount > 1 ? 's' : ''} direct${currentCount > 1 ? 's' : ''} fragile${currentCount > 1 ? 's' : ''}`,
          subtitle: 'Coordonnée directe présente mais pas assez fiable : vérifie-la ou bascule sur un rebond plus sûr.',
          color: laneMeta.color,
          bg: laneMeta.bg,
        };
      }

    if (actionLane === 'callback') {
      return {
        title: `${currentCount} relance à faire`,
        subtitle: "Traite d'abord les rappels les plus anciens pour garder un pipeline propre.",
        color: laneMeta.color,
        bg: laneMeta.bg,
      };
    }

    return {
      title: `${currentCount} fiche à vérifier`,
      subtitle: 'Corrige les fiches incertaines avant de les pousser dans le flux commercial.',
      color: laneMeta.color,
      bg: laneMeta.bg,
    };
  }, [actionLane, actionLaneCounts]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Mini CRM</Text>
          <Text style={styles.headerSubtitle}>Pipeline de vente</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { fetchPipeline(); fetchBusinesses(); fetchStats(); }}>
          <Ionicons name="refresh" size={20} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pipeline' && styles.tabActive]}
          onPress={() => setActiveTab('pipeline')}
        >
          <Ionicons name="funnel" size={18} color={activeTab === 'pipeline' ? '#6366F1' : '#9CA3AF'} />
          <Text style={[styles.tabText, activeTab === 'pipeline' && styles.tabTextActive]}>Pipeline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
          onPress={() => setActiveTab('stats')}
        >
          <Ionicons name="stats-chart" size={18} color={activeTab === 'stats' ? '#6366F1' : '#9CA3AF'} />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'callbacks' && styles.tabActive]}
          onPress={() => setActiveTab('callbacks')}
        >
          <Ionicons name="alarm" size={18} color={activeTab === 'callbacks' ? '#F59E0B' : '#9CA3AF'} />
          <Text style={[styles.tabText, activeTab === 'callbacks' && styles.tabTextActive]}>
            Rappels {callbacksCount > 0 && `(${callbacksCount})`}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <View style={styles.statsContainer}>
            {loadingStats ? (
              <ActivityIndicator size="large" color="#6366F1" />
            ) : stats ? (
              <>
                {/* Overview Cards */}
                <View style={styles.statsGrid}>
                  <View style={[styles.statCard, { backgroundColor: '#1F2937' }]}>
                    <Text style={styles.statValue}>{stats.overview?.total_leads || 0}</Text>
                    <Text style={styles.statLabel}>Total Leads</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: '#065F46' }]}>
                    <Text style={styles.statValue}>{stats.overview?.conversion_rate || 0}%</Text>
                    <Text style={styles.statLabel}>Taux Conversion</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: '#7C3AED' }]}>
                    <Text style={styles.statValue}>{stats.overview?.active_opportunities || 0}</Text>
                    <Text style={styles.statLabel}>Opportunites</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: '#B45309' }]}>
                    <Text style={styles.statValue}>{stats.overview?.avg_days_to_close || 0}j</Text>
                    <Text style={styles.statLabel}>Moy. Closing</Text>
                  </View>
                </View>

                {/* This Week */}
                <View style={styles.weekSection}>
                  <Text style={styles.sectionTitle}>Cette semaine</Text>
                  <View style={styles.weekGrid}>
                    <View style={styles.weekItem}>
                      <Ionicons name="add-circle" size={24} color="#10B981" />
                      <Text style={styles.weekValue}>{stats.this_week?.new_leads || 0}</Text>
                      <Text style={styles.weekLabel}>Nouveaux</Text>
                    </View>
                    <View style={styles.weekItem}>
                      <Ionicons name="call" size={24} color="#3B82F6" />
                      <Text style={styles.weekValue}>{stats.this_week?.calls || 0}</Text>
                      <Text style={styles.weekLabel}>Appels</Text>
                    </View>
                    <View style={styles.weekItem}>
                      <Ionicons name="calendar" size={24} color="#8B5CF6" />
                      <Text style={styles.weekValue}>{stats.this_week?.meetings || 0}</Text>
                      <Text style={styles.weekLabel}>RDV</Text>
                    </View>
                    <View style={styles.weekItem}>
                      <Ionicons name="chatbubbles" size={24} color="#F59E0B" />
                      <Text style={styles.weekValue}>{stats.this_week?.interactions || 0}</Text>
                      <Text style={styles.weekLabel}>Interactions</Text>
                    </View>
                  </View>
                </View>

                {/* Performance */}
                <View style={styles.performanceSection}>
                  <Text style={styles.sectionTitle}>Performance</Text>
                  <View style={styles.performanceRow}>
                    <View style={styles.perfItem}>
                      <Text style={[styles.perfValue, { color: '#10B981' }]}>{stats.performance?.won || 0}</Text>
                      <Text style={styles.perfLabel}>Gagnes</Text>
                    </View>
                    <View style={styles.perfItem}>
                      <Text style={[styles.perfValue, { color: '#EF4444' }]}>{stats.performance?.lost || 0}</Text>
                      <Text style={styles.perfLabel}>Perdus</Text>
                    </View>
                    <View style={styles.perfItem}>
                      <Text style={[styles.perfValue, { color: '#6366F1' }]}>{stats.performance?.worked || 0}</Text>
                      <Text style={styles.perfLabel}>Travailles</Text>
                    </View>
                    <View style={styles.perfItem}>
                      <Text style={[styles.perfValue, { color: '#7C3AED' }]}>{stats.overview?.win_rate || 0}%</Text>
                      <Text style={styles.perfLabel}>Win rate</Text>
                    </View>
                  </View>
                </View>

                {!!stats.performance?.top_sources?.length && (
                  <View style={styles.topSourcesSection}>
                    <Text style={styles.sectionTitle}>Sources qui gagnent</Text>
                    <Text style={styles.topSourcesHint}>
                      Les origines de leads qui convertissent le mieux sur tes gains deja signes.
                    </Text>
                    {stats.performance.top_sources.map((source: any, index: number) => (
                      <View key={`${source.source}-${index}`} style={styles.topSourceRow}>
                        <View style={styles.topSourceRank}>
                          <Text style={styles.topSourceRankText}>{index + 1}</Text>
                        </View>
                        <View style={styles.topSourceText}>
                          <Text style={styles.topSourceLabel}>{source.source || 'unknown'}</Text>
                          <Text style={styles.topSourceMeta}>{source.wins || 0} gain(s)</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.statsActionsSection}>
                  <Text style={styles.sectionTitle}>Passer a l action</Text>
                  <View style={styles.statsActionsGrid}>
                    <TouchableOpacity style={styles.statsActionBtn} onPress={() => openPipelineLane('call')}>
                      <Ionicons name="call-outline" size={18} color="#047857" />
                      <Text style={styles.statsActionBtnText}>A appeler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statsActionBtn} onPress={() => setActiveTab('callbacks')}>
                      <Ionicons name="alarm-outline" size={18} color="#B45309" />
                      <Text style={styles.statsActionBtnText}>Rappels</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statsActionBtn} onPress={() => openPipelineLane('rebound')}>
                      <Ionicons name="git-network-outline" size={18} color="#1D4ED8" />
                      <Text style={styles.statsActionBtnText}>Rebond</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statsActionBtn} onPress={() => openPipelineLane('fragile')}>
                      <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                      <Text style={styles.statsActionBtnText}>Fragiles</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>Aucune donnee disponible</Text>
            )}
          </View>
        )}

        {/* Callbacks Tab */}
        {activeTab === 'callbacks' && (
          <View style={styles.callbacksContainer}>
            {loadingCallbacks ? (
              <ActivityIndicator size="large" color="#F59E0B" />
            ) : callbacks.length > 0 ? (
              callbacks.map((callback, index) => (
                <View key={index} style={[styles.callbackCard, callback.is_overdue && styles.callbackOverdue]}>
                  <View style={styles.callbackHeader}>
                    <TouchableOpacity
                      style={styles.callbackTitleWrap}
                      onPress={() => router.push(`/businessdetail?businessId=${callback.business_id}`)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.callbackName}>{callback.business_name}</Text>
                      {!!callback.business_pl_reference && (
                        <Text style={styles.callbackReference}>{callback.business_pl_reference}</Text>
                      )}
                    </TouchableOpacity>
                    {callback.is_overdue && (
                      <View style={styles.overdueBadge}>
                        <Text style={styles.overdueText}>-{callback.days_overdue}j</Text>
                      </View>
                    )}
                  </View>
                  {!!callback.contact_route_label && (
                    <View style={[styles.callbackRouteBadge, {
                      backgroundColor: (CONTACT_ROUTE_META[callback.contact_route || 'research'] || CONTACT_ROUTE_META.research).bg
                    }]}>
                      <Ionicons
                        name={(CONTACT_ROUTE_META[callback.contact_route || 'research'] || CONTACT_ROUTE_META.research).icon}
                        size={13}
                        color={(CONTACT_ROUTE_META[callback.contact_route || 'research'] || CONTACT_ROUTE_META.research).color}
                      />
                      <Text
                        style={[
                          styles.callbackRouteBadgeText,
                          { color: (CONTACT_ROUTE_META[callback.contact_route || 'research'] || CONTACT_ROUTE_META.research).color }
                        ]}
                      >
                        {callback.contact_route_label}
                      </Text>
                    </View>
                  )}
                  {callback.phone_reliability_status && callback.phone_reliability_label ? (
                    <View
                      style={[
                        styles.callbackReliabilityBadge,
                        { backgroundColor: (PHONE_RELIABILITY_META[callback.phone_reliability_status] || PHONE_RELIABILITY_META.missing).bg }
                      ]}
                    >
                      <Ionicons
                        name={(PHONE_RELIABILITY_META[callback.phone_reliability_status] || PHONE_RELIABILITY_META.missing).icon}
                        size={13}
                        color={(PHONE_RELIABILITY_META[callback.phone_reliability_status] || PHONE_RELIABILITY_META.missing).color}
                      />
                      <Text
                        style={[
                          styles.callbackReliabilityBadgeText,
                          { color: (PHONE_RELIABILITY_META[callback.phone_reliability_status] || PHONE_RELIABILITY_META.missing).color }
                        ]}
                      >
                        {callback.phone_reliability_label}
                      </Text>
                    </View>
                  ) : null}
                  {callback.business_phone && (
                    <TouchableOpacity style={styles.callbackPhone} onPress={() => callPhone(callback.business_phone)}>
                      <Ionicons name="call" size={16} color="#10B981" />
                      <Text style={styles.callbackPhoneText}>{callback.business_phone}</Text>
                    </TouchableOpacity>
                  )}
                  {!!callback.phone_reliability_reason && (
                    <Text style={styles.callbackHint}>{callback.phone_reliability_reason}</Text>
                  )}
                  {callback.note && (
                    <Text style={styles.callbackNote} numberOfLines={2}>{callback.note}</Text>
                  )}
                  {!!callback.next_best_action_detail && (
                    <View style={styles.callbackActionHintCard}>
                      <Ionicons name="flash-outline" size={15} color="#4F46E5" />
                      <Text style={styles.callbackActionHintText}>{callback.next_best_action_detail}</Text>
                    </View>
                  )}
                  <Text style={styles.callbackDate}>
                    <Ionicons name="time" size={12} color="#9CA3AF" /> {callback.callback_date ? new Date(callback.callback_date).toLocaleDateString('fr-FR') : 'Non défini'}
                  </Text>
                  <View style={styles.callbackActions}>
                    {!!callback.business_phone && (
                      <TouchableOpacity
                        style={styles.callbackActionBtn}
                        onPress={() => copyPhone(callback.business_phone, `callback-${callback.business_id}`)}
                      >
                        <Ionicons
                          name={copiedPhoneKey === `callback-${callback.business_id}` ? 'checkmark-outline' : 'copy-outline'}
                          size={15}
                          color={copiedPhoneKey === `callback-${callback.business_id}` ? '#047857' : '#4F46E5'}
                        />
                        <Text
                          style={[
                            styles.callbackActionText,
                            copiedPhoneKey === `callback-${callback.business_id}` && styles.callbackActionTextActive,
                          ]}
                        >
                          {copiedPhoneKey === `callback-${callback.business_id}` ? 'Copie' : 'Copier'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.callbackActionBtn}
                      onPress={() => router.push(`/businessdetail?businessId=${callback.business_id}`)}
                    >
                      <Ionicons name="open-outline" size={15} color="#4F46E5" />
                      <Text style={styles.callbackActionText}>Fiche</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.callbackActionBtn, styles.callbackActionBtnPrimary]}
                      onPress={() =>
                        openInteractionModal(
                          {
                            id: callback.business_id,
                            name: callback.business_name,
                            phone: callback.business_phone,
                            city: callback.business_city,
                          },
                          'call_outbound'
                        )
                      }
                    >
                      <Ionicons name="call-outline" size={15} color="#FFF" />
                      <Text style={styles.callbackActionTextPrimary}>Traiter</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyCallbacks}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={styles.emptyText}>Aucun rappel en attente</Text>
              </View>
            )}
          </View>
        )}

        {/* Pipeline Tab (existing content) */}
        {activeTab === 'pipeline' && (
          <>
            {/* Pipeline Overview */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pipelineScroll}>
          <View style={styles.pipelineRow}>
            <TouchableOpacity
              style={[styles.pipelineCard, selectedStatus === 'all' && styles.pipelineCardSelected]}
              onPress={() => setSelectedStatus('all')}
            >
              <Text style={styles.pipelineCount}>{pipeline.reduce((sum, p) => sum + p.count, 0)}</Text>
              <Text style={styles.pipelineLabel}>Tous</Text>
            </TouchableOpacity>
            {pipeline.map((item) => (
              <TouchableOpacity
                key={item.status}
                style={[
                  styles.pipelineCard,
                  { borderLeftColor: item.color },
                  selectedStatus === item.status && styles.pipelineCardSelected
                ]}
                onPress={() => setSelectedStatus(item.status)}
              >
                <Text style={[styles.pipelineCount, { color: item.color }]}>{item.count}</Text>
                <Text style={styles.pipelineLabel} numberOfLines={1}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Callbacks Alert */}
        {callbacksCount > 0 && (
          <TouchableOpacity style={styles.callbackAlert} onPress={() => setActiveTab('callbacks')}>
            <Ionicons name="alarm" size={20} color="#F59E0B" />
            <Text style={styles.callbackText}>{callbacksCount} rappel(s) en attente</Text>
            <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
          </TouchableOpacity>
        )}

        {/* Businesses List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedStatus === 'all' ? 'Tous les leads' : getStatusInfo(selectedStatus).label} ({total})
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.actionLaneScroll}
            contentContainerStyle={styles.actionLaneRow}
          >
            {ACTION_LANES.map((lane) => {
              const selected = actionLane === lane.key;
              return (
                <TouchableOpacity
                  key={lane.key}
                  style={[
                    styles.actionLaneChip,
                    { borderColor: lane.color, backgroundColor: selected ? lane.bg : '#FFF' },
                    selected && styles.actionLaneChipSelected,
                  ]}
                  onPress={() => setActionLane(lane.key)}
                >
                  <View style={[styles.actionLaneIconWrap, { backgroundColor: lane.bg }]}>
                    <Ionicons name={lane.icon} size={15} color={lane.color} />
                  </View>
                  <View style={styles.actionLaneTextWrap}>
                    <Text style={[styles.actionLaneLabel, { color: lane.color }]}>{lane.label}</Text>
                    <Text style={styles.actionLaneCount}>{actionLaneCounts[lane.key]}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.focusMetricsRow}>
            {focusMetrics.map((metric) => (
              <View
                key={metric.key}
                style={[
                  styles.focusMetricCard,
                  metric.tone === 'success' && styles.focusMetricCardSuccess,
                  metric.tone === 'warning' && styles.focusMetricCardWarning,
                ]}
              >
                <Text style={styles.focusMetricValue}>{metric.value}</Text>
                <Text style={styles.focusMetricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.actionLaneSummaryCard, { backgroundColor: actionLaneSummary.bg }]}>
            <View style={styles.actionLaneSummaryIcon}>
              <Ionicons
                name={(ACTION_LANES.find((lane) => lane.key === actionLane)?.icon || 'apps-outline') as any}
                size={18}
                color={actionLaneSummary.color}
              />
            </View>
            <View style={styles.actionLaneSummaryText}>
              <Text style={[styles.actionLaneSummaryTitle, { color: actionLaneSummary.color }]}>
                {actionLaneSummary.title}
              </Text>
              <Text style={styles.actionLaneSummarySubtitle}>{actionLaneSummary.subtitle}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
            </View>
          ) : orderedBusinesses.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>Aucun lead dans ce statut</Text>
            </View>
          ) : (
            orderedBusinesses.map((business) => {
              const statusInfo = getStatusInfo(business.sales_status || 'new');
                return (
                  <View key={business.id} style={styles.businessCard}>
                    {(() => {
                      const routeMeta = business.contact_route ? CONTACT_ROUTE_META[business.contact_route] : null;
                    return routeMeta && business.contact_route_label ? (
                      <View style={[styles.contactRouteBadge, { backgroundColor: routeMeta.bg }]}>
                        <Ionicons name={routeMeta.icon} size={13} color={routeMeta.color} />
                        <Text style={[styles.contactRouteBadgeText, { color: routeMeta.color }]}>
                          {business.contact_route_label}
                        </Text>
                        </View>
                      ) : null;
                    })()}
                    {(() => {
                      const phoneReliabilityMeta = business.phone_reliability_status
                        ? PHONE_RELIABILITY_META[business.phone_reliability_status]
                        : null;
                      return phoneReliabilityMeta && business.phone_reliability_label ? (
                        <View style={[styles.phoneReliabilityBadge, { backgroundColor: phoneReliabilityMeta.bg }]}>
                          <Ionicons name={phoneReliabilityMeta.icon} size={13} color={phoneReliabilityMeta.color} />
                          <Text style={[styles.phoneReliabilityBadgeText, { color: phoneReliabilityMeta.color }]}>
                            {business.phone_reliability_label}
                          </Text>
                        </View>
                      ) : null;
                    })()}
                    <View style={styles.businessHeader}>
                    <View style={[styles.statusIndicator, { backgroundColor: statusInfo.color }]} />
                    <TouchableOpacity
                      style={styles.businessInfo}
                      onPress={() => openBusinessDetail(business)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.businessName} numberOfLines={1}>{business.name}</Text>
                      {business.pl_reference && (
                        <Text style={styles.businessRef}>{business.pl_reference}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.businessOpenBtn}
                      onPress={() => openBusinessDetail(business)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="open-outline" size={16} color="#4F46E5" />
                      <Text style={styles.businessOpenBtnText}>Fiche</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}
                      onPress={() => openStatusModal(business)}
                    >
                      <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
                      <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.businessDetails}>
                    {business.phone && (
                      <View style={styles.detailRow}>
                        <Ionicons name="call-outline" size={14} color="#666" />
                        <Text style={styles.detailText}>{business.phone}</Text>
                      </View>
                    )}
                    {business.city && (
                      <View style={styles.detailRow}>
                        <Ionicons name="location-outline" size={14} color="#666" />
                        <Text style={styles.detailText}>{business.city}</Text>
                      </View>
                    )}
                    {(business.recommended_contact_mode || business.solocal_priority_reason || typeof business.solocal_priority_score === 'number') && (
                      <View style={styles.priorityPanel}>
                        <View style={styles.priorityPanelTop}>
                          {business.recommended_contact_mode && CONTACT_MODE_META[business.recommended_contact_mode] && (
                            <View
                              style={[
                                styles.contactModeBadge,
                                { backgroundColor: CONTACT_MODE_META[business.recommended_contact_mode].bg },
                              ]}
                            >
                              <Ionicons
                                name={CONTACT_MODE_META[business.recommended_contact_mode].icon}
                                size={13}
                                color={CONTACT_MODE_META[business.recommended_contact_mode].color}
                              />
                              <Text
                                style={[
                                  styles.contactModeBadgeText,
                                  { color: CONTACT_MODE_META[business.recommended_contact_mode].color },
                                ]}
                              >
                                {CONTACT_MODE_META[business.recommended_contact_mode].label}
                              </Text>
                            </View>
                          )}
                          {typeof business.solocal_priority_score === 'number' && (
                            <View style={styles.priorityScoreBadge}>
                              <Text style={styles.priorityScoreValue}>{business.solocal_priority_score}</Text>
                              <Text style={styles.priorityScoreLabel}>{business.solocal_priority_label || 'Priorité'}</Text>
                            </View>
                          )}
                        </View>
                        {!!business.solocal_priority_reason && (
                          <Text style={styles.priorityReasonText}>{business.solocal_priority_reason}</Text>
                        )}
                        {!!business.next_best_action && (
                          <View style={styles.nextActionBanner}>
                            <Ionicons name="flash-outline" size={13} color="#7C3AED" />
                            <View style={styles.nextActionTextWrap}>
                              <Text style={styles.nextActionTitle}>{business.next_best_action}</Text>
                              {!!business.next_best_action_detail && (
                                <Text style={styles.nextActionSubtitle}>{business.next_best_action_detail}</Text>
                              )}
                            </View>
                          </View>
                        )}
                        {business.related_clue_potential && (
                          <View style={styles.reboundBadge}>
                            <Ionicons name="git-network-outline" size={13} color={REBOUND_META.color} />
                            <Text style={styles.reboundBadgeText}>
                              {business.related_clue_reason || REBOUND_META.label}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                  
                    <View style={styles.businessActions}>
                      {!!business.next_best_action && (
                        <TouchableOpacity 
                          style={[styles.actionBtn, styles.actionBtnSuccess]}
                          onPress={() => handleNextBestAction(business)}
                        >
                          <Ionicons name="flash-outline" size={16} color="#FFF" />
                          <Text style={styles.actionTextPrimary}>Traiter</Text>
                        </TouchableOpacity>
                      )}
                      {!!business.phone && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnSuccess]}
                          onPress={() => callPhone(business.phone)}
                        >
                          <Ionicons name="call-outline" size={16} color="#FFF" />
                          <Text style={styles.actionTextPrimary}>Appeler</Text>
                        </TouchableOpacity>
                      )}
                      {!!business.phone && (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => copyPhone(business.phone!, `pipeline-${business.id}`)}
                        >
                          <Ionicons
                            name={copiedPhoneKey === `pipeline-${business.id}` ? 'checkmark-outline' : 'copy-outline'}
                            size={16}
                            color={copiedPhoneKey === `pipeline-${business.id}` ? '#047857' : '#6366F1'}
                          />
                          <Text
                            style={[
                              styles.actionText,
                              copiedPhoneKey === `pipeline-${business.id}` && styles.actionTextActive,
                            ]}
                          >
                            {copiedPhoneKey === `pipeline-${business.id}` ? 'Copie' : 'Copier'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        style={styles.actionBtn}
                        onPress={() => openBusinessDetail(business)}
                      >
                        <Ionicons name="open-outline" size={16} color="#6366F1" />
                        <Text style={styles.actionText}>Fiche</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionBtn}
                        onPress={() => openInteractionModal(business)}
                      >
                      <Ionicons name="add" size={16} color="#6366F1" />
                      <Text style={styles.actionText}>Note</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.actionBtn}
                      onPress={() => loadHistory(business)}
                    >
                      <Ionicons name="time-outline" size={16} color="#6366F1" />
                      <Text style={styles.actionText}>Historique</Text>
                    </TouchableOpacity>
                    {business.related_clue_potential && (
                      <TouchableOpacity 
                        style={[styles.actionBtn, styles.actionBtnInfo]}
                        onPress={() => openBusinessDetail(business)}
                      >
                        <Ionicons name="git-network-outline" size={16} color="#1D4ED8" />
                        <Text style={styles.actionTextInfo}>Pistes</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => openStatusModal(business)}
                    >
                      <Ionicons name="swap-horizontal" size={16} color="#FFF" />
                      <Text style={styles.actionTextPrimary}>Statut</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
          </>
        )}
      </ScrollView>

      <CrmModals
        styles={styles}
        selectedBusiness={selectedBusiness}
        showStatusModal={showStatusModal}
        showInteractionModal={showInteractionModal}
        showHistoryModal={showHistoryModal}
        changingStatus={changingStatus}
        savingInteraction={savingInteraction}
        loadingHistory={loadingHistory}
        deletingInteractionId={deletingInteractionId}
        interactionType={interactionType}
        interactionNote={interactionNote}
        interactionCallbackDate={interactionCallbackDate}
        interactions={interactions}
        salesStatuses={SALES_STATUSES}
        interactionTypes={INTERACTION_TYPES}
        onCloseStatusModal={() => setShowStatusModal(false)}
        onCloseInteractionModal={() => setShowInteractionModal(false)}
        onCloseHistoryModal={() => setShowHistoryModal(false)}
        onUpdateStatus={updateStatus}
        onSetInteractionType={setInteractionType}
        onSetInteractionNote={setInteractionNote}
        onSetInteractionCallbackDate={setInteractionCallbackDate}
        onSaveInteraction={saveInteraction}
        onDeleteInteraction={deleteInteraction}
        formatDate={formatDate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  pipelineScroll: {
    backgroundColor: '#FFF',
    paddingVertical: 16,
  },
  actionLaneScroll: {
    marginBottom: 12,
  },
  actionLaneRow: {
    gap: 10,
    paddingRight: 8,
  },
  actionLaneChip: {
    minWidth: 132,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionLaneChipSelected: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionLaneIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLaneTextWrap: {
    flex: 1,
  },
  actionLaneLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionLaneCount: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  pipelineRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },
  pipelineCard: {
    width: 80,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#6B7280',
  },
  pipelineCardSelected: {
    backgroundColor: '#EEF2FF',
  },
  pipelineCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  pipelineLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  callbackAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  callbackText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#D97706',
  },
  focusMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionLaneSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  actionLaneSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFFB8',
  },
  actionLaneSummaryText: {
    flex: 1,
  },
  actionLaneSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  actionLaneSummarySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  focusMetricCard: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  focusMetricCardSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  focusMetricCardWarning: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  focusMetricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  focusMetricLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  businessCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  contactRouteBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  contactRouteBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  phoneReliabilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  phoneReliabilityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  businessRef: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  businessOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    marginRight: 8,
  },
  businessOpenBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  businessDetails: {
    marginLeft: 16,
    marginBottom: 10,
    gap: 4,
  },
  priorityPanel: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  priorityPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contactModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  contactModeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  priorityScoreBadge: {
    alignItems: 'flex-end',
  },
  priorityScoreValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  priorityScoreLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  priorityReasonText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#4B5563',
  },
  nextActionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  nextActionTextWrap: {
    flex: 1,
    gap: 2,
  },
  nextActionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D28D9',
  },
  nextActionSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: '#5B21B6',
  },
  reboundBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: REBOUND_META.bg,
  },
  reboundBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: REBOUND_META.color,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  businessActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginLeft: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  actionBtnInfo: {
    backgroundColor: '#DBEAFE',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6366F1',
  },
  actionTextActive: {
    color: '#047857',
  },
  actionTextInfo: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1D4ED8',
  },
  actionBtnPrimary: {
    backgroundColor: '#6366F1',
  },
  actionBtnSuccess: {
    backgroundColor: '#059669',
  },
  actionTextPrimary: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFF',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '70%',
  },
  historyModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  statusList: {
    maxHeight: 400,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  statusOptionSelected: {
    backgroundColor: '#EEF2FF',
  },
  statusOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusOptionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  interactionTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  interactionTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  interactionTypeBtnSelected: {
    backgroundColor: '#6366F1',
  },
  interactionTypeText: {
    fontSize: 13,
    color: '#666',
  },
  interactionTypeTextSelected: {
    color: '#FFF',
  },
  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  callbackInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
    color: '#1C1C1E',
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyHistory: {
    padding: 40,
    alignItems: 'center',
  },
  historyList: {
    maxHeight: 350,
  },
  historyItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 8,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyContent: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  historyNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  historyDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  historyActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  historyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  historyActionBtnDanger: {
    backgroundColor: '#FEF2F2',
  },
  historyActionTextDanger: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  closeBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  // Tabs styles
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#1C1C1E',
  },
  // Stats styles
  statsContainer: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  weekSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  weekItem: {
    alignItems: 'center',
  },
  weekValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 4,
  },
  weekLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  performanceSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  perfItem: {
    alignItems: 'center',
  },
  perfValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  perfLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  topSourcesSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  topSourcesHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    marginBottom: 10,
  },
  topSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  topSourceRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  topSourceRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
  },
  topSourceText: {
    flex: 1,
  },
  topSourceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  topSourceMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statsActionsSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  statsActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  statsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statsActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  // Callbacks styles
  callbacksContainer: {
    padding: 16,
  },
  callbackCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  callbackOverdue: {
    borderLeftColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  callbackRouteBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 8,
  },
  callbackRouteBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  callbackReliabilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 8,
  },
  callbackReliabilityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  callbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  callbackTitleWrap: {
    flex: 1,
  },
  callbackName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  callbackReference: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  overdueBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  callbackPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  callbackPhoneText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  callbackHint: {
    fontSize: 12,
    color: '#92400E',
    marginBottom: 8,
  },
  callbackNote: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  callbackActionHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  callbackActionHintText: {
    flex: 1,
    fontSize: 13,
    color: '#3730A3',
    fontWeight: '600',
  },
  callbackDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  callbackActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  callbackActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#EEF2FF',
  },
  callbackActionBtnPrimary: {
    backgroundColor: '#4F46E5',
  },
  callbackActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  callbackActionTextActive: {
    color: '#047857',
  },
  callbackActionTextPrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyCallbacks: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },
});

