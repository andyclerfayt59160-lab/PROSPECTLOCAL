import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { handleAuthError, checkAuth } from '../utils/authHelpers';

import { API_URL } from '../utils/api';
import { useScan } from '../context/ScanContext';

interface Scan {
  id: string;
  query_label: string;
  query_input?: string;
  queries_input?: string[];
  selected_domains?: string[];
  location_label: string;
  location_input?: string;
  radius_km: number;
  max_results_requested?: number;
  created_at: string;
  status: string;
  total_results: number;
  result_count?: number;
  is_favorite: boolean;
  scan_type?: string;
  web_enriched_count?: number;
  web_phones_found?: number;
  leads_with_phone?: number;
  search_queries_count?: number;
  source_queries_per_search?: number;
  serper_requests_used?: number;
  activities_selected?: number;
  activities_available?: number;
  search_type?: 'activity' | 'domain';
  domain_mode?: 'quick' | 'exhaustive';
  include_facebook?: boolean;
  include_linkedin?: boolean;
  include_websites?: boolean;
  completed_at?: string;
  progress?: number;
  progress_message?: string;
  progress_step?: number;
  progress_total_steps?: number;
}

type ScanHistoryVerdict = {
  label: string;
  color: string;
  backgroundColor: string;
  summary: string;
  cost: string;
};

type ScanStatusPresentation = {
  label: string;
  color: string;
  backgroundColor: string;
};

const formatScanDateTime = (dateString?: string) => {
  if (!dateString) return 'Heure inconnue';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Heure inconnue';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScanStatusPresentation = (scan: Scan): ScanStatusPresentation => {
  const normalizedStatus = (scan.status || '').toLowerCase();

  if (normalizedStatus === 'processing') {
    return {
      label: typeof scan.progress === 'number' ? `En cours (${scan.progress}%)` : 'En cours',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
    };
  }
  if (normalizedStatus === 'done') {
    return {
      label: 'Termine',
      color: '#047857',
      backgroundColor: '#D1FAE5',
    };
  }
  if (normalizedStatus === 'failed') {
    return {
      label: 'Interrompu',
      color: '#B91C1C',
      backgroundColor: '#FEE2E2',
    };
  }
  return {
    label: scan.status || 'Statut inconnu',
    color: '#475569',
    backgroundColor: '#E2E8F0',
  };
};

const buildScanTimelineLabel = (scan: Scan) => {
  if ((scan.status || '').toLowerCase() === 'done' && scan.completed_at) {
    return `Termine le ${formatScanDateTime(scan.completed_at)}`;
  }
  return `Lance le ${formatScanDateTime(scan.created_at)}`;
};

const buildScanProgressLabel = (scan: Scan) => {
  if ((scan.status || '').toLowerCase() !== 'processing') {
    return null;
  }

  const message = scan.progress_message || 'Scan en cours...';
  if (
    typeof scan.progress_step === 'number' &&
    typeof scan.progress_total_steps === 'number' &&
    scan.progress_total_steps > 0
  ) {
    return `${message} (${scan.progress_step}/${scan.progress_total_steps})`;
  }
  if (typeof scan.progress === 'number') {
    return `${message} (${scan.progress}%)`;
  }
  return message;
};

const buildWebHistoryVerdict = (scan: Scan): ScanHistoryVerdict => {
  const resultCount = scan.result_count ?? scan.total_results ?? 0;
  const leadsWithPhone = scan.leads_with_phone ?? scan.web_phones_found ?? 0;
  const enrichedCount = scan.web_enriched_count ?? 0;
  const requestsUsed =
    scan.serper_requests_used ??
    ((scan.search_queries_count || 0) * (scan.source_queries_per_search || 0));
  const activitiesSelected = scan.activities_selected ?? 0;
  const activitiesAvailable = scan.activities_available ?? 0;
  const coverageRatio = activitiesSelected > 0
    ? activitiesSelected / Math.max(activitiesAvailable, activitiesSelected)
    : 0;
  const directYield = resultCount > 0 ? leadsWithPhone / resultCount : 0;
  const resultYield = requestsUsed > 0 ? resultCount / requestsUsed : 0;
  const cost = requestsUsed > 0
    ? `${requestsUsed} cr. Serper • ${leadsWithPhone} tel. directs`
    : `${resultCount} resultats • ${leadsWithPhone} tel. directs`;

  if (resultCount === 0) {
    return {
      label: 'Recherche a sec',
      color: '#B91C1C',
      backgroundColor: '#FEE2E2',
      summary: 'Aucune fiche exploitable sur ce cadrage.',
      cost,
    };
  }

  if (scan.search_type === 'domain' && scan.domain_mode === 'quick' && coverageRatio > 0 && coverageRatio < 0.55) {
    return {
      label: 'Couverture partielle',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
      summary: `Domaine echantillonne a ${Math.round(coverageRatio * 100)}%.`,
      cost,
    };
  }

  if (leadsWithPhone === 0 && resultCount > 0) {
    return {
      label: 'Coordonnees faibles',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
      summary: `${resultCount} fiches trouvees mais aucun numero direct utile.`,
      cost,
    };
  }

  if (requestsUsed > 0 && resultYield < 0.12) {
    return {
      label: 'Peu rentable',
      color: '#7C2D12',
      backgroundColor: '#FED7AA',
      summary: `Rendement encore faible pour ${requestsUsed} credits consommes.`,
      cost,
    };
  }

  if (leadsWithPhone >= 5 || directYield >= 0.45 || enrichedCount >= 5) {
    return {
      label: 'Rentable',
      color: '#047857',
      backgroundColor: '#D1FAE5',
      summary: 'Bon volume joignable ou bien enrichi.',
      cost,
    };
  }

  return {
    label: 'Bon test commercial',
    color: '#4338CA',
    backgroundColor: '#E0E7FF',
    summary: 'Du potentiel, sans etre encore un cadrage de reference.',
    cost,
  };
};

