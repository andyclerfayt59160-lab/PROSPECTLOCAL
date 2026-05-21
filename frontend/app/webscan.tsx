import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';
import { formatServerDateTime } from '../utils/dates';
import { useScan } from '../context/ScanContext';

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

interface RecentWebScan {
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
  web_phones_found?: number;
  leads_with_phone?: number;
  web_enriched_count?: number;
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
  scan_type?: string;
  completed_at?: string;
  progress?: number;
  progress_message?: string;
  progress_step?: number;
  progress_total_steps?: number;
  last_progress_at?: string;
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

const inferWebScanDomainIds = (scan: RecentWebScan): string[] => {
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

const getScanStatusPresentation = (scan: RecentWebScan): ScanStatusPresentation => {
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

const buildScanTimelineLabel = (scan: RecentWebScan) => {
  if ((scan.status || '').toLowerCase() === 'done' && scan.completed_at) {
    return `Termine le ${formatServerDateTime(scan.completed_at)}`;
  }
  return `Lance le ${formatServerDateTime(scan.created_at)}`;
};

const buildScanProgressLabel = (scan: RecentWebScan) => {
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

const buildWebHistoryVerdict = (scan: RecentWebScan): ScanHistoryVerdict => {
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

export default function WebScanScreen() {
  const router = useRouter();
  const { activeScans } = useScan();
  const [searchType, setSearchType] = useState<'activity' | 'domain'>('activity');
  const [domainMode, setDomainMode] = useState<'quick' | 'exhaustive'>('quick');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState(20);
  const [maxResults, setMaxResults] = useState(50);
  const [includeFacebook, setIncludeFacebook] = useState(true);
  const [includeLinkedin, setIncludeLinkedin] = useState(true);
  const [includeWebsites, setIncludeWebsites] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [scanEstimate, setScanEstimate] = useState<WebScanEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<RecentWebScan[]>([]);
  const [recentScansTotalCount, setRecentScansTotalCount] = useState(0);
  const [loadingRecentScans, setLoadingRecentScans] = useState(true);

  const domains = [
    { id: 'habitat', label: 'Habitat', icon: 'home' },
    { id: 'commerce', label: 'Commerce', icon: 'storefront' },
    { id: 'restauration', label: 'Restauration', icon: 'restaurant' },
    { id: 'auto', label: 'Auto/Moto', icon: 'car' },
    { id: 'beaute', label: 'Beaute/Bien-etre', icon: 'sparkles' },
    { id: 'sante', label: 'Sante', icon: 'medical' },
    { id: 'services', label: 'Services', icon: 'briefcase' },
    { id: 'tech', label: 'Tech/Digital', icon: 'laptop' },
  ];

  useEffect(() => {
    const loadActivities = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;

        const response = await axios.get(`${API_URL}/api/activities`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setActivities(response.data || []);
      } catch (error) {
        console.error('Activities loading error:', error);
        setActivities([]);
      } finally {
        setLoadingActivities(false);
      }
    };

    loadActivities();
    loadRecentScans();
  }, []);

  const activeWebScans = activeScans.filter(
    (scan) =>
      scan.scan_type === 'web_scan' ||
      scan.scan_type === 'internet' ||
      scan.scan_type === 'standard' ||
      !scan.scan_type
  ) as RecentWebScan[];

  useEffect(() => {
    loadRecentScans();
  }, [activeWebScans.length]);

  const loadRecentScans = async () => {
    setLoadingRecentScans(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setRecentScans([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/scans`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const scans = (response.data || []).filter((scan: RecentWebScan) =>
        scan.scan_type === 'web_scan' ||
        scan.scan_type === 'internet' ||
        !scan.scan_type ||
        scan.scan_type === 'standard'
      );

      setRecentScansTotalCount(scans.length);
      setRecentScans(scans.slice(0, 6));
    } catch (error) {
      console.error('Recent web scans loading error:', error);
      setRecentScansTotalCount(0);
      setRecentScans([]);
    } finally {
      setLoadingRecentScans(false);
    }
  };

  const applyRecentScanTemplate = (scan: RecentWebScan) => {
    const nextSearchType = scan.search_type === 'domain' ? 'domain' : 'activity';
    const nextLocation = extractWebScanLocationInput(scan);
    const nextRadius = scan.radius_km || 20;
    const nextMaxResults = scan.max_results_requested || 50;
    const nextIncludeFacebook = scan.include_facebook ?? true;
    const nextIncludeLinkedin = scan.include_linkedin ?? true;
    const nextIncludeWebsites = scan.include_websites ?? true;

    setSearchType(nextSearchType);
    setDomainMode(scan.domain_mode === 'exhaustive' ? 'exhaustive' : 'quick');
    setLocation(nextLocation);
    setRadiusKm(nextRadius);
    setMaxResults(nextMaxResults);
    setIncludeFacebook(nextIncludeFacebook);
    setIncludeLinkedin(nextIncludeLinkedin);
    setIncludeWebsites(nextIncludeWebsites);
    setScanEstimate(null);

    if (nextSearchType === 'domain') {
      setQuery('');
      setSelectedDomains(inferWebScanDomainIds(scan));
    } else {
      setSelectedDomains([]);
      setQuery(stripWebScanPrefix(scan.query_input || scan.query_label));
    }

    Alert.alert(
      'Cadrage recharge',
      'Le dernier parametrage de ce scan a ete recharge dans le formulaire pour une nouvelle tentative.'
    );
  };

  // City autocomplete
  useEffect(() => {
    const searchCities = async () => {
      if (location.length < 2) {
        setCitySuggestions([]);
        return;
      }
      
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(location)}&fields=nom,codesPostaux,departement,population&boost=population&limit=5`
        );
        const data = await response.json();
        setCitySuggestions(data);
      } catch (error) {
        console.error('City search error:', error);
      }
    };
    
    const timer = setTimeout(searchCities, 300);
    return () => clearTimeout(timer);
  }, [location]);

  const resolveSelectedDomainFamilies = () => {
    const familiesByKey = activities.reduce((map, activityItem) => {
      const key = normalizeFamilyKey(activityItem.family);
      if (!map[key]) {
        map[key] = activityItem.family;
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

  const handleStartScan = async () => {
    if (!query.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une activité ou mot-clé');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une ville');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/api/scans/web`,
        {
          query: query.trim(),
          location: location.trim(),
          radius_km: radiusKm,
          max_results: maxResults,
          include_facebook: includeFacebook,
          include_linkedin: includeLinkedin,
          include_websites: includeWebsites,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
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
      console.error('Web scan error:', error);
      const message = error.response?.data?.detail || 'Erreur lors du scan';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDomainScan = async () => {
    if (selectedDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez selectionner au moins un domaine');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une ville');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (loadingActivities) {
        Alert.alert('Erreur', 'Le catalogue des activites est encore en cours de chargement.');
        setLoading(false);
        return;
      }

      const domainPayload = buildDomainSearchPayload();
      if (!domainPayload.resolvedFamilies.length || !domainPayload.query) {
        Alert.alert('Erreur', 'Impossible de relier les domaines choisis aux activites du catalogue.');
        setLoading(false);
        return;
      }

      const response = await axios.post(
        `${API_URL}/api/scans/web`,
        {
          query: domainPayload.query,
          query_label: `Domaines: ${domainPayload.queryLabel}`,
          location: location.trim(),
          radius_km: radiusKm,
          max_results: maxResults,
          include_facebook: includeFacebook,
          include_linkedin: includeLinkedin,
          include_websites: includeWebsites,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        Alert.alert(
          'Scan termine',
          `${response.data.message}\n\nRecherche lancee pour Domaines: ${domainPayload.queryLabel}.`,
          [
            {
              text: 'Voir les resultats',
              onPress: () => router.push(`/results?scanId=${response.data.scan_id}`),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Web domain scan error:', error);
      const message = error.response?.data?.detail || 'Erreur lors du scan';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  };

  const hasEnoughInputToEstimate = searchType === 'activity'
    ? Boolean(query.trim() && location.trim())
    : Boolean(selectedDomains.length > 0 && location.trim());

  const buildEstimatePayload = () => ({
    search_type: searchType,
    query: searchType === 'activity' ? query.trim() : undefined,
    selected_domains: searchType === 'domain' ? selectedDomains : [],
    domain_mode: domainMode,
    location: location.trim(),
    radius_km: radiusKm,
    max_results: maxResults,
    include_facebook: includeFacebook,
    include_linkedin: includeLinkedin,
    include_websites: includeWebsites,
  });

  useEffect(() => {
    if (!hasEnoughInputToEstimate) {
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
          if (!cancelled) {
            setScanEstimate(null);
          }
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
        console.error('Web scan estimate error:', error);
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
    searchType,
    domainMode,
    query,
    location,
    radiusKm,
    maxResults,
    includeFacebook,
    includeLinkedin,
    includeWebsites,
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

  const handlePremiumStartScan = async () => {
    if (searchType === 'activity' && !query.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une activite ou un mot-cle.');
      return;
    }
    if (searchType === 'domain' && selectedDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez selectionner au moins un domaine.');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une ville.');
      return;
    }

    setLoading(true);
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
        const creditCheckResponse = await axios.get(
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

        if (!creditCheckResponse.data?.can_proceed) {
          const blockerMessage = creditCheckResponse.data?.blockers?.[0]?.message || 'Credits insuffisants pour lancer ce scan.';
          Alert.alert('Scan bloque', blockerMessage);
          return;
        }
      }

      const response = await axios.post(
        `${API_URL}/api/scans/web`,
        buildEstimatePayload(),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        loadRecentScans();
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
      console.error('Premium web scan error:', error);
      const message = error.response?.data?.detail || 'Erreur lors du scan';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  };

  const selectCity = (city: any) => {
    setLocation(city.nom);
    setCitySuggestions([]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="globe-outline" size={24} color="#6366F1" />
          <Text style={styles.headerText}>Scan Tout Internet</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#6366F1" />
          <Text style={styles.infoText}>
            Recherche sur tout le web : Facebook, LinkedIn, sites d'entreprises, annuaires...
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="options" size={18} color="#6366F1" />
            <Text style={styles.sectionTitle}>Type de recherche</Text>
          </View>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionPill, searchType === 'activity' && styles.optionPillActive]}
              onPress={() => setSearchType('activity')}
            >
              <Text style={[styles.optionPillText, searchType === 'activity' && styles.optionPillTextActive]}>
                Par activite
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionPill, searchType === 'domain' && styles.optionPillActive]}
              onPress={() => setSearchType('domain')}
            >
              <Text style={[styles.optionPillText, searchType === 'domain' && styles.optionPillTextActive]}>
                Par domaine
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {searchType === 'activity' && (
        <>
        {/* Query Input */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="search" size={18} color="#6366F1" />
            <Text style={styles.sectionTitle}>Activité / Mot-clé</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Ex: plombier, restaurant, électricien..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        </>
        )}

        {searchType === 'domain' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="layers" size={18} color="#6366F1" />
              <Text style={styles.sectionTitle}>Domaines d'activite</Text>
            </View>
            <Text style={styles.infoText}>
              Le scan utilise une selection representative d'activites du domaine pour rester exploitable en cout API.
            </Text>
            <View style={[styles.optionRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.optionPill, domainMode === 'quick' && styles.optionPillActive]}
                onPress={() => setDomainMode('quick')}
              >
                <Text style={[styles.optionPillText, domainMode === 'quick' && styles.optionPillTextActive]}>
                  Domaine rapide
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionPill, domainMode === 'exhaustive' && styles.optionPillActive]}
                onPress={() => setDomainMode('exhaustive')}
              >
                <Text style={[styles.optionPillText, domainMode === 'exhaustive' && styles.optionPillTextActive]}>
                  Domaine exhaustif
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.warningText, { marginTop: 12 }]}>
              {domainMode === 'quick'
                ? 'Mode rapide : un echantillon representatif pour tester sans surconsommer.'
                : 'Mode exhaustif : chaque activite du domaine est balayee, avec un cout API plus eleve.'}
            </Text>
            <View style={[styles.optionRow, { marginTop: 12 }]}>
              {domains.map((domain) => (
                <TouchableOpacity
                  key={domain.id}
                  style={[styles.optionPill, selectedDomains.includes(domain.id) && styles.optionPillActive]}
                  onPress={() =>
                    setSelectedDomains((current) =>
                      current.includes(domain.id)
                        ? current.filter((value) => value !== domain.id)
                        : [...current, domain.id]
                    )
                  }
                >
                  <Text style={[styles.optionPillText, selectedDomains.includes(domain.id) && styles.optionPillTextActive]}>
                    {domain.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loadingActivities && (
              <Text style={[styles.warningText, { marginTop: 12 }]}>
                Chargement du catalogue d'activites...
              </Text>
            )}
          </View>
        )}

        {/* Location Input */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={18} color="#EF4444" />
            <Text style={styles.sectionTitle}>Ville</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Ex: Lille, Paris, Lyon..."
            value={location}
            onChangeText={setLocation}
            placeholderTextColor="#9CA3AF"
          />
          
          {/* City Suggestions */}
          {citySuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {citySuggestions.map((city, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestionItem}
                  onPress={() => selectCity(city)}
                >
                  <Text style={styles.suggestionName}>{city.nom}</Text>
                  <Text style={styles.suggestionDept}>
                    {city.departement?.nom || ''} ({city.codesPostaux?.[0] || ''})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Radius Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="locate" size={18} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Rayon : {radiusKm} km</Text>
          </View>
          <View style={styles.optionRow}>
            {[10, 20, 30, 50].map((km) => (
              <TouchableOpacity
                key={km}
                style={[styles.optionPill, radiusKm === km && styles.optionPillActive]}
                onPress={() => setRadiusKm(km)}
              >
                <Text style={[styles.optionPillText, radiusKm === km && styles.optionPillTextActive]}>
                  {km} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Max Results */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="layers" size={18} color="#10B981" />
            <Text style={styles.sectionTitle}>Nombre max de résultats</Text>
          </View>
          <View style={styles.optionRow}>
            {[25, 50, 100].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.optionPill, maxResults === num && styles.optionPillActive]}
                onPress={() => setMaxResults(num)}
              >
                <Text style={[styles.optionPillText, maxResults === num && styles.optionPillTextActive]}>
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sources Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="apps" size={18} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Sources à scanner</Text>
          </View>
          
          <TouchableOpacity
            style={styles.sourceOption}
            onPress={() => setIncludeFacebook(!includeFacebook)}
          >
            <View style={styles.sourceInfo}>
              <Ionicons name="logo-facebook" size={24} color="#1877F2" />
              <Text style={styles.sourceLabel}>Pages Facebook</Text>
            </View>
            <Ionicons
              name={includeFacebook ? 'checkbox' : 'square-outline'}
              size={24}
              color={includeFacebook ? '#6366F1' : '#9CA3AF'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sourceOption}
            onPress={() => setIncludeLinkedin(!includeLinkedin)}
          >
            <View style={styles.sourceInfo}>
              <Ionicons name="logo-linkedin" size={24} color="#0A66C2" />
              <Text style={styles.sourceLabel}>Pages LinkedIn</Text>
            </View>
            <Ionicons
              name={includeLinkedin ? 'checkbox' : 'square-outline'}
              size={24}
              color={includeLinkedin ? '#6366F1' : '#9CA3AF'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sourceOption}
            onPress={() => setIncludeWebsites(!includeWebsites)}
          >
            <View style={styles.sourceInfo}>
              <Ionicons name="globe-outline" size={24} color="#059669" />
              <Text style={styles.sourceLabel}>Sites web & annuaires</Text>
            </View>
            <Ionicons
              name={includeWebsites ? 'checkbox' : 'square-outline'}
              size={24}
              color={includeWebsites ? '#6366F1' : '#9CA3AF'}
            />
          </TouchableOpacity>
        </View>

        {scanEstimate && getEstimatePilot() && (
          <View style={styles.estimationCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics" size={18} color="#6366F1" />
              <Text style={styles.sectionTitle}>Pilotage du scan</Text>
            </View>
            <Text style={styles.estimationText}>
              {scanEstimate.query_label} • {scanEstimate.search_queries_count} recherche(s) • {scanEstimate.source_queries_per_search} source(s) par recherche
            </Text>
            <Text style={styles.estimationHint}>
              Activités couvertes : {scanEstimate.activities_selected}/{Math.max(scanEstimate.activities_available, scanEstimate.activities_selected)}
            </Text>
            <Text style={styles.estimationHint}>
              Crédits Serper estimés : {scanEstimate.estimated_serper_credits} • durée estimée : {scanEstimate.estimated_duration_minutes} min
            </Text>
            {scanEstimate.serper_budget && (
              <Text style={styles.estimationHint}>
                Crédits restants ce mois-ci : {scanEstimate.serper_budget.credits_remaining}/{scanEstimate.serper_budget.monthly_budget} • après scan : {scanEstimate.serper_budget.remaining_after_scan}
              </Text>
            )}
            <View
              style={[
                styles.estimationPilotBadge,
                { backgroundColor: getEstimatePilot()!.backgroundColor },
              ]}
            >
              <Text
                style={[
                  styles.estimationPilotBadgeText,
                  { color: getEstimatePilot()!.color },
                ]}
              >
                {getEstimatePilot()!.label}
              </Text>
            </View>
            <Text style={styles.estimationPilotSummary}>{getEstimatePilot()!.summary}</Text>
            <Text style={styles.estimationPilotAction}>{getEstimatePilot()!.action}</Text>
          </View>
        )}

        {!scanEstimate && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={18} color="#F59E0B" />
            <Text style={styles.warningText}>
              {loadingEstimate
                ? 'Calcul de l estimation en cours...'
                : `Ce scan utilise l API Serper. Consommation indicative : ~${Math.ceil(maxResults / 20) * 3} credits.`}
            </Text>
          </View>
        )}

        {/* Start Button */}
        <TouchableOpacity
          style={[styles.startButton, loading && styles.startButtonDisabled]}
          onPress={handlePremiumStartScan}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="search" size={22} color="#FFF" />
              <Text style={styles.startButtonText}>Lancer le scan Internet</Text>
            </>
          )}
        </TouchableOpacity>

        {activeWebScans.length > 0 && (
          <View style={styles.activeScanCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pulse-outline" size={18} color="#2563EB" />
              <Text style={styles.sectionTitle}>Scan en cours</Text>
            </View>
            <Text style={styles.activeScanTitle}>{activeWebScans[0]?.query_label}</Text>
            <Text style={styles.activeScanMeta}>{buildScanTimelineLabel(activeWebScans[0])}</Text>
            <View style={styles.activeScanProgressRow}>
              <View style={styles.activeScanProgressBar}>
                <View
                  style={[
                    styles.activeScanProgressFill,
                    { width: `${Math.max(8, Math.min(activeWebScans[0]?.progress || 0, 100))}%` },
                  ]}
                />
              </View>
              <Text style={styles.activeScanProgressValue}>
                {typeof activeWebScans[0]?.progress === 'number' ? `${activeWebScans[0].progress}%` : '...'}
              </Text>
            </View>
            <Text style={styles.activeScanProgressText}>
              {buildScanProgressLabel(activeWebScans[0]) || 'Scan en cours...'}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={18} color="#6366F1" />
            <Text style={styles.sectionTitle}>
              Derniers scans Internet
              {recentScansTotalCount > 0 ? ` (${Math.min(recentScans.length, recentScansTotalCount)}/${recentScansTotalCount})` : ''}
            </Text>
          </View>
          <Text style={styles.sectionHelper}>
            Retrouve directement un scan recent depuis l ecran principal, avec son statut et son horodatage local.
          </Text>
          <TouchableOpacity
            style={styles.historyLink}
            onPress={() => router.push('/scan-internet')}
            activeOpacity={0.75}
          >
            <Ionicons name="albums-outline" size={16} color="#4F46E5" />
            <Text style={styles.historyLinkText}>Ouvrir l historique complet</Text>
          </TouchableOpacity>
          {loadingRecentScans ? (
            <View style={styles.recentScansLoading}>
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : recentScans.length === 0 ? (
            <View style={styles.recentScansEmpty}>
              <Text style={styles.recentScansEmptyText}>Aucun scan Internet recent pour le moment.</Text>
            </View>
          ) : (
            <View style={styles.recentScansList}>
              {recentScans.map((scan) => {
                const verdict = buildWebHistoryVerdict(scan);
                const status = getScanStatusPresentation(scan);
                const progressLabel = buildScanProgressLabel(scan);
                return (
                <View key={scan.id} style={styles.recentScanCard}>
                  <View style={styles.recentScanInfo}>
                    <Text style={styles.recentScanTitle} numberOfLines={1}>{scan.query_label}</Text>
                    <Text style={styles.recentScanMeta}>{scan.location_label}</Text>
                    <Text style={styles.recentScanMeta}>{buildScanTimelineLabel(scan)}</Text>
                    <Text style={styles.recentScanMeta}>
                      {(scan.result_count ?? scan.total_results ?? 0)} resultats
                      {scan.web_phones_found ? ` • +${scan.web_phones_found} telephones web` : ''}
                    </Text>
                    <View style={[styles.recentScanStatusBadge, { backgroundColor: status.backgroundColor }]}>
                      <Text style={[styles.recentScanStatusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                    {progressLabel && (
                      <Text style={styles.recentScanMetaStrong}>{progressLabel}</Text>
                    )}
                    <View style={[styles.recentScanVerdictBadge, { backgroundColor: verdict.backgroundColor }]}>
                      <Text style={[styles.recentScanVerdictText, { color: verdict.color }]}>{verdict.label}</Text>
                    </View>
                    <Text style={styles.recentScanMeta}>{verdict.summary}</Text>
                    <Text style={styles.recentScanMetaStrong}>{verdict.cost}</Text>
                  </View>
                  <View style={styles.recentScanActions}>
                    <TouchableOpacity
                      style={styles.recentScanRetryBtn}
                      onPress={() => applyRecentScanTemplate(scan)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#1D4ED8" />
                      <Text style={styles.recentScanRetryText}>Relancer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.recentScanOpenBtn}
                      onPress={() => router.push(`/results?scanId=${scan.id}`)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="open-outline" size={16} color="#4F46E5" />
                      <Text style={styles.recentScanOpenText}>Voir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  backButton: {
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
  content: {
    flex: 1,
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EEF2FF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#4F46E5',
    lineHeight: 18,
  },
  sectionHelper: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 12,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
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
  suggestions: {
    marginTop: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
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
    marginTop: 2,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionPillActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  optionPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  optionPillTextActive: {
    color: '#FFF',
  },
  sourceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceLabel: {
    fontSize: 15,
    color: '#1F2937',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  activeScanCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeScanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  activeScanMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  activeScanProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  activeScanProgressBar: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    overflow: 'hidden',
  },
  activeScanProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
  activeScanProgressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  activeScanProgressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#1E3A8A',
  },
  estimationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  estimationText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    lineHeight: 20,
  },
  estimationHint: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 8,
  },
  estimationPilotBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 12,
  },
  estimationPilotBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  estimationPilotSummary: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    marginTop: 10,
    fontWeight: '600',
  },
  estimationPilotAction: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 6,
  },
  historyLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    marginBottom: 12,
  },
  historyLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  recentScansLoading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  recentScansEmpty: {
    paddingVertical: 12,
  },
  recentScansEmptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  recentScansList: {
    gap: 10,
  },
  recentScanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentScanInfo: {
    flex: 1,
  },
  recentScanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  recentScanMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#6B7280',
  },
  recentScanStatusBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  recentScanStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  recentScanMetaStrong: {
    marginTop: 3,
    fontSize: 12,
    color: '#111827',
    fontWeight: '700',
  },
  recentScanVerdictBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  recentScanVerdictText: {
    fontSize: 11,
    fontWeight: '700',
  },
  recentScanActions: {
    gap: 8,
  },
  recentScanRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  recentScanRetryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  recentScanOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  recentScanOpenText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 30,
  },
  startButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
