import React, { useState, useEffect, useMemo } from 'react';
import { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { useToast } from '../components/Toast';
import { useScan } from '../context/ScanContext';

import { API_URL } from '../utils/api';
import { formatServerDateTime } from '../utils/dates';

// Domaines d'activités
const DOMAINS = [
  { id: 'HABITAT', label: 'Habitat', description: 'Plombier, electricien, macon, platrerie, couverture...', color: '#FF9500', count: 32 },
  { id: 'COMMERCE', label: 'Commerce', description: 'Boulangerie, pharmacie, fleuriste...', color: '#34C759', count: 22 },
  { id: 'RESTAURATION', label: 'Restauration', description: 'Restaurant, traiteur, cafe...', color: '#FF3B30', count: 7 },
  { id: 'BEAUTE', label: 'Beaute', description: 'Coiffeur, estheticienne, spa...', color: '#AF52DE', count: 4 },
  { id: 'AUTO', label: 'Auto', description: 'Garage, carrosserie, auto-ecole...', color: '#007AFF', count: 10 },
  { id: 'SANTE', label: 'Sante', description: 'Medecin, dentiste, kine...', color: '#5AC8FA', count: 13 },
  { id: 'B2B', label: 'Services Pro', description: 'Avocat, comptable, nettoyage...', color: '#8E8E93', count: 19 },
  { id: 'AUTRE', label: 'Autres', description: 'Pressing, photographe, sport...', color: '#FFCC00', count: 16 },
  { id: 'ALL', label: 'Tous les domaines', description: 'Scan massif de toutes les activités', color: '#6366F1', count: 123 },
];

const DOMAIN_PRESENTATION: Record<string, { label?: string; description?: string; count?: number }> = {
  HABITAT: {
    description: 'Plomberie, electricite, chauffage, peinture, couverture, menuiserie...',
    count: 32,
  },
  COMMERCE: {
    description: 'Commerce de proximite : alimentation, pharmacie, fleuriste, optique...',
    count: 22,
  },
  RESTAURATION: {
    count: 7,
  },
  BEAUTE: {
    count: 4,
  },
  AUTO: {
    description: 'Garage, carrosserie, controle technique, auto-ecole...',
    count: 10,
  },
  SANTE: {
    count: 13,
  },
  B2B: {
    description: 'Avocat, comptable, architecture, nettoyage...',
    count: 19,
  },
  AUTRE: {
    count: 16,
  },
  ALL: {
    description: 'Tous les domaines utiles a So Local',
    count: 123,
  },
};

interface NafPreviewItem {
  code: string;
  label: string;
}

interface City {
  name: string;
  nom?: string;
  code: string;
  codesPostaux?: string[];
  postal_codes?: string[];
  department?: string;
  department_code?: string;
}

interface ScanHistoryItem {
  id: string;
  query_label?: string;
  location_label?: string;
  selected_cities?: City[];
  domains?: string[];
  radius_km?: number;
  max_age_days?: number;
  scan_type?: string;
  search_mode?: 'radius' | 'multi' | 'department';
  activity_id?: string;
  created_at?: string;
  completed_at?: string;
  result_count?: number;
  total_results?: number;
  web_enriched_count?: number;
  web_phones_found?: number;
  status?: string;
  progress?: number;
  progress_message?: string;
  progress_step?: number;
  progress_total_steps?: number;
  naf_codes_scanned?: number;
  naf_codes_searched?: number;
  naf_codes_available?: number;
  postal_codes_scanned?: number;
  postal_codes_searched?: number;
  postal_codes_available?: number;
  geo_unit_label?: string;
  geo_units_scanned?: number;
  geo_units_available?: number;
  new_results_count?: number;
  reused_results_count?: number;
  scan_diagnostics?: {
    requests_attempted?: number;
    raw_companies_received?: number;
    skipped_too_old_count?: number;
    skipped_missing_date_count?: number;
    skipped_invalid_date_count?: number;
    skipped_future_date_count?: number;
    skipped_batch_duplicate_count?: number;
    pappers_credits_used?: number;
  };
}

interface PappersScanEstimate {
  estimated_requests: number;
  estimated_pappers_credits: number;
  estimated_duration_minutes: number;
  naf_codes_available: number;
  naf_codes_scanned: number;
  selected_naf_labels?: NafPreviewItem[];
  postal_codes_available: number;
  postal_codes_scanned: number;
  geo_unit_label?: string;
  geo_units_available?: number;
  geo_units_scanned?: number;
  location_label?: string;
  pappers_budget?: {
    monthly_budget: number;
    credits_used: number;
    credits_remaining: number;
    estimated_need: number;
    remaining_after_scan: number;
    will_exceed_budget: boolean;
  };
}

type ScanStatusPresentation = {
  label: string;
  color: string;
  backgroundColor: string;
};

const formatCreditValue = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
};

const getDomainCardMeta = (domain: { id: string; label: string; description: string; count: number }) => {
  const presentation = DOMAIN_PRESENTATION[domain.id];
  return {
    label: presentation?.label ?? domain.label,
    description: presentation?.description ?? domain.description,
    count: presentation?.count ?? domain.count,
  };
};

const getScanGeoUnitLabel = (scan: ScanHistoryItem) => scan.geo_unit_label || 'codes postaux';

const getScanGeoUnitCounts = (scan: ScanHistoryItem) => {
  const scanned = scan.geo_units_scanned ?? scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
  const available = scan.geo_units_available ?? scan.postal_codes_available ?? scan.postal_codes_searched ?? scanned;
  return {
    scanned,
    available: Math.max(available, scanned),
  };
};

const _legacyGetHistoryCoverageLabel = (scan: ScanHistoryItem): string => {
  const scannedNaf = scan.naf_codes_scanned ?? scan.naf_codes_searched ?? 0;
  const availableNaf = scan.naf_codes_available ?? scannedNaf;
  const scannedPostal = scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
  const availablePostal = scan.postal_codes_available ?? scannedPostal;

  if (!scannedNaf && !scannedPostal) {
    return '';
  }

  return `${scannedNaf}/${Math.max(availableNaf, scannedNaf)} NAF • ${scannedPostal}/${Math.max(availablePostal, scannedPostal)} codes postaux`;
};

const getHistoryCoverageLabel = (scan: ScanHistoryItem): string => {
  const scannedNaf = scan.naf_codes_scanned ?? scan.naf_codes_searched ?? 0;
  const availableNaf = scan.naf_codes_available ?? scannedNaf;
  const geoUnitLabel = getScanGeoUnitLabel(scan);
  const geoCounts = getScanGeoUnitCounts(scan);

  if (!scannedNaf && !geoCounts.scanned) {
    return '';
  }

  return `${scannedNaf}/${Math.max(availableNaf, scannedNaf)} NAF - ${geoCounts.scanned}/${geoCounts.available} ${geoUnitLabel}`;
};