interface Activity {
  id: string;
  label: string;
  family: string;
}

interface WebScanEstimate {
  search_type: 'activity' | 'domain';
  domain_mode: 'quick' | 'exhaustive';
  query_label: string;
  activities_available: number;
  activities_selected: number;
  resolved_families: string[];
  selected_activity_labels: string[];
  search_queries_count: number;
  source_queries_per_search: number;
  estimated_serper_credits: number;
  estimated_duration_minutes: number;
  estimated_result_ceiling: number;
  serper_budget?: {
    monthly_budget: number;
    credits_used: number;
    credits_remaining: number;
    estimated_need: number;
    remaining_after_scan: number;
    will_exceed_budget: boolean;
  };
}

const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  habitat: { label: 'Habitat', icon: 'home' },
  commerce: { label: 'Commerce', icon: 'storefront' },
  restauration: { label: 'Restauration', icon: 'restaurant' },
  auto: { label: 'Auto', icon: 'car' },
  beaute: { label: 'Beaute / Bien-etre', icon: 'sparkles' },
  sante: { label: 'Sante', icon: 'medical' },
  b2b: { label: 'B2B', icon: 'briefcase' },
  autre: { label: 'Autre', icon: 'grid' },
};

const DOMAIN_ORDER = ['habitat', 'commerce', 'restauration', 'auto', 'beaute', 'sante', 'b2b', 'autre'];

const normalizeFamilyKey = (family: string) =>
  family
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const stripWebScanPrefix = (value: string = '') =>
  value.replace(/^Scan Internet -\s*/i, '').trim();

const extractWebScanLocationInput = (scan: { location_input?: string; location_label: string }) =>
  (scan.location_input || scan.location_label || '')
    .replace(/\s*\+\s*\d+\s*km$/i, '')
    .trim();

const mapWebDomainLabelToId = (label: string): string | null => {
  const normalized = normalizeFamilyKey(label);

  if (normalized.includes('habitat')) return 'habitat';
  if (normalized.includes('commerce')) return 'commerce';
  if (normalized.includes('restauration') || normalized.includes('restaurant')) return 'restauration';
  if (normalized.includes('auto') || normalized.includes('moto')) return 'auto';
  if (normalized.includes('beaute') || normalized.includes('bien-etre') || normalized.includes('bienetre')) return 'beaute';
  if (normalized.includes('sante')) return 'sante';
  if (normalized.includes('service') || normalized.includes('b2b') || normalized.includes('autre')) return 'services';
  if (normalized.includes('tech') || normalized.includes('digital')) return 'tech';
  return null;
};

const inferWebScanDomainIds = (scan: Scan): string[] => {
  if (Array.isArray(scan.selected_domains) && scan.selected_domains.length > 0) {
    return Array.from(new Set(scan.selected_domains));
  }

  const cleanedLabel = stripWebScanPrefix(scan.query_label);
  if (!/^Domaines:/i.test(cleanedLabel)) {
    return [];
  }

  return Array.from(
    new Set(
      cleanedLabel
        .replace(/^Domaines:\s*/i, '')
        .split(',')
        .map((value) => mapWebDomainLabelToId(value.trim()))
        .filter(Boolean) as string[]
    )
  );
};

export default function ScanInternetScreen() {
  const router = useRouter();
  const { activeScans } = useScan();
  const [scans, setScans] = useState<Scan[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [showNewScanModal, setShowNewScanModal] = useState(false);
  
  // New scan form state
  const [searchType, setSearchType] = useState<'activity' | 'domain'>('activity');
  const [domainMode, setDomainMode] = useState<'quick' | 'exhaustive'>('quick');
  const [activity, setActivity] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(20);
  const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanEstimate, setScanEstimate] = useState<WebScanEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  const domains = [
    { id: 'habitat', label: 'Habitat', icon: 'home' },
    { id: 'commerce', label: 'Commerce', icon: 'storefront' },
    { id: 'restauration', label: 'Restauration', icon: 'restaurant' },
    { id: 'auto', label: 'Auto/Moto', icon: 'car' },
    { id: 'beaute', label: 'Beauté/Bien-être', icon: 'sparkles' },
    { id: 'sante', label: 'Santé', icon: 'medical' },
    { id: 'services', label: 'Services', icon: 'briefcase' },
    { id: 'tech', label: 'Tech/Digital', icon: 'laptop' },
  ];

  const domainOptions = Array.from(
    activities.reduce((map, activityItem) => {
      const family = activityItem.family;
      const key = normalizeFamilyKey(family);
      const meta = DOMAIN_META[key] || { label: family, icon: 'grid' };
      const existing = map.get(family);

      if (existing) {
        existing.count += 1;
      } else {
        map.set(family, {
          id: family,
          key,
          label: meta.label,
          icon: meta.icon,
          count: 1,
        });
      }

      return map;
    }, new Map<string, { id: string; key: string; label: string; icon: string; count: number }>())
      .values()
  ).sort((left, right) => {
    const leftIndex = DOMAIN_ORDER.indexOf(left.key);
    const rightIndex = DOMAIN_ORDER.indexOf(right.key);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });

  // Check authentication on mount
  useEffect(() => {
    const init = async () => {
      const isAuthenticated = await checkAuth();
      if (isAuthenticated) {
        loadScans();
        loadActivities();
      }
    };
    init();
  }, []);

  useEffect(() => {
    loadScans();
  }, [activeScans.length]);

  // City autocomplete
  useEffect(() => {
    const searchCities = async () => {
      if (city.length < 2) {
        setCitySuggestions([]);
        return;
      }
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=nom,codesPostaux,departement,population&boost=population&limit=5`
        );
        const data = await response.json();
        setCitySuggestions(data);
      } catch (error) {
        console.error('City search error:', error);
      }
    };
    const timer = setTimeout(searchCities, 300);
    return () => clearTimeout(timer);
  }, [city]);

  const loadScans = async () => {
    try {
      // Check auth before making API call
      const isAuthenticated = await checkAuth();
      if (!isAuthenticated) return;
      
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/scans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Filter only web/internet scans and standard scans (not pappers-only)
      const internetScans = response.data.filter((s: Scan) => 
        s.scan_type === 'web_scan' || 
        s.scan_type === 'internet' ||
        !s.scan_type || // Standard scans
        s.scan_type === 'standard'
      );
      
      setScans(internetScans);
    } catch (error: any) {
      console.error('Error loading scans:', error);
      // Handle auth errors - redirect to login if 401
      const wasAuthError = await handleAuthError(error, true);
      if (!wasAuthError) {
        if (Platform.OS === 'web') {
          console.log('Erreur lors du chargement des scans');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadActivities = async () => {
    try {
      const isAuthenticated = await checkAuth();
      if (!isAuthenticated) return;

      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setActivities(response.data || []);
    } catch (error: any) {
      console.error('Error loading activities:', error);
      const wasAuthError = await handleAuthError(error, true);
      if (!wasAuthError) {
        setActivities([]);
      }
    } finally {
      setLoadingActivities(false);
    }
  };

  const resolveSelectedDomainFamilies = () => {
    const familiesByKey = domainOptions.reduce((map, domainOption) => {
      if (!map[domainOption.key]) {
        map[domainOption.key] = domainOption.id;
      }
      return map;
    }, {} as Record<string, string>);

    const domainToFamilyKeys: Record<string, string[]> = {
      habitat: ['habitat'],
      commerce: ['commerce'],
      restauration: ['restauration'],
      auto: ['auto'],
      beaute: ['beaute'],
      sante: ['sante'],
      services: ['b2b', 'autre'],
      tech: ['b2b'],
    };

    return Array.from(
      new Set(
        selectedDomains.flatMap((domainId) =>
          (domainToFamilyKeys[domainId] || [])
            .map((familyKey) => familiesByKey[familyKey])
            .filter(Boolean)
        )
      )
    );
  };

  const buildDomainSearchPayload = () => {
    const resolvedFamilies = resolveSelectedDomainFamilies();
    const maxActivitiesPerFamily = resolvedFamilies.length > 1 ? 3 : 6;
    const activityLabels = Array.from(
      new Set(
        resolvedFamilies.flatMap((family) =>
          activities
            .filter((activityItem) => activityItem.family === family)
            .sort((left, right) => left.label.localeCompare(right.label))
            .slice(0, maxActivitiesPerFamily)
            .map((activityItem) => activityItem.label)
        )
      )
    ).slice(0, 10);

    return {
      resolvedFamilies,
      query: activityLabels.map((label) => `"${label}"`).join(' OR '),
      queryLabel: domains
        .filter((domain) => selectedDomains.includes(domain.id))
        .map((domain) => domain.label)
        .join(', '),
      activityLabels,
    };
  };

  const hasEnoughInputToEstimate = searchType === 'activity'
    ? Boolean(activity.trim() && city.trim())
    : Boolean(selectedDomains.length > 0 && city.trim());

  const buildEstimatePayload = () => ({
    search_type: searchType,
    query: searchType === 'activity' ? activity.trim() : undefined,
    selected_domains: searchType === 'domain' ? selectedDomains : [],
    domain_mode: domainMode,
    location: city.trim(),
    radius_km: radiusKm,
    max_results: 50,
    include_facebook: true,
    include_linkedin: true,
    include_websites: true,
  });

  useEffect(() => {
    if (!showNewScanModal || !hasEnoughInputToEstimate) {
      setScanEstimate(null);
      setLoadingEstimate(false);
      return;
    }

    let cancelled = false;

    const loadEstimate = async () => {
      setLoadingEstimate(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          if (!cancelled) setScanEstimate(null);
          return;
        }

        const response = await axios.post(
          `${API_URL}/api/web-scan/estimate`,
          buildEstimatePayload(),
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 20000,
          }
        );

        if (!cancelled) {
          setScanEstimate(response.data);
        }
      } catch (error) {
        console.error('Secondary web scan estimate error:', error);
        if (!cancelled) {
          setScanEstimate(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingEstimate(false);
        }
      }
    };

    const timer = setTimeout(loadEstimate, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    showNewScanModal,
    searchType,
    domainMode,
    activity,
    city,
    radiusKm,
    selectedDomains,
    hasEnoughInputToEstimate,
  ]);

  const getEstimateCoverageRatio = () => {
    if (!scanEstimate || !scanEstimate.activities_available) {
      return 0;
    }
    return scanEstimate.activities_selected / Math.max(scanEstimate.activities_available, scanEstimate.activities_selected);
  };

  const getEstimatePilot = () => {
    if (!scanEstimate) {
      return null;
    }

    const coverageRatio = getEstimateCoverageRatio();
    const willExceedBudget = scanEstimate.serper_budget?.will_exceed_budget ?? false;
    const estimatedCredits = scanEstimate.estimated_serper_credits;

    if (willExceedBudget) {
      return {
        label: 'Budget insuffisant',
        color: '#B91C1C',
        backgroundColor: '#FEE2E2',
        summary: 'Le scan depasse les credits Serper encore disponibles ce mois-ci.',
        action: 'Reduis les sources ou repasse en mode rapide avant de lancer.',
      };
    }

    if (searchType === 'domain' && domainMode === 'quick' && coverageRatio < 0.55) {
      return {
        label: 'Couverture partielle',
        color: '#1D4ED8',
        backgroundColor: '#DBEAFE',
        summary: 'Le mode rapide couvre un echantillon du domaine pour contenir le cout API.',
        action: 'Passe en mode exhaustif si tu veux balayer tout le domaine et que le budget le permet.',
      };
    }

    if (estimatedCredits >= 80) {
      return {
        label: 'Veille couteuse',
        color: '#B45309',
        backgroundColor: '#FEF3C7',
        summary: 'Ce scan va solliciter Serper de facon soutenue.',
        action: 'Reserve ce cadrage aux zones prioritaires ou baisse le nombre de sources.',
      };
    }

    if (searchType === 'domain' && domainMode === 'exhaustive') {
      return {
        label: 'Balayage large',
        color: '#4338CA',
        backgroundColor: '#E0E7FF',
        summary: 'Le domaine sera explore activite par activite, comme un scan de stock plus large.',
        action: 'Ideal pour remplir la prospection, moins pour un test ultra rapide.',
      };
    }

    return {
      label: 'Bon test commercial',
      color: '#047857',
      backgroundColor: '#D1FAE5',
      summary: 'Le cadrage est bien proportionne pour lancer un test web rentable.',
      action: 'Si le resultat est pauvre, elargis le domaine ou active une source web supplementaire.',
    };
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadScans();
  }, []);

  const handleToggleFavorite = async (scanId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/scans/${scanId}/favorite`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setScans(prev => prev.map(s => 
        s.id === scanId ? { ...s, is_favorite: !s.is_favorite } : s
      ));
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    // Use window.confirm on web since Alert.alert callbacks don't work
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Êtes-vous sûr de vouloir supprimer ce scan et tous ses résultats ?')
      : true;
    
    if (!confirmed) return;
    
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(`${API_URL}/api/scans/${scanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setScans(prev => prev.filter(s => s.id !== scanId));
    } catch (error) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Impossible de supprimer le scan');
      }
    }
  };

  const handleStartScan = async () => {
    if (searchType === 'activity' && !activity.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une activité');
      return;
    }
    if (searchType === 'domain' && selectedDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un domaine');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une ville');
      return;
    }

    setScanLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      // ========== VÉRIFICATION DES CRÉDITS AVANT SCAN ==========
      try {
        const creditCheck = await axios.get(
          `${API_URL}/api/api-usage/check-before-scan?scan_type=internet`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (creditCheck.data.blockers && creditCheck.data.blockers.length > 0) {
          // Crédits insuffisants - bloquer le scan
          const blockerMessages = creditCheck.data.blockers.map((b: any) => b.message).join('\n');
          Alert.alert(
            '⚠️ Crédits insuffisants',
            `Impossible de lancer le scan :\n\n${blockerMessages}\n\nVeuillez recharger vos crédits dans Paramètres.`,
            [{ text: 'Compris', style: 'cancel' }]
          );
          setScanLoading(false);
          return;
        }
        
        if (creditCheck.data.warnings && creditCheck.data.warnings.length > 0) {
          // Crédits bas - avertissement mais on peut continuer
          const warningMessages = creditCheck.data.warnings.map((w: any) => w.message).join('\n');
          const shouldContinue = await new Promise<boolean>((resolve) => {
            Alert.alert(
              '⚠️ Crédits bas',
              `Attention :\n\n${warningMessages}\n\nVoulez-vous continuer quand même ?`,
              [
                { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Continuer', onPress: () => resolve(true) }
              ]
            );
          });
          
          if (!shouldContinue) {
            setScanLoading(false);
            return;
          }
        }
      } catch (creditError) {
        console.log('Could not check credits, proceeding anyway:', creditError);
      }
      // ========== FIN VÉRIFICATION CRÉDITS ==========
      
      if (searchType === 'domain') {
        if (loadingActivities) {
          Alert.alert('Erreur', 'Le catalogue des activites est encore en cours de chargement.');
          setScanLoading(false);
          return;
        }

        const domainPayload = buildDomainSearchPayload();

        if (!domainPayload.resolvedFamilies.length || !domainPayload.query) {
          Alert.alert('Erreur', 'Impossible de relier les domaines choisis aux activites du catalogue.');
          setScanLoading(false);
          return;
        }

        const response = await axios.post(
          `${API_URL}/api/scans/web`,
          {
            query: domainPayload.query,
            query_label: `Domaines: ${domainPayload.queryLabel}`,
            location: city.trim(),
            radius_km: radiusKm,
            max_results: 50,
            include_facebook: true,
            include_linkedin: true,
            include_websites: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 300000,
          }
        );

        setShowNewScanModal(false);
        resetForm();
        loadScans();

        if (response.data?.scan_id) {
          Alert.alert(
            'Scan lance',
            `Le scan par domaine a bien ete lance sur ${domainPayload.activityLabels.length} activites representatives.`,
            [
              {
                text: 'Voir les resultats',
                onPress: () => router.push(`/results?scanId=${response.data.scan_id}`),
              },
            ]
          );
        }
        return;
      }

      const response = await axios.post(
        `${API_URL}/api/scans/web`,
        {
          query: activity.trim(),
          location: city.trim(),
          radius_km: radiusKm,
          max_results: 50,
          include_facebook: true,
          include_linkedin: true,
          include_websites: true,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setShowNewScanModal(false);
        resetForm();
        loadScans();
        Alert.alert(
          'Scan terminé',
          response.data.message,
          [
            {
              text: 'Voir les résultats',
              onPress: () => router.push(`/results?scanId=${response.data.scan_id}`),
            },
          ]
        );
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors du scan';
      Alert.alert('Erreur', message);
    } finally {
      setScanLoading(false);
    }
  };

  const handlePremiumStartScan = async () => {
    if (searchType === 'activity' && !activity.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une activite.');
      return;
    }
    if (searchType === 'domain' && selectedDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez selectionner au moins un domaine.');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une ville.');
      return;
    }

    setScanLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Erreur', 'Session expiree. Reconnecte-toi pour lancer un scan.');
        return;
      }

      if (scanEstimate?.serper_budget?.will_exceed_budget) {
        Alert.alert(
          'Credits Serper insuffisants',
          `Il reste ${scanEstimate.serper_budget.credits_remaining} credits Serper, alors que ce scan en demande environ ${scanEstimate.estimated_serper_credits}.`
        );
        return;
      }

      if (scanEstimate?.estimated_serper_credits) {
        const creditCheck = await axios.get(
          `${API_URL}/api/api-usage/check-before-scan`,
          {
            params: {
              scan_type: 'internet',
              estimated_serper_credits: scanEstimate.estimated_serper_credits,
              estimated_google_credits: 0,
            },
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!creditCheck.data?.can_proceed) {
          const blockerMessage = creditCheck.data?.blockers?.[0]?.message || 'Credits insuffisants pour lancer ce scan.';
          Alert.alert('Scan bloque', blockerMessage);
          return;
        }
      }

      const response = await axios.post(
        `${API_URL}/api/scans/web`,
        buildEstimatePayload(),
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000,
        }
      );

      if (response.data.success) {
        setShowNewScanModal(false);
        resetForm();
        loadScans();
        Alert.alert(
          'Scan termine',
          response.data.message,
          [
            {
              text: 'Voir les resultats',
              onPress: () => router.push(`/results?scanId=${response.data.scan_id}`),
            },
          ]
        );
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors du scan';
      Alert.alert('Erreur', message);
    } finally {
      setScanLoading(false);
    }
  };

  const resetForm = () => {
    setActivity('');
    setSelectedDomains([]);
    setCity('');
    setRadiusKm(20);
    setSearchType('activity');
    setDomainMode('quick');
    setScanEstimate(null);
  };

  const prefillScanTemplate = (scan: Scan) => {
    const nextSearchType = scan.search_type === 'domain' ? 'domain' : 'activity';
    const nextCity = extractWebScanLocationInput(scan);
    const nextRadius = scan.radius_km || 20;

    setSearchType(nextSearchType);
    setDomainMode(scan.domain_mode === 'exhaustive' ? 'exhaustive' : 'quick');
    setCity(nextCity);
    setRadiusKm(nextRadius);
    setScanEstimate(null);

    if (nextSearchType === 'domain') {
      setActivity('');
      setSelectedDomains(inferWebScanDomainIds(scan));
    } else {
      setSelectedDomains([]);
      setActivity(stripWebScanPrefix(scan.query_input || scan.query_label));
    }

    setShowNewScanModal(true);
  };

  const filteredScans = activeTab === 'favorites' 
    ? scans.filter(s => s.is_favorite) 
    : scans;

  const renderScanItem = ({ item }: { item: Scan }) => {
    const verdict = buildWebHistoryVerdict(item);
    const status = getScanStatusPresentation(item);
    const progressLabel = buildScanProgressLabel(item);
    return (
    <View style={styles.scanCard}>
      <View style={styles.scanHeader}>
        <View style={styles.scanInfo}>
          <Text style={styles.scanTitle} numberOfLines={1}>{item.query_label}</Text>
          <Text style={styles.scanLocation}>
            📍 {item.location_label} ({item.radius_km}km)
          </Text>
          <Text style={styles.scanDate}>{buildScanTimelineLabel(item)}</Text>
        </View>
        <View style={styles.scanStats}>
          <View style={styles.statBadge}>
            <Text style={styles.statNumber}>{item.result_count || item.total_results}</Text>
            <Text style={styles.statLabel}>résultats</Text>
          </View>
          {item.web_phones_found && item.web_phones_found > 0 && (
            <View style={styles.enrichBadge}>
              <Ionicons name="globe-outline" size={14} color="#FFF" />
              <Text style={styles.enrichBadgeText}>+{item.web_phones_found} tél.</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.scanStatusBadge, { backgroundColor: status.backgroundColor }]}>
        <Text style={[styles.scanStatusText, { color: status.color }]}>{status.label}</Text>
      </View>
      {progressLabel && (
        <Text style={styles.scanProgressText}>{progressLabel}</Text>
      )}

      <View style={[styles.scanVerdictBadge, { backgroundColor: verdict.backgroundColor }]}>
        <Text style={[styles.scanVerdictText, { color: verdict.color }]}>{verdict.label}</Text>
      </View>
      <Text style={styles.scanVerdictSummary}>{verdict.summary}</Text>
      <Text style={styles.scanVerdictCost}>{verdict.cost}</Text>

      <View style={styles.scanActions}>
        <TouchableOpacity
          style={[styles.actionBtn, item.is_favorite && styles.actionBtnFavorite]}
          onPress={() => handleToggleFavorite(item.id)}
        >
          <Ionicons 
            name={item.is_favorite ? 'star' : 'star-outline'} 
            size={18} 
            color={item.is_favorite ? '#FFF' : '#F59E0B'} 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.push(`/results?scanId=${item.id}`)}
        >
          <Ionicons name="eye" size={18} color="#FFF" />
          <Text style={styles.viewBtnText}>Voir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => prefillScanTemplate(item)}
        >
          <Ionicons name="refresh-outline" size={18} color="#1D4ED8" />
          <Text style={styles.retryBtnText}>Relancer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDeleteScan(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/home')} style={styles.backBtn}>
          <Ionicons name="home" size={22} color="#6366F1" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="globe" size={24} color="#6366F1" />
          <Text style={styles.headerText}>SCAN TOUT INTERNET</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/scan-pappers')} style={styles.switchBtn}>
          <Ionicons name="swap-horizontal" size={22} color="#F97316" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Ionicons name="list" size={18} color={activeTab === 'all' ? '#6366F1' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            Tous ({scans.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
        >
          <Ionicons name="star" size={18} color={activeTab === 'favorites' ? '#6366F1' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
            Favoris ({scans.filter(s => s.is_favorite).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scan List */}
      <FlatList
        data={filteredScans}
        renderItem={renderScanItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color="#CCC" />
            <Text style={styles.emptyText}>Aucun scan Internet</Text>
            <Text style={styles.emptySubtext}>Lancez votre premier scan pour commencer</Text>
          </View>
        }
      />

      {/* New Scan FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNewScanModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFF" />
        <Text style={styles.fabText}>Nouveau scan</Text>
      </TouchableOpacity>

      {/* New Scan Modal */}
      <Modal
        visible={showNewScanModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewScanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau Scan Internet</Text>
              <TouchableOpacity onPress={() => setShowNewScanModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Search Type Toggle */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Type de recherche</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, searchType === 'activity' && styles.toggleBtnActive]}
                    onPress={() => setSearchType('activity')}
                  >
                    <Text style={[styles.toggleText, searchType === 'activity' && styles.toggleTextActive]}>
                      Par activité
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, searchType === 'domain' && styles.toggleBtnActive]}
                    onPress={() => setSearchType('domain')}
                  >
                    <Text style={[styles.toggleText, searchType === 'domain' && styles.toggleTextActive]}>
                      Par domaine
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Activity Input */}
              {searchType === 'activity' && (
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Activité</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: plombier, électricien, restaurant..."
                    value={activity}
                    onChangeText={setActivity}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              )}

              {/* Domain Selection */}
              {searchType === 'domain' && (
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Domaines d'activité</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, domainMode === 'quick' && styles.toggleBtnActive]}
                      onPress={() => setDomainMode('quick')}
                    >
                      <Text style={[styles.toggleText, domainMode === 'quick' && styles.toggleTextActive]}>
                        Domaine rapide
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleBtn, domainMode === 'exhaustive' && styles.toggleBtnActive]}
                      onPress={() => setDomainMode('exhaustive')}
                    >
                      <Text style={[styles.toggleText, domainMode === 'exhaustive' && styles.toggleTextActive]}>
                        Domaine exhaustif
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.formHelper}>
                    {domainMode === 'quick'
                      ? 'Mode rapide : un echantillon representatif pour tester sans surconsommer.'
                      : 'Mode exhaustif : chaque activite du domaine est balayee, avec un cout API plus eleve.'}
                  </Text>
                  <View style={styles.domainGrid}>
                    {domains.map((domain) => (
                      <TouchableOpacity
                        key={domain.id}
                        style={[
                          styles.domainChip,
                          selectedDomains.includes(domain.id) && styles.domainChipActive
                        ]}
                        onPress={() => {
                          setSelectedDomains(prev =>
                            prev.includes(domain.id)
                              ? prev.filter(d => d !== domain.id)
                              : [...prev, domain.id]
                          );
                        }}
                      >
                        <Ionicons 
                          name={domain.icon as any} 
                          size={16} 
                          color={selectedDomains.includes(domain.id) ? '#FFF' : '#6366F1'} 
                        />
                        <Text style={[
                          styles.domainChipText,
                          selectedDomains.includes(domain.id) && styles.domainChipTextActive
                        ]}>
                          {domain.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* City Input */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Ville</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Lille, Paris, Lyon..."
                  value={city}
                  onChangeText={setCity}
                  placeholderTextColor="#9CA3AF"
                />
                {citySuggestions.length > 0 && (
                  <View style={styles.suggestions}>
                    {citySuggestions.map((c, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setCity(c.nom);
                          setCitySuggestions([]);
                        }}
                      >
                        <Text style={styles.suggestionName}>{c.nom}</Text>
                        <Text style={styles.suggestionDept}>
                          {c.departement?.nom} ({c.codesPostaux?.[0]})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Radius Selection */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Rayon : {radiusKm} km</Text>
                <View style={styles.radiusRow}>
                  {[10, 20, 30, 50].map((km) => (
                    <TouchableOpacity
                      key={km}
                      style={[styles.radiusBtn, radiusKm === km && styles.radiusBtnActive]}
                      onPress={() => setRadiusKm(km)}
                    >
                      <Text style={[styles.radiusBtnText, radiusKm === km && styles.radiusBtnTextActive]}>
                        {km} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {scanEstimate && getEstimatePilot() && (
                <View style={styles.estimationCard}>
                  <Text style={styles.estimationTitle}>Pilotage du scan</Text>
                  <Text style={styles.estimationText}>
                    {scanEstimate.query_label} • {scanEstimate.search_queries_count} recherche(s) • {scanEstimate.source_queries_per_search} source(s) par recherche
                  </Text>
                  <Text style={styles.estimationHint}>
                    Activites couvertes : {scanEstimate.activities_selected}/{Math.max(scanEstimate.activities_available, scanEstimate.activities_selected)}
                  </Text>
                  <Text style={styles.estimationHint}>
                    Credits Serper estimes : {scanEstimate.estimated_serper_credits} • duree estimee : {scanEstimate.estimated_duration_minutes} min
                  </Text>
                  {scanEstimate.serper_budget && (
                    <Text style={styles.estimationHint}>
                      Credits restants ce mois-ci : {scanEstimate.serper_budget.credits_remaining}/{scanEstimate.serper_budget.monthly_budget} • apres scan : {scanEstimate.serper_budget.remaining_after_scan}
                    </Text>
                  )}
                  <View style={[styles.estimationPilotBadge, { backgroundColor: getEstimatePilot()!.backgroundColor }]}>
                    <Text style={[styles.estimationPilotBadgeText, { color: getEstimatePilot()!.color }]}>
                      {getEstimatePilot()!.label}
                    </Text>
                  </View>
                  <Text style={styles.estimationPilotSummary}>{getEstimatePilot()!.summary}</Text>
                  <Text style={styles.estimationPilotAction}>{getEstimatePilot()!.action}</Text>
                </View>
              )}

              {/* Info Banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={20} color="#6366F1" />
                <Text style={styles.infoText}>
                  Ce scan recherche sur : Google, Pages Jaunes, Facebook, LinkedIn, 
                  annuaires et sites web. Les résultats sont automatiquement enrichis.
                </Text>
              </View>
            </ScrollView>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, scanLoading && styles.submitBtnDisabled]}
              onPress={handlePremiumStartScan}
              disabled={scanLoading}
            >
              {scanLoading ? (
                <Text style={styles.submitBtnText}>Scan en cours...</Text>
              ) : (
                <>
                  <Ionicons name="search" size={20} color="#FFF" />
                  <Text style={styles.submitBtnText}>Lancer le scan</Text>
                </>
              )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  switchBtn: {
    padding: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabActive: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#6366F1',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  scanCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
  scanStatusBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  scanStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scanProgressText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
    marginBottom: 8,
  },
  scanVerdictBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  scanVerdictText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scanVerdictSummary: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
  },
  scanVerdictCost: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '700',
    marginBottom: 10,
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
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
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
  scanActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  actionBtnFavorite: {
    backgroundColor: '#F59E0B',
  },
  viewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    gap: 8,
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    color: '#FFF',
    fontSize: 16,
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
    maxHeight: '90%',
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
  modalBody: {
    padding: 20,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  formHelper: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  toggleText: {
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#FFF',
  },
  domainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  domainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  domainChipActive: {
    backgroundColor: '#6366F1',
  },
  domainChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
  },
  domainChipTextActive: {
    color: '#FFF',
  },
  suggestions: {
    marginTop: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  suggestionDept: {
    fontSize: 12,
    color: '#6B7280',
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  radiusBtnActive: {
    backgroundColor: '#6366F1',
  },
  radiusBtnText: {
    fontWeight: '600',
    color: '#666',
  },
  radiusBtnTextActive: {
    color: '#FFF',
  },
  estimationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 6,
  },
  estimationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  estimationText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    lineHeight: 19,
  },
  estimationHint: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
    marginTop: 6,
  },
  estimationPilotBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 10,
  },
  estimationPilotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  estimationPilotSummary: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 8,
  },
  estimationPilotAction: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
    marginTop: 5,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EEF2FF',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#4F46E5',
    lineHeight: 18,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6366F1',
    margin: 20,
    paddingVertical: 16,
    borderRadius: 12,
  },
  submitBtnDisabled: {
    backgroundColor: '#A5B4FC',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