const getScanStatusPresentation = (scan: ScanHistoryItem): ScanStatusPresentation => {
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

const buildScanProgressLabel = (scan: ScanHistoryItem) => {
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

const getHistoryDiagnosticLabel = (scan: ScanHistoryItem): string => {
  const rawCompanies = scan.scan_diagnostics?.raw_companies_received ?? 0;
  const tooOld = scan.scan_diagnostics?.skipped_too_old_count ?? 0;
  const requests = scan.scan_diagnostics?.requests_attempted ?? 0;

  if (!rawCompanies) {
    return '';
  }

  if (tooOld > 0) {
    return `${rawCompanies} sociétés brutes • ${tooOld} trop anciennes • ${requests} requêtes`;
  }

  return `${rawCompanies} sociétés brutes • ${requests} requêtes`;
};

const getHistoryResultCount = (scan: ScanHistoryItem): number => (
  scan.result_count ?? scan.total_results ?? 0
);

const getHistoryRequestCount = (scan: ScanHistoryItem): number => (
  scan.scan_diagnostics?.requests_attempted ?? 0
);

const getHistoryRawCompanyCount = (scan: ScanHistoryItem): number => (
  scan.scan_diagnostics?.raw_companies_received ?? 0
);

const getHistoryTooOldCount = (scan: ScanHistoryItem): number => (
  scan.scan_diagnostics?.skipped_too_old_count ?? 0
);

const getHistoryEstimatedYieldPercent = (scan: ScanHistoryItem): number => {
  const requests = getHistoryRequestCount(scan);
  const results = getHistoryResultCount(scan);
  if (!requests || !results) {
    return 0;
  }
  return Math.round((results / requests) * 1000) / 10;
};

const _legacyGetHistoryCostLabel = (scan: ScanHistoryItem): string => {
  const requests = getHistoryRequestCount(scan);
  if (!requests) {
    return 'CoÃ»t API non mesure';
  }
  return `${requests} credits Pappers consommes`;
};

const _legacyGetHistoryOutcomeSummary = (scan: ScanHistoryItem): string => {
  const requests = getHistoryRequestCount(scan);
  const rawCompanies = getHistoryRawCompanyCount(scan);
  const results = getHistoryResultCount(scan);
  const tooOld = getHistoryTooOldCount(scan);
  const scannedPostal = scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
  const availablePostal = scan.postal_codes_available ?? scan.postal_codes_searched ?? scannedPostal;

  if (!requests) {
    return 'Scan incomplet ou interrompu avant la collecte.';
  }

  if (results > 0) {
    return `${results} resultat(s) final(aux) pour ${requests} appels, soit ~${getHistoryEstimatedYieldPercent(scan)}% de rendement brut.`;
  }

  if (rawCompanies > 0 && tooOld >= Math.max(1, Math.floor(rawCompanies * 0.8))) {
    return 'Marche trouve, mais fenetre trop courte : la quasi-totalite des societes remontees etaient trop anciennes.';
  }

  if (availablePostal >= 20 && scannedPostal <= 5) {
    return 'Couverture locale trop etroite sur ce scan : trop peu de codes postaux ont ete explores.';
  }

  if (rawCompanies === 0) {
    return 'Aucune societe brute remontee sur cette combinaison zone + activites + periode.';
  }

  return 'Scan peu rentable : de la matiere a ete vue, mais rien d exploitable n a survecu au filtrage.';
};

const _legacyGetHistoryOutcomeTone = (scan: ScanHistoryItem): { label: string; color: string; backgroundColor: string } => {
  const requests = getHistoryRequestCount(scan);
  const results = getHistoryResultCount(scan);
  const rawCompanies = getHistoryRawCompanyCount(scan);
  const tooOld = getHistoryTooOldCount(scan);
  const scannedPostal = scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
  const availablePostal = scan.postal_codes_available ?? scan.postal_codes_searched ?? scannedPostal;

  if (!requests) {
    return {
      label: 'Incomplet',
      color: '#92400E',
      backgroundColor: '#FEF3C7',
    };
  }

  if (results > 0) {
    return {
      label: 'Rentable',
      color: '#166534',
      backgroundColor: '#DCFCE7',
    };
  }

  if (rawCompanies > 0 && tooOld >= Math.max(1, Math.floor(rawCompanies * 0.8))) {
    return {
      label: 'Fenetre trop courte',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
    };
  }

  if (availablePostal >= 20 && scannedPostal <= 5) {
    return {
      label: 'Couverture trop faible',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
    };
  }

  return {
    label: 'Peu rentable',
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
  };
};

const getHistoryCostLabel = (scan: ScanHistoryItem): string => {
  const pappersCreditsUsed = scan.scan_diagnostics?.pappers_credits_used ?? 0;
  if (pappersCreditsUsed > 0) {
    return `${formatCreditValue(pappersCreditsUsed)} credits Pappers consommes`;
  }

  const requests = getHistoryRequestCount(scan);
  if (!requests) {
    return 'Cout API non mesure';
  }
  return `${requests} appels Pappers consommes`;
};

const getHistoryOutcomeSummary = (scan: ScanHistoryItem): string => {
  const requests = getHistoryRequestCount(scan);
  const rawCompanies = getHistoryRawCompanyCount(scan);
  const results = getHistoryResultCount(scan);
  const tooOld = getHistoryTooOldCount(scan);
  const geoCounts = getScanGeoUnitCounts(scan);
  const geoUnitLabel = getScanGeoUnitLabel(scan);

  if (!requests) {
    return 'Scan incomplet ou interrompu avant la collecte.';
  }

  if (results > 0) {
    return `${results} resultat(s) final(aux) pour ${requests} appels, soit ~${getHistoryEstimatedYieldPercent(scan)}% de rendement brut.`;
  }

  if (rawCompanies > 0 && tooOld >= Math.max(1, Math.floor(rawCompanies * 0.8))) {
    return 'Marche trouve, mais fenetre trop courte : la quasi-totalite des societes remontees etaient trop anciennes.';
  }

  if (geoCounts.available >= 6 && geoCounts.scanned < geoCounts.available) {
    return `Couverture incomplete sur ce scan : seulement ${geoCounts.scanned}/${geoCounts.available} ${geoUnitLabel} ont ete explores.`;
  }

  if (rawCompanies === 0) {
    return 'Aucune societe brute remontee sur cette combinaison zone + activites + periode.';
  }

  return 'Scan peu rentable : de la matiere a ete vue, mais rien d exploitable n a survecu au filtrage.';
};

const getHistoryOutcomeTone = (scan: ScanHistoryItem): { label: string; color: string; backgroundColor: string } => {
  const requests = getHistoryRequestCount(scan);
  const results = getHistoryResultCount(scan);
  const rawCompanies = getHistoryRawCompanyCount(scan);
  const tooOld = getHistoryTooOldCount(scan);
  const geoCounts = getScanGeoUnitCounts(scan);

  if (!requests) {
    return {
      label: 'Incomplet',
      color: '#92400E',
      backgroundColor: '#FEF3C7',
    };
  }

  if (results > 0) {
    return {
      label: 'Rentable',
      color: '#166534',
      backgroundColor: '#DCFCE7',
    };
  }

  if (rawCompanies > 0 && tooOld >= Math.max(1, Math.floor(rawCompanies * 0.8))) {
    return {
      label: 'Fenetre trop courte',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
    };
  }

  if (geoCounts.available >= 6 && geoCounts.scanned < geoCounts.available) {
    return {
      label: 'Couverture incomplete',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
    };
  }

  return {
    label: 'Peu rentable',
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
  };
};

export default function PappersScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showToast } = useToast();
  const { activeScans } = useScan();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<City[]>([]);
  const [selectedCities, setSelectedCities] = useState<City[]>([]);
  const [searchMode, setSearchMode] = useState<'radius' | 'multi' | 'department'>('radius');
  const [radius, setRadius] = useState(20);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [estimatedCalls, setEstimatedCalls] = useState(0);
  const [scanEstimate, setScanEstimate] = useState<PappersScanEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, activity: '' });
  const [recentScans, setRecentScans] = useState<ScanHistoryItem[]>([]);
  const [recentScansTotalCount, setRecentScansTotalCount] = useState(0);
  const [loadingRecentScans, setLoadingRecentScans] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historySectionY, setHistorySectionY] = useState(0);
  
  // Filtre par date de création
  const [creationDateFilter, setCreationDateFilter] = useState<string>('12_months'); // Par défaut: 12 mois
  
  // Options de filtre de date
  const DATE_FILTERS = [
    { id: '7_days', label: '7 jours', days: 7, color: '#FF3B30' },
    { id: '30_days', label: '30 jours', days: 30, color: '#FF9500' },
    { id: '6_months', label: '6 mois', days: 180, color: '#FFCC00' },
    { id: '12_months', label: '12 mois', days: 365, color: '#34C759' },
    { id: '24_months', label: '24 mois', days: 730, color: '#007AFF' },
  ];

  const getCityDisplayName = (city: City) => city.name || city.nom || city.code;
  const getCityPostalCodes = (city: City) => city.codesPostaux || city.postal_codes || [];
  const getCityDepartmentCode = (city: City) => city.department_code || '';
  const getCityChipLabel = (city: City) => (
    searchMode === 'department' && getCityDepartmentCode(city)
      ? `${getCityDisplayName(city)} (${getCityDepartmentCode(city)})`
      : getCityDisplayName(city)
  );

  const activePappersScans = activeScans.filter(
    (scan) =>
      scan.scan_type === 'pappers_mass' ||
      scan.scan_type === 'pappers' ||
      scan.scan_type === 'pappers_plus'
  ) as ScanHistoryItem[];
  const getSelectedLocationSummary = () => {
    if (selectedCities.length === 0) {
      return '';
    }

    if (searchMode === 'radius') {
      return `${radius}km autour de ${getCityDisplayName(selectedCities[0])}`;
    }

    if (searchMode === 'department') {
      return selectedCities.map(getCityChipLabel).join(', ');
    }

    return `${selectedCities.length} ville(s) : ${selectedCities.map(getCityDisplayName).join(', ')}`;
  };
  const getEstimatedGeoUnitLabel = () => (
    scanEstimate?.geo_unit_label || (searchMode === 'department' ? 'departements' : 'codes postaux')
  );
  const hasPendingTypedCity = citySearch.trim().length >= 2 && citySuggestions.length > 0;
  const selectedDateFilter = DATE_FILTERS.find(f => f.id === creationDateFilter) || DATE_FILTERS[3];

  const applyHistoryTemplate = (scan: ScanHistoryItem) => {
    const historyCities = Array.isArray(scan.selected_cities) && scan.selected_cities.length > 0
      ? scan.selected_cities.map((city, index) => ({
          name: city.name || city.nom || city.code || `Ville ${index + 1}`,
          code: city.code || `${city.name || city.nom || 'city'}-${index}`,
          postal_codes: city.postal_codes || city.codesPostaux || [],
          codesPostaux: city.codesPostaux || city.postal_codes || [],
          department: city.department || '',
          department_code: city.department_code || '',
        }))
      : [{
          name: (scan.location_label || '').split('+')[0].trim() || 'Ville',
          code: 'history-city',
          postal_codes: [],
          codesPostaux: [],
        }];

    const days = scan.max_age_days || 365;
    let nextDateFilter = '24_months';
    if (days <= 7) nextDateFilter = '7_days';
    else if (days <= 30) nextDateFilter = '30_days';
    else if (days <= 180) nextDateFilter = '6_months';
    else if (days <= 365) nextDateFilter = '12_months';

    setSelectedDomains(Array.isArray(scan.domains) ? scan.domains : []);
    setSearchMode(
      scan.search_mode === 'multi'
        ? 'multi'
        : scan.search_mode === 'department'
          ? 'department'
          : 'radius'
    );
    setRadius(scan.search_mode === 'radius' ? (scan.radius_km || 20) : 20);
    setCreationDateFilter(nextDateFilter);
    setSelectedCities(historyCities);
    setCitySearch(historyCities[0]?.name || '');
    setCitySuggestions([]);
    setHistoryExpanded(false);
    setScanEstimate(null);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    showToast('Le cadrage de ce scan a ete recharge dans le formulaire.', 'success');
  };

  // Search cities
  useEffect(() => {
    const searchCities = async () => {
      if (citySearch.length < 2) {
        setCitySuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/api/cities/search?q=${citySearch}`);
        setCitySuggestions(response.data || []);
      } catch (error) {
        console.error('City search error:', error);
      } finally {
        setLoading(false);
      }
    };
    const debounce = setTimeout(searchCities, 300);
    return () => clearTimeout(debounce);
  }, [citySearch]);

  useEffect(() => {
    loadRecentScans();
  }, []);

  useEffect(() => {
    loadRecentScans();
  }, [activePappersScans.length]);

  useEffect(() => {
    if (!params.editScanId) {
      return;
    }

    if (params.editDomains) {
      try {
        const parsedDomains = JSON.parse(params.editDomains as string);
        if (Array.isArray(parsedDomains)) {
          setSelectedDomains(parsedDomains);
        }
      } catch (error) {
        console.error('Failed to parse editDomains:', error);
      }
    }

    if (params.editRadius) {
      const parsedRadius = parseInt(params.editRadius as string, 10);
      if (!Number.isNaN(parsedRadius)) {
        setRadius(parsedRadius);
      }
    }

    if (params.editSearchMode === 'multi' || params.editSearchMode === 'radius' || params.editSearchMode === 'department') {
      setSearchMode(params.editSearchMode);
    }

    if (params.editMaxAge) {
      const days = parseInt(params.editMaxAge as string, 10);
      if (days <= 7) setCreationDateFilter('7_days');
      else if (days <= 30) setCreationDateFilter('30_days');
      else if (days <= 180) setCreationDateFilter('6_months');
      else if (days <= 365) setCreationDateFilter('12_months');
      else setCreationDateFilter('24_months');
    }

    if (params.editLocation) {
      const cleanLocation = String(params.editLocation).split('+')[0].trim();
      if (cleanLocation) {
        const editedCity: City = {
          name: cleanLocation,
          code: '',
          postal_codes: [],
          department: '',
          department_code: '',
        };
        setSelectedCities([editedCity]);
        setCitySearch(cleanLocation);
      }
    }
  }, [params.editDomains, params.editLocation, params.editMaxAge, params.editRadius, params.editScanId, params.editSearchMode]);

  useEffect(() => {
    const canEstimate = selectedDomains.length > 0 && selectedCities.length > 0;

    if (!canEstimate) {
      setScanEstimate(null);
      setEstimatedCalls(0);
      setLoadingEstimate(false);
      return;
    }

    let cancelled = false;

    const fetchEstimate = async () => {
      setLoadingEstimate(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          if (!cancelled) {
            setScanEstimate(null);
            setEstimatedCalls(0);
          }
          return;
        }

        const cities = selectedCities.map(c => ({
          name: getCityDisplayName(c),
          code: c.code,
          postal_codes: getCityPostalCodes(c),
          department: c.department || '',
          department_code: getCityDepartmentCode(c),
        }));

        const response = await axios.post(
          `${API_URL}/api/pappers-scan/estimate`,
          {
            domains: selectedDomains,
            cities,
            search_mode: searchMode,
            radius_km: searchMode === 'radius' ? radius : 0,
            max_age_days: selectedDateFilter.days || 365,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 20000,
          }
        );

        if (!cancelled) {
          setScanEstimate(response.data);
          setEstimatedCalls(response.data?.estimated_requests || 0);
        }
      } catch (error) {
        console.error('Pappers estimate error:', error);
        if (!cancelled) {
          setScanEstimate(null);
          setEstimatedCalls(calculateFallbackEstimatedCalls());
        }
      } finally {
        if (!cancelled) {
          setLoadingEstimate(false);
        }
      }
    };

    const debounce = setTimeout(fetchEstimate, 350);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [selectedDomains, selectedCities, searchMode, radius, creationDateFilter]);

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

      const scans = Array.isArray(response.data) ? response.data : [];
      const pappersScans = scans
        .filter((scan: ScanHistoryItem) =>
          scan.scan_type === 'pappers_mass' ||
          scan.scan_type === 'pappers' ||
          scan.activity_id === 'pappers_mass_scan' ||
          scan.activity_id === 'pappers_nouvelles_creations'
        );

      setRecentScansTotalCount(pappersScans.length);
      setRecentScans(pappersScans);
    } catch (error) {
      console.error('Recent scans load error:', error);
      setRecentScansTotalCount(0);
      setRecentScans([]);
    } finally {
      setLoadingRecentScans(false);
    }
  };

  const recentScanInsights = useMemo(() => {
    if (recentScans.length === 0) return null;

    const totalRequests = recentScans.reduce((sum, scan) => sum + getHistoryRequestCount(scan), 0);
    const totalResults = recentScans.reduce((sum, scan) => sum + getHistoryResultCount(scan), 0);
    const totalRaw = recentScans.reduce((sum, scan) => sum + getHistoryRawCompanyCount(scan), 0);
    const totalTooOld = recentScans.reduce((sum, scan) => sum + getHistoryTooOldCount(scan), 0);
    const yieldPercent = totalRaw > 0 ? (totalResults / totalRaw) * 100 : 0;
    const bestScan = [...recentScans].sort((left, right) => getHistoryResultCount(right) - getHistoryResultCount(left))[0];

    if (totalResults > 0) {
      return {
        label: 'Apprentissage recent',
        color: '#166534',
        backgroundColor: '#DCFCE7',
        summary: `${totalResults} leads utiles pour ${totalRequests} credits visibles sur les ${recentScans.length} derniers scans.`,
        action: bestScan
          ? `Le meilleur cadrage recent est "${bestScan.location_label || bestScan.query_label || 'Scan Pappers'}". Garde-le comme reference avant d elargir.`
          : 'Conserve les scans qui produisent des leads avant de multiplier les variantes.',
      };
    }

    if (totalRaw > 0 && totalTooOld >= Math.max(1, Math.floor(totalRaw * 0.7))) {
      return {
        label: 'Lecon recente',
        color: '#1D4ED8',
        backgroundColor: '#DBEAFE',
        summary: `${totalRaw} societes brutes ont ete vues, mais elles etaient surtout trop anciennes pour tes derniers scans.`,
        action: 'Le vrai levier n est pas la zone : passe plutot de 7 jours a 30 jours avant de reconsommer du credit.',
      };
    }

    if (totalRequests > 0 && totalRaw === 0) {
      return {
        label: 'Zone trop seche',
        color: '#B45309',
        backgroundColor: '#FEF3C7',
        summary: 'Les derniers scans ont consomme du credit sans remonter de societe brute exploitable.',
        action: 'Change franchement le cadrage : autres domaines, rayon plus large ou autre ville.',
      };
    }

    return {
      label: 'Pilotage a affiner',
      color: '#7C2D12',
      backgroundColor: '#FED7AA',
      summary: `Rendement moyen recent : ${yieldPercent.toFixed(yieldPercent >= 10 ? 0 : 1)}% sur ${recentScans.length} scans visibles.`,
      action: 'Compare surtout fenetre et couverture avant de relancer un scan similaire.',
    };
  }, [recentScans]);

  const openScanResults = (scan: ScanHistoryItem) => {
    const scanCount = scan.result_count ?? scan.total_results ?? 0;
    const scannedNaf = scan.naf_codes_scanned ?? scan.naf_codes_searched ?? 0;
    const scannedPostal = scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
    const availableNaf = scan.naf_codes_available ?? scan.naf_codes_scanned ?? scan.naf_codes_searched ?? 0;
    const availablePostal = scan.postal_codes_available ?? scan.postal_codes_scanned ?? scan.postal_codes_searched ?? 0;
    router.push({
      pathname: '/results',
      params: {
        scanId: scan.id,
        source: 'pappers',
        cityLabel: scan.location_label || '',
        radiusKm: String(scan.radius_km || 0),
        maxAgeDays: String(scan.max_age_days || 365),
        dateLabel: scan.max_age_days ? `${scan.max_age_days} jours` : 'Période enregistrée',
        totalFound: String(scanCount),
        newResultsCount: String(scan.new_results_count ?? 0),
        reusedResultsCount: String(scan.reused_results_count ?? 0),
        rawCompaniesReceived: String(scan.scan_diagnostics?.raw_companies_received ?? 0),
        requestsAttempted: String(scan.scan_diagnostics?.requests_attempted ?? 0),
        skippedTooOldCount: String(scan.scan_diagnostics?.skipped_too_old_count ?? 0),
        nafScanned: String(scannedNaf),
        nafAvailable: String(availableNaf),
        postalScanned: String(scannedPostal),
        postalAvailable: String(availablePostal),
      },
    });
  };

  const formatScanDate = (value?: string) => {
    const formatted = formatServerDateTime(value);
    return formatted === 'Heure inconnue' ? 'Date inconnue' : formatted;
  };

  const scrollToHistory = () => {
    setHistoryExpanded(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(historySectionY - 16, 0),
        animated: true,
      });
    });
  };

  const _legacyAddCity = (city: City) => {
    if (!selectedCities.find(c => c.code === city.code)) {
      setSelectedCities([...selectedCities, city]);
      showToast(`${getCityDisplayName(city)} ajoutée au scan`, 'success');
    }
    setCitySearch('');
    setCitySuggestions([]);
  };

  const addCity = (city: City) => {
    if (searchMode === 'department' && getCityDepartmentCode(city)) {
      const alreadySelectedDepartment = selectedCities.find(
        c => getCityDepartmentCode(c) && getCityDepartmentCode(c) === getCityDepartmentCode(city)
      );
      if (alreadySelectedDepartment) {
        showToast(`Le departement ${getCityDepartmentCode(city)} est deja dans la selection.`, 'info');
        setCitySearch('');
        setCitySuggestions([]);
        return;
      }
    }

    if (!selectedCities.find(c => c.code === city.code)) {
      setSelectedCities([...selectedCities, city]);
      showToast(`${getCityDisplayName(city)} ajoutee au scan`, 'success');
    }
    setCitySearch('');
    setCitySuggestions([]);
  };

  const removeCity = (cityCode: string) => {
    setSelectedCities(selectedCities.filter(c => c.code !== cityCode));
  };

  const toggleDomain = (domainId: string) => {
    if (domainId === 'ALL') {
      // Select all or deselect all
      if (selectedDomains.includes('ALL')) {
        setSelectedDomains([]);
      } else {
        setSelectedDomains(['ALL']);
      }
    } else {
      // Remove ALL if selecting individual domains
      let newSelection = selectedDomains.filter(d => d !== 'ALL');
      if (newSelection.includes(domainId)) {
        newSelection = newSelection.filter(d => d !== domainId);
      } else {
        newSelection.push(domainId);
      }
      setSelectedDomains(newSelection);
    }
  };

  const calculateFallbackEstimatedCalls = () => {
    const totalActivities = getSelectedCount();
    const uniquePostalCodes = new Set<string>();
    const uniqueDepartments = new Set<string>();

    selectedCities.forEach((city) => {
      getCityPostalCodes(city).forEach((postalCode) => {
        if (postalCode) {
          uniquePostalCodes.add(postalCode);
        }
      });
      if (getCityDepartmentCode(city)) {
        uniqueDepartments.add(getCityDepartmentCode(city));
      }
    });

    const geoTargetCount = searchMode === 'department'
      ? Math.max(1, uniqueDepartments.size || selectedCities.length)
      : uniquePostalCodes.size > 0
        ? uniquePostalCodes.size
        : searchMode === 'radius'
          ? Math.max(1, Math.ceil(radius / 2))
          : Math.max(1, selectedCities.length);

    const periodFactor = searchMode === 'department'
      ? (selectedDateFilter.days <= 30 ? 2 : selectedDateFilter.days <= 180 ? 3 : 4)
      : selectedDateFilter.days <= 30
        ? 0.8
        : selectedDateFilter.days <= 180
          ? 1
          : 1.2;
    return Math.ceil(totalActivities * geoTargetCount * periodFactor);
  };

  const getEffectiveEstimatedCalls = () => scanEstimate?.estimated_requests ?? calculateFallbackEstimatedCalls();

  const getEstimatedDurationMinutes = () => (
    scanEstimate?.estimated_duration_minutes ?? Math.max(1, Math.ceil(getEffectiveEstimatedCalls() / 20))
  );

  const calculateEstimatedCalls = () => getEffectiveEstimatedCalls();

  const getScanIntensity = () => {
    const calls = getEffectiveEstimatedCalls();
    if (calls <= 40) {
      return {
        label: 'Scan ciblé',
        color: '#15803D',
        backgroundColor: '#DCFCE7',
        message: 'Bon pour tester une zone précise sans trop consommer de crédits.',
      };
    }
    if (calls <= 120) {
      return {
        label: 'Scan standard',
        color: '#1D4ED8',
        backgroundColor: '#DBEAFE',
        message: 'Couverture équilibrée entre volume et coût API.',
      };
    }
    return {
      label: 'Scan volumineux',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
      message: 'Prévois plus de temps et une consommation API plus forte.',
    };
  };

  const getDateWindowGuidance = () => {
    if (selectedDateFilter.days <= 30) {
      return 'Fenêtre courte : utile pour de la nouveauté pure, mais souvent pauvre en volume.';
    }
    if (selectedDateFilter.days <= 180) {
      return 'Fenêtre équilibrée : bon compromis entre fraîcheur et volume.';
    }
    return 'Fenêtre large : idéale pour maximiser le volume de prospection.';
  };

  const getEstimateCoverageRatio = () => {
    if (!scanEstimate) return 0;
    const nafRatio = scanEstimate.naf_codes_scanned > 0
      ? scanEstimate.naf_codes_scanned / Math.max(scanEstimate.naf_codes_available, scanEstimate.naf_codes_scanned)
      : 0;
    const geoScanned = scanEstimate.geo_units_scanned ?? scanEstimate.postal_codes_scanned;
    const geoAvailable = scanEstimate.geo_units_available ?? scanEstimate.postal_codes_available;
    const geoRatio = geoScanned && geoScanned > 0
      ? geoScanned / Math.max(geoAvailable ?? geoScanned, geoScanned)
      : 0;

    if (nafRatio > 0 && geoRatio > 0) {
      return (nafRatio + geoRatio) / 2;
    }

    return Math.max(nafRatio, geoRatio);
  };

  const getEstimatePilot = () => {
    const calls = getEffectiveEstimatedCalls();
    const coverageRatio = getEstimateCoverageRatio();
    const creditsRemaining = scanEstimate?.pappers_budget?.credits_remaining ?? 0;
    const willExceedBudget = scanEstimate?.pappers_budget?.will_exceed_budget ?? false;

    if (willExceedBudget) {
      return {
        label: 'Budget insuffisant',
        color: '#B91C1C',
        backgroundColor: '#FEE2E2',
        summary: 'Le scan depasse les credits Pappers encore disponibles ce mois-ci.',
        action: 'Reduis le rayon, diminue les domaines ou attends le renouvellement du budget avant de lancer.',
      };
    }

    if (selectedDateFilter.days <= 7 && calls >= 120) {
      return {
        label: 'Veille couteuse',
        color: '#B45309',
        backgroundColor: '#FEF3C7',
        summary: 'Beaucoup d appels pour une fenetre de 7 jours : utile pour de la surveillance, rarement pour du volume.',
        action: 'Passe en 30 jours si tu veux chercher des leads, ou reduis le scope si tu veux juste monitorer.',
      };
    }

    if (coverageRatio > 0 && coverageRatio < 0.45) {
      return {
        label: 'Couverture partielle',
        color: '#1D4ED8',
        backgroundColor: '#DBEAFE',
        summary: 'Le cadrage ne couvre qu une partie du terrain utile. Le cout sera difficile a rentabiliser tel quel.',
        action: 'Elargis la zone ou reduis les domaines pour remonter la couverture avant de consommer du credit.',
      };
    }

    if (coverageRatio >= 0.999) {
      return {
        label: 'Couverture complete',
        color: '#065F46',
        backgroundColor: '#D1FAE5',
        summary: 'Tous les NAF retenus et toute la zone demandee seront bien scannes sans coupe cachee.',
        action: 'Tu peux lancer en sachant que la couverture annoncee correspond bien au terrain demande.',
      };
    }

    if (selectedDateFilter.days <= 7) {
      return {
        label: 'Veille recente',
        color: '#4338CA',
        backgroundColor: '#E0E7FF',
        summary: 'Bon scan de nouveaute pure, mais attends naturellement peu de volume exploitable.',
        action: 'Tres bien pour monitorer une zone. Pour de la prospection, previlegie plutot 30 jours.',
      };
    }

    if (calls >= 300 && creditsRemaining < calls * 2) {
      return {
        label: 'Gros scan a piloter',
        color: '#7C2D12',
        backgroundColor: '#FED7AA',
        summary: 'La couverture est interessante, mais ce scan piochera fort dans le budget mensuel.',
        action: 'A reserver aux zones prioritaires ou aux periodes 30 jours et plus.',
      };
    }

    if (selectedDateFilter.days <= 30) {
      return {
        label: 'Bon test commercial',
        color: '#047857',
        backgroundColor: '#D1FAE5',
        summary: 'Bon compromis entre fraicheur, couverture et consommation Pappers.',
        action: 'Si le resultat est pauvre, garde le meme cadrage et rejoue en 30 jours avant de conclure.',
      };
    }

    return {
      label: 'Bon scan de stock',
      color: '#065F46',
      backgroundColor: '#D1FAE5',
      summary: 'Le cadrage est taille pour remonter du volume et remplir la prospection.',
      action: 'Utilise-le pour produire du stock, puis reduis la fenetre si tu veux passer en veille plus fine.',
    };
  };

  const _legacyHandleStartScan = () => {
    if (hasPendingTypedCity && selectedCities.length === 0) {
      addCity(citySuggestions[0]);
      showToast("Ville détectée automatiquement. Clique une seconde fois pour lancer le scan.", 'info');
      return;
    }

    if (searchMode === 'radius' && selectedCities.length === 0) {
      showToast('Veuillez sélectionner une ville.', 'error');
      return;
    }
    if (searchMode === 'multi' && selectedCities.length === 0) {
      showToast('Veuillez sélectionner au moins une ville.', 'error');
      return;
    }
    if (selectedDomains.length === 0) {
      showToast('Veuillez sélectionner au moins un domaine.', 'error');
      return;
    }

    const calls = getEffectiveEstimatedCalls();
    setEstimatedCalls(calls);

    if (selectedDateFilter.days <= 30 && searchMode === 'radius' && radius <= 10) {
      showToast('Fenêtre courte détectée : si le volume est faible, essaie 6 mois ou 12 mois.', 'info');
    }

    if (calls > 100) {
      setShowWarningModal(true);
    } else {
      executeScan();
    }
  };

  const _legacyExecuteScan = async () => {
    setShowWarningModal(false);
    setScanning(true);
    setScanProgress({ current: 1, total: 3, activity: 'Preparation du scan...' });

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast('Session expiree. Reconnecte-toi pour lancer un scan.', 'error');
        router.replace('/login');
        return;
      }
      setScanProgress({ current: 2, total: 3, activity: 'Envoi à Pappers...' });
      
      try {
        const creditCheckResponse = await axios.get(
          `${API_URL}/api/api-usage/check-before-scan`,
          {
            params: {
              scan_type: 'pappers',
              estimated_pappers_credits: getEffectiveEstimatedCalls(),
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
          }
        );

        const blockers = creditCheckResponse.data?.blockers || [];
        const warnings = creditCheckResponse.data?.warnings || [];

        if (blockers.length > 0) {
          showToast(blockers.map((item: any) => item.message).join(' | '), 'error');
          return;
        }

        if (warnings.length > 0) {
          showToast(warnings.map((item: any) => item.message).join(' | '), 'warning');
        }
      } catch (creditError) {
        console.log('Could not check Pappers credits before scan:', creditError);
      }

      // Prepare cities data
      const cities = selectedCities.map(c => ({
        name: getCityDisplayName(c),
        code: c.code,
        postal_codes: getCityPostalCodes(c)
      }));
      
      // Calculer le nombre de jours pour le filtre
      const dateFilterDays = selectedDateFilter.days || 365;
      showToast('Scan Pappers lance. Cela peut prendre quelques minutes.', 'info');
      
      const response = await axios.post(
        `${API_URL}/api/pappers-scan`,
        {
          domains: selectedDomains,
          cities: cities,
          search_mode: searchMode,
          radius_km: searchMode === 'radius' ? radius : 0,
          max_age_days: dateFilterDays,  // Nouveau parametre
        },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000 // 5 minutes timeout for large scans
        }
      );
      setScanProgress({ current: 3, total: 3, activity: 'Scan terminé.' });
      showToast(`Scan terminé : ${response.data.total_found} entreprises trouvées`, 'success');
      loadRecentScans();

      const zeroResultHint = response.data.total_found === 0 && dateFilterDays <= 30
        ? ` Fenêtre ${selectedDateFilter.label} très courte : essaie 6 mois ou 12 mois pour remonter plus d'entreprises.`
        : '';
      const coverageHint = response.data.naf_codes_scanned && response.data.postal_codes_scanned
        ? ` Couverture: ${response.data.naf_codes_scanned} NAF x ${response.data.postal_codes_scanned} codes postaux.`
        : '';
      showToast(
        `${response.data.total_found} entreprises, ${response.data.visite_count} terrain, ${response.data.lead_count} joignables.${coverageHint}${zeroResultHint}`,
        response.data.total_found > 0 ? 'success' : 'warning'
      );

      // Navigate to visites page
      router.push({
        pathname: '/results',
        params: {
          scanId: response.data.scan_id,
          source: 'pappers',
          cityLabel: searchMode === 'radius'
            ? getCityDisplayName(selectedCities[0])
            : selectedCities.map(getCityDisplayName).join(', '),
          radiusKm: String(searchMode === 'radius' ? radius : 0),
          maxAgeDays: String(dateFilterDays),
          dateLabel: selectedDateFilter.label,
          totalFound: String(response.data.total_found || 0),
          visiteCount: String(response.data.visite_count || 0),
          leadCount: String(response.data.lead_count || 0),
          newResultsCount: String(response.data.new_results_count || 0),
          reusedResultsCount: String(response.data.reused_results_count || 0),
          rawCompaniesReceived: String(response.data.scan_diagnostics?.raw_companies_received || 0),
          requestsAttempted: String(response.data.scan_diagnostics?.requests_attempted || 0),
          skippedTooOldCount: String(response.data.scan_diagnostics?.skipped_too_old_count || 0),
          nafScanned: String(response.data.naf_codes_scanned || 0),
          nafAvailable: String(response.data.naf_codes_available || response.data.naf_codes_scanned || 0),
          postalScanned: String(response.data.postal_codes_scanned || 0),
          postalAvailable: String(response.data.postal_codes_available || response.data.postal_codes_scanned || 0),
        },
      });

    } catch (error: any) {
      console.error('Scan error:', error);
      const detail = error.response?.data?.detail;
      const parsedMessage = Array.isArray(detail)
        ? detail.map((item: any) => item.msg || item.message || JSON.stringify(item)).join('\n')
        : detail || error.message || 'Erreur lors du scan';
      setScanProgress({ current: 0, total: 0, activity: '' });
      showToast(`Echec du scan: ${parsedMessage}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleStartScan = () => {
    if (hasPendingTypedCity && selectedCities.length === 0 && citySuggestions.length > 0) {
      addCity(citySuggestions[0]);
      showToast('Ville detectee automatiquement. Clique une seconde fois pour lancer le scan.', 'info');
      return;
    }

    if (searchMode === 'radius' && selectedCities.length === 0) {
      showToast('Veuillez selectionner la ville centre du rayon.', 'error');
      return;
    }

    if (searchMode === 'multi' && selectedCities.length === 0) {
      showToast('Veuillez selectionner au moins une ville.', 'error');
      return;
    }

    if (searchMode === 'department' && selectedCities.length === 0) {
      showToast('Veuillez selectionner au moins une ville de reference pour determiner le departement.', 'error');
      return;
    }

    if (selectedDomains.length === 0) {
      showToast('Veuillez selectionner au moins un domaine.', 'error');
      return;
    }

    const estimatedCredits = Math.ceil(scanEstimate?.estimated_pappers_credits ?? getEffectiveEstimatedCalls());
    setEstimatedCalls(estimatedCredits);

    if (scanEstimate?.pappers_budget?.will_exceed_budget) {
      showToast('Credits Pappers insuffisants pour couvrir tout le scan demande.', 'error');
      return;
    }

    if (estimatedCredits >= 120 || searchMode === 'department') {
      setShowWarningModal(true);
      return;
    }

    executeScan();
  };

  const executeScan = async () => {
    setShowWarningModal(false);
    setScanning(true);
    setScanProgress({ current: 1, total: 3, activity: 'Preparation du scan...' });

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast('Session expiree. Reconnecte-toi pour lancer un scan.', 'error');
        router.replace('/login');
        return;
      }

      setScanProgress({ current: 2, total: 3, activity: 'Verification du budget puis envoi a Pappers...' });

      const estimatedCredits = Math.ceil(scanEstimate?.estimated_pappers_credits ?? getEffectiveEstimatedCalls());

      try {
        const creditCheckResponse = await axios.get(
          `${API_URL}/api/api-usage/check-before-scan`,
          {
            params: {
              scan_type: 'pappers',
              estimated_pappers_credits: estimatedCredits,
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
          }
        );

        const blockers = creditCheckResponse.data?.blockers || [];
        const warnings = creditCheckResponse.data?.warnings || [];

        if (blockers.length > 0) {
          showToast(blockers.map((item: any) => item.message).join(' | '), 'error');
          return;
        }

        if (warnings.length > 0) {
          showToast(warnings.map((item: any) => item.message).join(' | '), 'warning');
        }
      } catch (creditError) {
        console.log('Could not check Pappers credits before scan:', creditError);
      }

      const cities = selectedCities.map((city) => ({
        name: getCityDisplayName(city),
        code: city.code,
        postal_codes: getCityPostalCodes(city),
        department: city.department || '',
        department_code: getCityDepartmentCode(city),
      }));

      const dateFilterDays = selectedDateFilter.days || 365;
      const scanLocationLabel = getSelectedLocationSummary();
      showToast(`Scan Pappers lance sur ${scanLocationLabel}. La date de creation restera limitee a ${selectedDateFilter.label}.`, 'info');

      const response = await axios.post(
        `${API_URL}/api/pappers-scan`,
        {
          domains: selectedDomains,
          cities,
          search_mode: searchMode,
          radius_km: searchMode === 'radius' ? radius : 0,
          max_age_days: dateFilterDays,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000,
        }
      );

      setScanProgress({ current: 3, total: 3, activity: 'Scan termine.' });
      loadRecentScans();

      const responseGeoLabel = response.data.geo_unit_label || getEstimatedGeoUnitLabel();
      const responseGeoScanned = response.data.geo_units_scanned ?? response.data.postal_codes_scanned ?? 0;
      const responseGeoAvailable = response.data.geo_units_available ?? response.data.postal_codes_available ?? responseGeoScanned;
      const responseNafScanned = response.data.naf_codes_scanned || 0;
      const responseNafAvailable = response.data.naf_codes_available || responseNafScanned;
      const observedCredits = response.data.scan_diagnostics?.pappers_credits_used ?? 0;
      const coverageHint = responseNafScanned
        ? ` Couverture: ${responseNafScanned}/${Math.max(responseNafAvailable, responseNafScanned)} NAF x ${responseGeoScanned}/${Math.max(responseGeoAvailable, responseGeoScanned)} ${responseGeoLabel}.`
        : '';
      const costHint = observedCredits > 0
        ? ` Cout observe: ${formatCreditValue(observedCredits)} credits Pappers.`
        : '';
      const zeroResultHint = response.data.total_found === 0 && dateFilterDays <= 30
        ? ` Fenetre ${selectedDateFilter.label} tres stricte: le marche peut exister mais etre plus ancien.`
        : '';

      showToast(
        `${response.data.total_found} entreprises, ${response.data.visite_count} terrain, ${response.data.lead_count} joignables.${coverageHint}${costHint}${zeroResultHint}`,
        response.data.total_found > 0 ? 'success' : 'warning'
      );

      router.push({
        pathname: '/results',
        params: {
          scanId: response.data.scan_id,
          source: 'pappers',
          cityLabel: scanLocationLabel,
          radiusKm: String(searchMode === 'radius' ? radius : 0),
          maxAgeDays: String(dateFilterDays),
          dateLabel: selectedDateFilter.label,
          totalFound: String(response.data.total_found || 0),
          visiteCount: String(response.data.visite_count || 0),
          leadCount: String(response.data.lead_count || 0),
          newResultsCount: String(response.data.new_results_count || 0),
          reusedResultsCount: String(response.data.reused_results_count || 0),
          rawCompaniesReceived: String(response.data.scan_diagnostics?.raw_companies_received || 0),
          requestsAttempted: String(response.data.scan_diagnostics?.requests_attempted || 0),
          skippedTooOldCount: String(response.data.scan_diagnostics?.skipped_too_old_count || 0),
          nafScanned: String(responseNafScanned),
          nafAvailable: String(responseNafAvailable),
          postalScanned: String(response.data.postal_codes_scanned || 0),
          postalAvailable: String(response.data.postal_codes_available || response.data.postal_codes_scanned || 0),
          geoUnitLabel: String(responseGeoLabel),
          geoUnitsScanned: String(responseGeoScanned),
          geoUnitsAvailable: String(responseGeoAvailable),
          pappersCreditsUsed: String(observedCredits),
        },
      });
    } catch (error: any) {
      console.error('Scan error:', error);
      const detail = error.response?.data?.detail;
      const parsedMessage = Array.isArray(detail)
        ? detail.map((item: any) => item.msg || item.message || JSON.stringify(item)).join('\n')
        : detail || error.message || 'Erreur lors du scan';
      setScanProgress({ current: 0, total: 0, activity: '' });
      showToast(`Echec du scan: ${parsedMessage}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const getSelectedCount = () => {
    if (selectedDomains.includes('ALL')) return DOMAIN_PRESENTATION.ALL?.count ?? 77;
    let count = 0;
    selectedDomains.forEach(domainId => {
      const domain = DOMAINS.find(d => d.id === domainId);
      if (domain) count += getDomainCardMeta(domain).count;
    });
    return count;
  };

  const getDisplayedNafPreview = () => scanEstimate?.selected_naf_labels?.slice(0, 10) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.replace('/home')} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <ProspectLocalLogo size={36} variant="icon" />
        <Text style={styles.headerTitle}>Scan Pappers</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={22} color="#1565C0" />
          <Text style={styles.infoBannerText}>
            Détectez les entreprises créées sur la période choisie, sans perdre de couverture sur la zone demandée.
          </Text>
        </View>

        <View style={styles.quickHistoryCard}>
          <View style={styles.quickHistoryContent}>
            <Text style={styles.quickHistoryTitle}>Accès rapide aux scans déjà lancés</Text>
            <Text style={styles.quickHistoryText}>
              {loadingRecentScans
                ? "Chargement de l'historique..."
                : recentScansTotalCount > 0
                  ? `${recentScansTotalCount} scan(s) Pappers disponible(s)`
                  : 'Aucun scan Pappers récent pour le moment'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.quickHistoryButton}
            onPress={scrollToHistory}
            disabled={loadingRecentScans}
          >
            <Ionicons name="time-outline" size={16} color="#6366F1" />
            <Text style={styles.quickHistoryButtonText}>Voir les scans</Text>
          </TouchableOpacity>
        </View>

        {activePappersScans.length > 0 && (
          <View style={styles.activeScanCard}>
            <View style={styles.activeScanHeader}>
              <Ionicons name="pulse-outline" size={18} color="#2563EB" />
              <Text style={styles.activeScanTitle}>Scan Pappers en cours</Text>
            </View>
            <Text style={styles.activeScanMeta}>
              {activePappersScans[0]?.location_label || activePappersScans[0]?.query_label || 'Zone en cours'}
            </Text>
            <View style={styles.activeScanProgressRow}>
              <View style={styles.activeScanProgressBar}>
                <View
                  style={[
                    styles.activeScanProgressFill,
                    { width: `${Math.max(8, Math.min(activePappersScans[0]?.progress || 0, 100))}%` },
                  ]}
                />
              </View>
              <Text style={styles.activeScanProgressValue}>
                {typeof activePappersScans[0]?.progress === 'number' ? `${activePappersScans[0].progress}%` : '...'}
              </Text>
            </View>
            <Text style={styles.activeScanProgressText}>
              {buildScanProgressLabel(activePappersScans[0]) || activePappersScans[0]?.progress_message || 'Scan en cours...'}
            </Text>
          </View>
        )}

        {/* Search Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode de recherche</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, searchMode === 'radius' && styles.modeBtnActive]}
              onPress={() => setSearchMode('radius')}
            >
              <Ionicons name="locate" size={18} color={searchMode === 'radius' ? '#FFF' : '#666'} />
              <Text style={[styles.modeBtnText, searchMode === 'radius' && styles.modeBtnTextActive]}>
                Ville + Rayon
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, searchMode === 'multi' && styles.modeBtnActive]}
              onPress={() => setSearchMode('multi')}
            >
              <Ionicons name="list" size={18} color={searchMode === 'multi' ? '#FFF' : '#666'} />
              <Text style={[styles.modeBtnText, searchMode === 'multi' && styles.modeBtnTextActive]}>
                Plusieurs villes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, searchMode === 'department' && styles.modeBtnActive]}
              onPress={() => setSearchMode('department')}
            >
              <Ionicons name="map" size={18} color={searchMode === 'department' ? '#FFF' : '#666'} />
              <Text style={[styles.modeBtnText, searchMode === 'department' && styles.modeBtnTextActive]}>
                Departement
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* City Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {searchMode === 'multi'
              ? `Villes (${selectedCities.length} sélectionnées)`
              : searchMode === 'department'
                ? `Départements (${selectedCities.length} sélectionnés)`
                : 'Ville centre'}
          </Text>
          <View style={styles.cityInputContainer}>
            <Ionicons name="location" size={20} color="#666" />
            <TextInput
              style={styles.cityInput}
              placeholder={
                searchMode === 'multi'
                  ? 'Ajouter une ville...'
                  : searchMode === 'department'
                    ? 'Ajouter une ville de référence du département...'
                    : 'Rechercher une ville...'
              }
              value={citySearch}
              onChangeText={setCitySearch}
              onSubmitEditing={() => {
                if (citySuggestions.length > 0) {
                  addCity(citySuggestions[0]);
                }
              }}
              placeholderTextColor="#999"
            />
          </View>

          {loading && (
            <View style={styles.citySearchLoading}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.citySearchLoadingText}>Recherche des villes...</Text>
            </View>
          )}
          
          {citySuggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {citySuggestions.slice(0, 5).map((city, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestionItem}
                  onPress={() => addCity(city)}
                >
                  <Text style={styles.suggestionText}>{getCityDisplayName(city)}</Text>
                  <Text style={styles.suggestionCode}>
                    {searchMode === 'department'
                      ? getCityDepartmentCode(city) || getCityPostalCodes(city)?.[0]
                      : getCityPostalCodes(city)?.[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Selected Cities */}
          {selectedCities.length > 0 && (
            <View style={styles.selectedCitiesContainer}>
              {selectedCities.map((city) => (
                <View key={city.code} style={styles.selectedCityChip}>
                  <Text style={styles.selectedCityText}>{getCityChipLabel(city)}</Text>
                  <TouchableOpacity onPress={() => removeCity(city.code)}>
                    <Ionicons name="close-circle" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.helperText}>
            {searchMode === 'department'
              ? 'Ajoute une ville par département à couvrir. Le scan utilisera ensuite le département entier correspondant.'
              : 'Tape une ville puis clique sur une suggestion. Entrée ajoute automatiquement la première proposition.'}
          </Text>
        </View>

        {/* Radius Selection - Only show in radius mode */}
        {searchMode === 'radius' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rayon : {radius} km</Text>
            <View style={styles.radiusButtons}>
              {[1, 5, 10, 20, 30, 50, 100].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.radiusBtn,
                    radius === r && styles.radiusBtnActive
                  ]}
                  onPress={() => setRadius(r)}
                >
                  <Text style={[
                    styles.radiusBtnText,
                    radius === r && styles.radiusBtnTextActive
                  ]}>
                    {r} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Date Creation Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date de création</Text>
          <Text style={styles.sectionSubtitle}>
            Entreprises créées dans les {DATE_FILTERS.find(f => f.id === creationDateFilter)?.label || '12 mois'}
          </Text>
          <View style={styles.dateFiltersContainer}>
            {DATE_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.dateFilterBtn,
                  creationDateFilter === filter.id && { 
                    backgroundColor: filter.color,
                    borderColor: filter.color
                  }
                ]}
                onPress={() => setCreationDateFilter(filter.id)}
              >
                <Text style={[
                  styles.dateFilterText,
                  creationDateFilter === filter.id && styles.dateFilterTextActive
                ]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Domain Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Domaines d'activités</Text>
          <Text style={styles.sectionSubtitle}>
            {getSelectedCount()} activités sélectionnées
          </Text>
          
          <View style={styles.domainsGrid}>
            {DOMAINS.map((domain) => {
              const isSelected = selectedDomains.includes(domain.id) || 
                (selectedDomains.includes('ALL') && domain.id !== 'ALL');
              const domainMeta = getDomainCardMeta(domain);
              
              return (
                <TouchableOpacity
                  key={domain.id}
                  style={[
                    styles.domainCard,
                    isSelected && { borderColor: domain.color, backgroundColor: `${domain.color}15` }
                  ]}
                  onPress={() => toggleDomain(domain.id)}
                >
                  <View style={styles.domainHeader}>
                    <Text style={styles.domainLabel}>{domainMeta.label}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={domain.color} />
                    )}
                  </View>
                  <Text style={styles.domainDescription}>{domainMeta.description}</Text>
                  <Text style={[styles.domainCount, { color: domain.color }]}>
                    {domainMeta.count} activités
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Estimation */}
        {selectedDomains.length > 0 && selectedCities.length > 0 && (
          <View style={styles.estimationCard}>
            <Ionicons name="analytics" size={24} color="#6366F1" />
            <View style={styles.estimationContent}>
              <Text style={styles.estimationTitle}>Estimation du scan</Text>
              <Text style={styles.estimationText}>
                ~{formatCreditValue(scanEstimate?.estimated_pappers_credits ?? calculateEstimatedCalls())} crédits Pappers • {getSelectedCount()} activités • {getSelectedLocationSummary()}
              </Text>
              {scanEstimate && (
                <Text style={styles.estimationHint}>
                  Couverture réelle prévue : {scanEstimate.naf_codes_scanned}/{Math.max(scanEstimate.naf_codes_available, scanEstimate.naf_codes_scanned)} NAF • {(scanEstimate.geo_units_scanned ?? scanEstimate.postal_codes_scanned) || 0}/{Math.max((scanEstimate.geo_units_available ?? scanEstimate.postal_codes_available ?? scanEstimate.geo_units_scanned ?? scanEstimate.postal_codes_scanned) || 0, (scanEstimate.geo_units_scanned ?? scanEstimate.postal_codes_scanned) || 0)} {getEstimatedGeoUnitLabel()}.
                </Text>
              )}
              {scanEstimate?.pappers_budget && (
                <Text style={styles.estimationHint}>
                  Crédits Pappers restants ce mois-ci : {formatCreditValue(scanEstimate.pappers_budget.credits_remaining)}/{formatCreditValue(scanEstimate.pappers_budget.monthly_budget)} • après ce scan : {formatCreditValue(scanEstimate.pappers_budget.remaining_after_scan)}
                </Text>
              )}
              {scanEstimate?.selected_naf_labels && scanEstimate.selected_naf_labels.length > 0 && (
                <View style={styles.nafPreviewCard}>
                  <Text style={styles.nafPreviewTitle}>Activités réellement couvertes</Text>
                  <View style={styles.nafPreviewGrid}>
                    {getDisplayedNafPreview().map((item) => (
                      <View key={`${item.code}-${item.label}`} style={styles.nafPreviewPill}>
                        <Text style={styles.nafPreviewCode}>{item.code}</Text>
                        <Text style={styles.nafPreviewLabel} numberOfLines={2}>
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.estimationHint}>
                    {scanEstimate.selected_naf_labels.length > 10
                      ? `+ ${scanEstimate.selected_naf_labels.length - 10} autres activites NAF seront aussi incluses dans le scan.`
                      : 'Toutes les activites NAF du scan sont listees ici.'}
                  </Text>
                </View>
              )}
              {scanEstimate && (
                <View style={styles.estimationPilotCard}>
                  <View
                    style={[
                      styles.estimationPilotBadge,
                      { backgroundColor: getEstimatePilot().backgroundColor }
                    ]}
                  >
                    <Text
                      style={[
                        styles.estimationPilotBadgeText,
                        { color: getEstimatePilot().color }
                      ]}
                    >
                      {getEstimatePilot().label}
                    </Text>
                  </View>
                  <Text style={styles.estimationPilotSummary}>
                    {getEstimatePilot().summary}
                  </Text>
                  <Text style={styles.estimationPilotAction}>
                    {getEstimatePilot().action}
                  </Text>
                  <View style={styles.estimationPilotMetrics}>
                    <View style={styles.estimationPilotMetric}>
                      <Text style={styles.estimationPilotMetricLabel}>Credits</Text>
                      <Text style={styles.estimationPilotMetricValue}>{formatCreditValue(scanEstimate.estimated_pappers_credits)}</Text>
                    </View>
                    <View style={styles.estimationPilotMetric}>
                      <Text style={styles.estimationPilotMetricLabel}>Couverture</Text>
                      <Text style={styles.estimationPilotMetricValue}>{Math.round(getEstimateCoverageRatio() * 100)}%</Text>
                    </View>
                    <View style={styles.estimationPilotMetric}>
                      <Text style={styles.estimationPilotMetricLabel}>Apres scan</Text>
                      <Text style={styles.estimationPilotMetricValue}>{formatCreditValue(scanEstimate.pappers_budget?.remaining_after_scan ?? 0)}</Text>
                    </View>
                  </View>
                </View>
              )}
              {loadingEstimate && (
                <Text style={styles.estimationHint}>
                  Calcul de la couverture reelle en cours...
                </Text>
              )}
              <View style={[styles.intensityBadge, { backgroundColor: getScanIntensity().backgroundColor }]}>
                <Text style={[styles.intensityBadgeText, { color: getScanIntensity().color }]}>
                  {getScanIntensity().label}
                </Text>
              </View>
              <Text style={styles.estimationHint}>
                {getScanIntensity().message}
              </Text>
              <Text style={styles.estimationHint}>
                {getDateWindowGuidance()}
              </Text>
              <Text style={styles.estimationMeta}>
                Durée estimée : {getEstimatedDurationMinutes()} min • Période : {selectedDateFilter.label}
              </Text>
            </View>
          </View>
        )}

        {scanning && (
          <View style={styles.scanStatusCard}>
            <View style={styles.scanStatusHeader}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.scanStatusTitle}>Scan en cours</Text>
            </View>
            <Text style={styles.scanStatusText}>{scanProgress.activity || 'Traitement du scan...'}</Text>
          </View>
        )}

        {/* Start Button */}
        <TouchableOpacity
          style={[
            styles.startBtn,
            (selectedCities.length === 0 || selectedDomains.length === 0 || scanning) && styles.startBtnDisabled
          ]}
          onPress={handleStartScan}
          disabled={selectedCities.length === 0 || selectedDomains.length === 0 || scanning}
        >
          {scanning ? (
            <>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={styles.startBtnText}>Scan en cours...</Text>
            </>
          ) : (
            <>
              <Ionicons name="search" size={20} color="#FFF" />
              <Text style={styles.startBtnText}>Lancer le scan Pappers</Text>
            </>
          )}
        </TouchableOpacity>

        <View
          style={styles.historySection}
          onLayout={(event) => setHistorySectionY(event.nativeEvent.layout.y)}
        >
          <View style={styles.historyHeader}>
            <View style={styles.historyHeaderContent}>
              <Text style={styles.sectionTitle}>
                Historique des scans Pappers
                {recentScansTotalCount > 0 ? ` (${recentScansTotalCount})` : ''}
              </Text>
              <Text style={styles.sectionSubtitle}>
                Retrouve ton dernier scan ou ouvre un ancien résultat sans relancer une recherche.
              </Text>
            </View>
            <View style={styles.historyHeaderActions}>
              <TouchableOpacity
                style={styles.historyRefreshButton}
                onPress={loadRecentScans}
                disabled={loadingRecentScans}
              >
                <Ionicons name="refresh" size={16} color="#6366F1" />
                <Text style={styles.historyRefreshText}>Actualiser</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.historyToggleButton}
                onPress={() => setHistoryExpanded((current) => !current)}
              >
                <Ionicons
                  name={historyExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#1C1C1E"
                />
                <Text style={styles.historyToggleButtonText}>
                  {historyExpanded ? 'Masquer' : 'Afficher'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {recentScanInsights && historyExpanded ? (
            <View style={styles.historyInsightsCard}>
              <View
                style={[
                  styles.historyInsightsBadge,
                  { backgroundColor: recentScanInsights.backgroundColor }
                ]}
              >
                <Text
                  style={[
                    styles.historyInsightsBadgeText,
                    { color: recentScanInsights.color }
                  ]}
                >
                  {recentScanInsights.label}
                </Text>
              </View>
              <Text style={styles.historyInsightsSummary}>
                {recentScanInsights.summary}
              </Text>
              <Text style={styles.historyInsightsAction}>
                {recentScanInsights.action}
              </Text>
            </View>
          ) : null}

          {!historyExpanded ? (
            <TouchableOpacity style={styles.historyCollapsedCard} onPress={scrollToHistory}>
              <View style={styles.historyCollapsedContent}>
                <Ionicons name="albums-outline" size={20} color="#6366F1" />
                <View style={styles.historyCollapsedTextBlock}>
                  <Text style={styles.historyCollapsedTitle}>Derniers scans disponibles</Text>
                  <Text style={styles.historyCollapsedText}>
                    {loadingRecentScans
                      ? "Chargement de l'historique..."
                      : recentScansTotalCount > 0
                        ? `${recentScansTotalCount} scan(s) consultable(s) en un clic`
                        : 'Aucun scan Pappers récent'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={18} color="#6366F1" />
            </TouchableOpacity>
          ) : loadingRecentScans ? (
            <View style={styles.historyLoadingCard}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.historyLoadingText}>Chargement des derniers scans...</Text>
            </View>
          ) : recentScans.length === 0 ? (
            <View style={styles.emptyHistoryCard}>
              <Ionicons name="time-outline" size={22} color="#8E8E93" />
              <Text style={styles.emptyHistoryTitle}>Aucun scan Pappers récent</Text>
              <Text style={styles.emptyHistoryText}>
                Lance un scan avec le formulaire ci-dessus. Il apparaitra ensuite dans cette liste.
              </Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {recentScans.map((scan) => (
                <TouchableOpacity
                  key={scan.id}
                  style={styles.historyCard}
                  activeOpacity={0.85}
                  onPress={() => openScanResults(scan)}
                >
                  {(() => {
                    const status = getScanStatusPresentation(scan);
                    const progressLabel = buildScanProgressLabel(scan);
                    return (
                      <>
                  <View style={styles.historyCardTop}>
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>Pappers</Text>
                    </View>
                    <Text style={styles.historyDate}>{formatScanDate(scan.created_at)}</Text>
                  </View>

                  <Text style={styles.historyCardTitle}>
                    {scan.location_label || scan.query_label || 'Scan Pappers'}
                  </Text>
                  <Text style={styles.historyCardSubtitle}>
                    {(scan.result_count ?? scan.total_results ?? 0)} résultats • {(scan.max_age_days || 365)} jours{scan.radius_km ? ` • ${scan.radius_km} km` : ''}
                  </Text>
                  {(scan.new_results_count || scan.reused_results_count) ? (
                    <Text style={styles.historyCoverageText}>
                      {scan.new_results_count ?? 0} nouveaux • {scan.reused_results_count ?? 0} déjà connus
                    </Text>
                  ) : null}
                  {getHistoryCoverageLabel(scan) ? (
                    <Text style={styles.historyCoverageText}>
                      {getHistoryCoverageLabel(scan)}
                    </Text>
                  ) : null}
                  {getHistoryDiagnosticLabel(scan) ? (
                    <Text style={styles.historyCoverageText}>
                      {getHistoryDiagnosticLabel(scan)}
                    </Text>
                  ) : null}
                  <View style={[styles.historyStatusBadge, { backgroundColor: status.backgroundColor }]}>
                    <Text style={[styles.historyStatusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  {progressLabel ? (
                    <Text style={styles.historyProgressText}>{progressLabel}</Text>
                  ) : null}

                  <View
                    style={[
                      styles.historyOutcomeBadge,
                      { backgroundColor: getHistoryOutcomeTone(scan).backgroundColor }
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyOutcomeBadgeText,
                        { color: getHistoryOutcomeTone(scan).color }
                      ]}
                    >
                      {getHistoryOutcomeTone(scan).label}
                    </Text>
                  </View>
                  <Text style={styles.historySummaryText}>
                    {getHistoryOutcomeSummary(scan)}
                  </Text>
                  <Text style={styles.historyCostText}>
                    {getHistoryCostLabel(scan)}
                  </Text>

                  <View style={styles.historyMetricsRow}>
                    <View style={styles.historyMetricPill}>
                      <Text style={styles.historyMetricValue}>{getHistoryResultCount(scan)}</Text>
                      <Text style={styles.historyMetricLabel}>leads</Text>
                    </View>
                    <View style={styles.historyMetricPill}>
                      <Text style={styles.historyMetricValue}>{getHistoryRequestCount(scan)}</Text>
                      <Text style={styles.historyMetricLabel}>appels</Text>
                    </View>
                    <View style={styles.historyMetricPill}>
                      <Text style={styles.historyMetricValue}>{getHistoryRawCompanyCount(scan)}</Text>
                      <Text style={styles.historyMetricLabel}>brut</Text>
                    </View>
                    <View style={styles.historyMetricPill}>
                      <Text style={styles.historyMetricValue}>{getHistoryTooOldCount(scan)}</Text>
                      <Text style={styles.historyMetricLabel}>trop anciennes</Text>
                    </View>
                  </View>

                  <View style={styles.historyActionsRow}>
                    <TouchableOpacity
                      style={styles.historySecondaryAction}
                      onPress={() => applyHistoryTemplate(scan)}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#4F46E5" />
                      <Text style={styles.historySecondaryActionText}>Relancer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyPrimaryAction}
                      onPress={() => openScanResults(scan)}
                    >
                      <Ionicons name="list" size={16} color="#FFF" />
                      <Text style={styles.historyPrimaryActionText}>Voir les résultats</Text>
                    </TouchableOpacity>
                  </View>
                      </>
                    );
                  })()}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Warning Modal */}
      <Modal
        visible={showWarningModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWarningModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.warningModal}>
            <Ionicons name="warning" size={50} color="#FF9500" />
            <Text style={styles.warningTitle}>Scan volumineux</Text>
            <Text style={styles.warningText}>
              Ce scan va consommer environ <Text style={styles.warningHighlight}>{formatCreditValue(estimatedCalls)} crédits Pappers</Text>.
            </Text>
            <Text style={styles.warningSubtext}>
              La recherche respectera strictement la période choisie sur la date de création, mais elle peut prendre plusieurs minutes selon la zone demandée.
            </Text>
            
            <View style={styles.warningDetails}>
              <Text style={styles.warningDetailItem}>{getSelectedCount()} activités</Text>
              <Text style={styles.warningDetailItem}>Zone : {getSelectedLocationSummary()}</Text>
              <Text style={styles.warningDetailItem}>Durée estimée : {getEstimatedDurationMinutes()} min</Text>
              <Text style={styles.warningDetailItem}>Période création : {selectedDateFilter.label}</Text>
            </View>

            <View style={styles.warningActions}>
              <TouchableOpacity
                style={styles.warningCancelBtn}
                onPress={() => setShowWarningModal(false)}
              >
                <Text style={styles.warningCancelText}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.warningConfirmBtn}
                onPress={executeScan}
              >
                <Text style={styles.warningConfirmText}>Lancer quand meme</Text>
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
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  cityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  cityInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
  },
  citySearchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  citySearchLoadingText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  suggestionsContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  suggestionText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  suggestionCode: {
    fontSize: 13,
    color: '#666',
  },
  selectedCitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 10,
  },
  selectedCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 20,
    gap: 6,
  },
  selectedCityText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    gap: 8,
  },
  modeBtnActive: {
    backgroundColor: '#6366F1',
  },
  modeBtnText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#FFF',
  },
  radiusButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  radiusBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  radiusBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  radiusBtnText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  radiusBtnTextActive: {
    color: '#FFF',
  },
  domainsGrid: {
    gap: 10,
  },
  domainCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#E5E5EA',
  },
  domainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  domainLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  domainDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  domainCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  estimationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 20,
  },
  quickHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  quickHistoryContent: {
    flex: 1,
  },
  quickHistoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  quickHistoryText: {
    fontSize: 13,
    color: '#6366F1',
    lineHeight: 18,
  },
  quickHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickHistoryButtonText: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '700',
  },
  activeScanCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 10,
  },
  activeScanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeScanTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  activeScanMeta: {
    fontSize: 13,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  activeScanProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    minWidth: 44,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  activeScanProgressText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#1E40AF',
    fontWeight: '600',
  },
  historySection: {
    marginTop: 8,
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  historyHeaderContent: {
    flex: 1,
  },
  historyHeaderActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  historyInsightsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  historyInsightsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  historyInsightsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6366F1',
  },
  historyInsightsSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    fontWeight: '700',
  },
  historyInsightsAction: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    fontWeight: '600',
  },
  historyRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyRefreshText: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '700',
  },
  historyToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F6F7FB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyToggleButtonText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
  },
  historyCollapsedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyCollapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  historyCollapsedTextBlock: {
    flex: 1,
  },
  historyCollapsedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  historyCollapsedText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  historyLoadingCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  historyLoadingText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
  emptyHistoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 8,
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 10,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  historyBadgeText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '700',
  },
  historyDate: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  historyCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  historyCardSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  historyCoverageText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 6,
  },
  historyStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyProgressText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  historyOutcomeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  historyOutcomeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historySummaryText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#334155',
  },
  historyCostText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  historyMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  historyMetricPill: {
    backgroundColor: '#F6F7FB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 92,
  },
  historyMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  historyMetricLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  historyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  historySecondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  historySecondaryActionText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  historyPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  historyPrimaryActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  estimationContent: {
    flex: 1,
  },
  estimationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
    marginBottom: 4,
  },
  estimationText: {
    fontSize: 12,
    color: '#666',
  },
  intensityBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  intensityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  estimationHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  estimationMeta: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  nafPreviewCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    gap: 8,
  },
  nafPreviewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nafPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nafPreviewPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 124,
    maxWidth: '100%',
    gap: 4,
  },
  nafPreviewCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },
  nafPreviewLabel: {
    fontSize: 11,
    lineHeight: 16,
    color: '#334155',
    fontWeight: '600',
  },
  estimationPilotCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  estimationPilotBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  estimationPilotBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6366F1',
  },
  estimationPilotSummary: {
    fontSize: 13,
    lineHeight: 19,
    color: '#0F172A',
    fontWeight: '700',
  },
  estimationPilotAction: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    fontWeight: '600',
  },
  estimationPilotMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  estimationPilotMetric: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 88,
  },
  estimationPilotMetricLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#64748B',
    fontWeight: '700',
  },
  estimationPilotMetricValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  scanStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  scanStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  scanStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3730A3',
  },
  scanStatusText: {
    fontSize: 13,
    color: '#4B5563',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  startBtnDisabled: {
    backgroundColor: '#C7C7CC',
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningModal: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 12,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  warningHighlight: {
    fontWeight: '700',
    color: '#FF9500',
  },
  warningSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  warningDetails: {
    backgroundColor: '#F2F2F7',
    padding: 14,
    borderRadius: 12,
    width: '100%',
    marginBottom: 20,
  },
  warningDetailItem: {
    fontSize: 14,
    color: '#1C1C1E',
    marginBottom: 4,
  },
  warningActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  warningCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  warningCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  warningConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF9500',
    alignItems: 'center',
  },
  warningConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Date filter styles
  dateFiltersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  dateFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E5E5EA',
  },
  dateFilterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  dateFilterTextActive: {
    color: '#FFF',
  },
});
