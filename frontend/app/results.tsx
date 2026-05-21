import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
  Switch,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzePhoneQuality, analyzeLeadFreshness } from '../utils/leadAnalysis';
import { useToast } from '../components/Toast';
import ResultsScanSummary from '../components/results/ResultsScanSummary';
import ResultsOverview from '../components/results/ResultsOverview';
import ResultsFilterBar from '../components/results/ResultsFilterBar';
import ResultsViewTabs from '../components/results/ResultsViewTabs';

import { API_URL } from '../utils/api';

interface Business {
  id: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  website_url?: string;
  has_website?: boolean;
  google_rating?: number;
  google_reviews_count?: number;
  google_place_id?: string;
  has_pagesjaunes: boolean;
  pagesjaunes_url?: string;
  pj_confidence?: string;
  pj_manually_set?: boolean;
  pj_manual_status?: string;
  score: number;
  // User status (mini-CRM)
  is_viewed: boolean;
  contact_status_manual: string;
  client_status: string;
  is_new_in_scan?: boolean;
  // Pappers fields
  source?: string;  // "google" | "pappers"
  date_creation?: string;
  lead_type?: string;  // "standard" | "visite_terrain" | "prospect_prioritaire"
  solocal_priority_score?: number;
  solocal_priority_label?: string;
  solocal_priority_reason?: string;
  digital_visibility_label?: string;
  digital_visibility_summary?: string;
  sales_pitch_hint?: string;
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

interface Stats {
  total: number;
  total_verified: number;
  total_unverified: number;
  total_visite_terrain: number;
  no_pagesjaunes: number;
  new_in_scan: number;
  viewed: number;
  contacted: number;
  no_website: number;
  opportunity_max: number;
  rebound_available: number;
  fragile_available: number;
  visite_terrain: number;
  pappers_count: number;
}

interface ScanDiagnostics {
  raw_companies_received?: number;
  skipped_too_old_count?: number;
  requests_attempted?: number;
  naf_scanned?: number;
  naf_available?: number;
  postal_scanned?: number;
  postal_available?: number;
  search_queries_count?: number;
  source_queries_per_search?: number;
  activities_selected?: number;
  activities_available?: number;
  serper_requests_estimated?: number;
  serper_requests_used?: number;
}

interface ScanRecord {
  id: string;
  query_label?: string;
  location_label?: string;
  radius_km?: number;
  max_age_days?: number;
  scan_type?: string;
  search_type?: 'activity' | 'domain';
  domain_mode?: 'quick' | 'exhaustive';
  total_results?: number;
  result_count?: number;
  lead_count?: number;
  visite_terrain_count?: number;
  web_enriched_count?: number;
  web_phones_found?: number;
  new_results_count?: number;
  reused_results_count?: number;
  leads_with_phone?: number;
  leads_without_phone?: number;
  scan_diagnostics?: ScanDiagnostics;
}

// Filter types
type FilterType = 'all' | 'no_pj' | 'no_website' | 'low_reviews' | 'opportunity_max' | 'new' | 'visite_terrain' | 'pappers' | 'rebound' | 'fragile';

// View mode: verified / unverified / visite_terrain
type ViewMode = 'verified' | 'unverified' | 'visite_terrain';

const normalizeZoneLabel = (rawLabel: unknown): string => {
  const label = String(rawLabel || '').trim();
  if (!label) return '';
  return label
    .replace(/\s*[•+]\s*\d+\s*km\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const buildZoneLabel = (rawLabel: unknown, radiusKm: unknown): string => {
  const zoneLabel = normalizeZoneLabel(rawLabel);
  const radiusValue = String(radiusKm || '').trim();

  if (!zoneLabel) {
    return 'Zone non précisée';
  }

  if (!radiusValue || radiusValue === '0') {
    return zoneLabel;
  }

  return `${zoneLabel} • ${radiusValue} km`;
};

type PappersProfitabilitySummary = {
  label: string;
  color: string;
  backgroundColor: string;
  summary: string;
  cost: string;
  action: string;
};

const buildPappersProfitabilitySummary = ({
  isPappers,
  resultCount,
  rawCompanies,
  tooOldCount,
  requestsAttempted,
  nafScanned,
  nafAvailable,
  postalScanned,
  postalAvailable,
  maxAgeDays,
}: {
  isPappers: boolean;
  resultCount: number;
  rawCompanies: number;
  tooOldCount: number;
  requestsAttempted: number;
  nafScanned: number;
  nafAvailable: number;
  postalScanned: number;
  postalAvailable: number;
  maxAgeDays: number;
}): PappersProfitabilitySummary | null => {
  if (!isPappers) return null;

  const nafRatio = nafScanned > 0 ? nafScanned / Math.max(nafAvailable, nafScanned) : 0;
  const postalRatio = postalScanned > 0 ? postalScanned / Math.max(postalAvailable, postalScanned) : 0;
  const coverageRatio = nafRatio > 0 && postalRatio > 0
    ? (nafRatio + postalRatio) / 2
    : Math.max(nafRatio, postalRatio);
  const tooOldRatio = rawCompanies > 0 ? tooOldCount / rawCompanies : 0;
  const yieldPercent = rawCompanies > 0 ? (resultCount / rawCompanies) * 100 : 0;
  const cost = requestsAttempted > 0
    ? `${requestsAttempted} credits Pappers consommes • rendement utile ${yieldPercent.toFixed(yieldPercent >= 10 ? 0 : 1)}%`
    : 'Consommation Pappers non remontee';

  if (requestsAttempted === 0) {
    return {
      label: 'Historique incomplet',
      color: '#92400E',
      backgroundColor: '#FEF3C7',
      summary: 'Le scan ne remonte pas encore son volume d appels. La lecture de rentabilite est donc partielle.',
      cost,
      action: 'Ouvre plutot un scan recent pour auditer precisement cout, brut et filtrage.',
    };
  }

  if (rawCompanies === 0) {
    return {
      label: 'Marche introuvable',
      color: '#B91C1C',
      backgroundColor: '#FEE2E2',
      summary: 'Le scan a consomme des credits sans trouver de matiere brute dans ce cadrage.',
      cost,
      action: 'Elargis la zone, change de domaines ou augmente la fenetre de temps avant de relancer.',
    };
  }

  if (resultCount === 0 && tooOldRatio >= 0.7) {
    return {
      label: 'Fenetre trop courte',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
      summary: 'Le marche existe, mais la quasi-totalite des entreprises etait deja hors periode.',
      cost,
      action: maxAgeDays <= 7
        ? 'Rejoue ce meme cadrage en 30 jours pour transformer ce volume brut en leads.'
        : 'Elargis encore la periode ou conserve ce scan pour de la veille ultra-recente.',
    };
  }

  if (coverageRatio > 0 && coverageRatio < 0.45) {
    return {
      label: 'Couverture limitee',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
      summary: 'Le scan n a couvert qu une partie du terrain utile. Le resultat est donc difficile a juger tel quel.',
      cost,
      action: 'Elargis la zone ou reduis les domaines pour remonter la couverture utile avant de conclure.',
    };
  }

  if (yieldPercent < 0.5) {
    return {
      label: 'Peu rentable',
      color: '#7C2D12',
      backgroundColor: '#FED7AA',
      summary: `${rawCompanies} societes brutes ont ete vues, mais tres peu ont survécu au filtrage final.`,
      cost,
      action: 'Affine les domaines ou passe sur 30 jours pour obtenir un meilleur rendement commercial.',
    };
  }

  if (resultCount >= 5 || yieldPercent >= 1) {
    return {
      label: 'Rentable',
      color: '#047857',
      backgroundColor: '#D1FAE5',
      summary: 'Le cadrage a produit un volume exploitable sans se perdre uniquement dans le brut ou les trop anciennes.',
      cost,
      action: maxAgeDays <= 30
        ? 'Tu peux reutiliser ce cadrage ou le dupliquer sur une autre zone comparable.'
        : 'Bon cadrage de stock : utilise-le comme base de prospection ou reduis la periode pour faire de la veille.',
    };
  }

  return {
    label: 'Mitige',
    color: '#4338CA',
    backgroundColor: '#E0E7FF',
    summary: 'Le scan a sorti de la matiere, mais sans rendement franchement convaincant ni echec total.',
    cost,
    action: 'Teste une variante simple : meme zone en 30 jours, ou meme periode avec moins de domaines.',
  };
};

const resolveScanSourceKind = (
  routeSource: string | string[] | undefined,
  scanType?: string
): 'pappers' | 'web' => {
  const sourceValue = Array.isArray(routeSource) ? routeSource[0] : routeSource;
  if (sourceValue === 'pappers') {
    return 'pappers';
  }
  if (scanType === 'pappers' || scanType === 'pappers_mass') {
    return 'pappers';
  }
  return 'web';
};

const buildWebProfitabilitySummary = ({
  isWeb,
  resultCount,
  requestsUsed,
  requestsEstimated,
  leadsWithPhone,
  webEnrichedCount,
  searchQueriesCount,
  sourceQueriesPerSearch,
  activitiesSelected,
  activitiesAvailable,
  searchType,
  domainMode,
}: {
  isWeb: boolean;
  resultCount: number;
  requestsUsed: number;
  requestsEstimated: number;
  leadsWithPhone: number;
  webEnrichedCount: number;
  searchQueriesCount: number;
  sourceQueriesPerSearch: number;
  activitiesSelected: number;
  activitiesAvailable: number;
  searchType?: 'activity' | 'domain';
  domainMode?: 'quick' | 'exhaustive';
}): PappersProfitabilitySummary | null => {
  if (!isWeb) return null;

  const effectiveRequests = requestsUsed || requestsEstimated;
  const coverageRatio = activitiesSelected > 0
    ? activitiesSelected / Math.max(activitiesAvailable, activitiesSelected)
    : 0;
  const directYield = resultCount > 0 ? leadsWithPhone / resultCount : 0;
  const resultYield = effectiveRequests > 0 ? resultCount / effectiveRequests : 0;
  const cost = effectiveRequests > 0
    ? `${effectiveRequests} credits Serper consommes • ${searchQueriesCount || 0} recherches • ${sourceQueriesPerSearch || 0} source(s) par recherche`
    : 'Consommation Serper non remontee';

  if (effectiveRequests === 0) {
    return {
      label: 'Historique incomplet',
      color: '#92400E',
      backgroundColor: '#FEF3C7',
      summary: 'Le scan ne remonte pas encore son volume d appels web. La lecture de rentabilite reste partielle.',
      cost,
      action: 'Relance plutot un scan recent pour mesurer proprement le rendement web.',
    };
  }

  if (resultCount === 0) {
    return {
      label: 'Recherche a sec',
      color: '#B91C1C',
      backgroundColor: '#FEE2E2',
      summary: 'Le scan a consomme des credits sans produire de fiche exploitable.',
      cost,
      action: searchType === 'domain'
        ? 'Elargis la zone ou passe en mode exhaustif seulement si le budget le permet.'
        : 'Teste un mot-cle plus large ou active davantage de sources web.',
    };
  }

  if (searchType === 'domain' && domainMode === 'quick' && coverageRatio > 0 && coverageRatio < 0.55) {
    return {
      label: 'Couverture partielle',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
      summary: 'Le scan rapide a seulement echantillonne le domaine pour contenir le cout.',
      cost,
      action: 'Passe en mode exhaustif sur une zone prioritaire si tu veux un balayage complet.',
    };
  }

  if (leadsWithPhone === 0 && resultCount > 0) {
    return {
      label: 'Coordonnees faibles',
      color: '#B45309',
      backgroundColor: '#FEF3C7',
      summary: `${resultCount} fiches ont ete trouvees, mais aucune n est directement joignable pour l instant.`,
      cost,
      action: 'Garde ce cadrage pour le stock, puis enrichis ou filtre plus fort sur les sources directes.',
    };
  }

  if (resultYield < 0.12) {
    return {
      label: 'Peu rentable',
      color: '#7C2D12',
      backgroundColor: '#FED7AA',
      summary: `Le scan a produit ${resultCount} fiches pour ${effectiveRequests} credits, avec un rendement encore faible.`,
      cost,
      action: 'Reduis les sources, cible mieux le mot-cle ou concentre ce scan sur des zones plus chaudes.',
    };
  }

  if (leadsWithPhone >= 5 || directYield >= 0.45 || webEnrichedCount >= 5) {
    return {
      label: 'Rentable',
      color: '#047857',
      backgroundColor: '#D1FAE5',
      summary: 'Le scan a sorti un volume utile de fiches joignables ou bien enrichies.',
      cost,
      action: 'Tu peux reutiliser ce cadrage ou le dupliquer sur une zone comparable.',
    };
  }

  return {
    label: 'Bon test commercial',
    color: '#4338CA',
    backgroundColor: '#E0E7FF',
    summary: 'Le scan a produit de la matiere exploitable sans etre encore un cadrage de reference.',
    cost,
    action: 'Duplique ce scan avec un domaine voisin ou une zone proche pour confirmer le potentiel.',
  };
};

const CONTACT_MODE_META: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  appel: { label: 'À appeler', color: '#047857', bg: '#D1FAE5', icon: 'call-outline' },
  visite: { label: 'À visiter', color: '#7C3AED', bg: '#EDE9FE', icon: 'walk-outline' },
  creuser: { label: 'À creuser', color: '#B45309', bg: '#FEF3C7', icon: 'search-outline' },
  verifier: { label: 'À vérifier', color: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' },
};

const REBOUND_META = {
  color: '#1D4ED8',
  bg: '#DBEAFE',
  label: 'Rebond',
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

type PJState = 'present' | 'absent' | 'unknown';

export default function ResultsScreen() {
  const router = useRouter();
  const {
    scanId,
    source,
    cityLabel,
    radiusKm,
    maxAgeDays,
    dateLabel,
    totalFound,
    visiteCount,
    leadCount,
    newResultsCount,
    reusedResultsCount,
    rawCompaniesReceived,
    requestsAttempted,
    skippedTooOldCount,
    nafScanned,
    nafAvailable,
    postalScanned,
    postalAvailable,
  } = useLocalSearchParams();
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [unverifiedBusinesses, setUnverifiedBusinesses] = useState<Business[]>([]);
  const [visiteTerrainBusinesses, setVisiteTerrainBusinesses] = useState<Business[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState<Business[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [includeClients, setIncludeClients] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('verified');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [listFocusMode, setListFocusMode] = useState(true);
  const autoSelectedViewScanRef = React.useRef<string | null>(null);

  const currentViewCount = useMemo(() => {
    if (viewMode === 'verified') return businesses.length;
    if (viewMode === 'unverified') return unverifiedBusinesses.length;
    return visiteTerrainBusinesses.length;
  }, [businesses.length, unverifiedBusinesses.length, visiteTerrainBusinesses.length, viewMode]);

  const registeredTotal = useMemo(
    () => stats?.total ?? (businesses.length + unverifiedBusinesses.length + visiteTerrainBusinesses.length),
    [businesses.length, stats?.total, unverifiedBusinesses.length, visiteTerrainBusinesses.length]
  );

  const sourceKind = useMemo(
    () => resolveScanSourceKind(source, scanMeta?.scan_type),
    [scanMeta?.scan_type, source]
  );

  const scanSummary = useMemo(() => {
    const diagnostics = scanMeta?.scan_diagnostics || {};
    const zone = buildZoneLabel(
      cityLabel || scanMeta?.location_label,
      radiusKm || scanMeta?.radius_km
    );
    const isPappersSource = sourceKind === 'pappers';
    const sourceLabel = isPappersSource ? 'Scan Pappers+' : 'Scan Tout Internet';
    const period = isPappersSource
      ? dateLabel || ((maxAgeDays || scanMeta?.max_age_days) ? `${maxAgeDays || scanMeta?.max_age_days} jours` : 'Periode non precisee')
      : scanMeta?.search_type === 'domain'
        ? `Recherche web • Domaine ${scanMeta?.domain_mode === 'exhaustive' ? 'exhaustif' : 'rapide'}`
        : 'Recherche web • Activite ciblee';
    const parsedTotalFound = Number(totalFound || scanMeta?.total_results || scanMeta?.result_count || 0);
    const parsedVisiteCount = Number(visiteCount || scanMeta?.visite_terrain_count || 0);
    const parsedLeadCount = Number(leadCount || scanMeta?.lead_count || scanMeta?.leads_with_phone || 0);
    const parsedNewResultsCount = Number(newResultsCount || scanMeta?.new_results_count || 0);
    const parsedReusedResultsCount = Number(reusedResultsCount || scanMeta?.reused_results_count || 0);
    const parsedRawCompaniesReceived = Number(rawCompaniesReceived || diagnostics.raw_companies_received || 0);
    const parsedRequestsAttempted = Number(
      requestsAttempted ||
      diagnostics.requests_attempted ||
      diagnostics.serper_requests_used ||
      scanMeta?.scan_diagnostics?.serper_requests_used ||
      scanMeta?.scan_diagnostics?.serper_requests_estimated ||
      0
    );
    const parsedSkippedTooOldCount = Number(skippedTooOldCount || diagnostics.skipped_too_old_count || 0);
    const parsedNafScanned = Number(nafScanned || diagnostics.naf_scanned || 0);
    const parsedNafAvailable = Number(nafAvailable || diagnostics.naf_available || 0);
    const parsedPostalScanned = Number(postalScanned || diagnostics.postal_scanned || 0);
    const parsedPostalAvailable = Number(postalAvailable || diagnostics.postal_available || 0);
    const parsedSearchQueriesCount = Number(diagnostics.search_queries_count || 0);
    const parsedSourceQueriesPerSearch = Number(diagnostics.source_queries_per_search || 0);
    const parsedActivitiesSelected = Number(diagnostics.activities_selected || 0);
    const parsedActivitiesAvailable = Number(diagnostics.activities_available || 0);
    const parsedWebEnrichedCount = Number(scanMeta?.web_enriched_count || 0);
    const coverage = isPappersSource
      ? parsedNafScanned > 0 && parsedPostalScanned > 0
        ? `${parsedNafScanned}/${Math.max(parsedNafAvailable, parsedNafScanned)} NAF • ${parsedPostalScanned}/${Math.max(parsedPostalAvailable, parsedPostalScanned)} CP`
        : 'Couverture non remontee'
      : parsedActivitiesSelected > 0
        ? `${parsedActivitiesSelected}/${Math.max(parsedActivitiesAvailable, parsedActivitiesSelected)} activites • ${parsedSearchQueriesCount} recherches`
        : parsedSearchQueriesCount > 0
          ? `${parsedSearchQueriesCount} recherches • ${parsedSourceQueriesPerSearch} sources`
          : 'Couverture web non remontee';
    const fallbackVisiteCount = visiteTerrainBusinesses.length;
    const fallbackLeadCount = [...businesses, ...unverifiedBusinesses].filter((business) => !!business.phone).length;
    const effectiveResultCount = parsedTotalFound > 0 ? parsedTotalFound : registeredTotal;
    const resultMix = parsedTotalFound > 0
      ? isPappersSource
        ? `${parsedTotalFound} trouves • ${parsedNewResultsCount} nouveaux • ${parsedReusedResultsCount} deja connus • ${parsedVisiteCount} terrain • ${parsedLeadCount} joignables`
        : `${parsedTotalFound} trouves • ${parsedLeadCount} joignables • ${parsedWebEnrichedCount} enrichis web • ${parsedVisiteCount} terrain`
      : registeredTotal > 0
        ? `${registeredTotal} enregistres • ${fallbackVisiteCount} terrain • ${fallbackLeadCount} joignables`
        : 'Aucun resultat enregistre';
    const diagnosticMix = isPappersSource
      ? parsedRawCompaniesReceived > 0
        ? `${parsedRawCompaniesReceived} societes brutes • ${parsedSkippedTooOldCount} trop anciennes • ${parsedRequestsAttempted} requetes`
        : ''
      : parsedSearchQueriesCount > 0
        ? `${parsedSearchQueriesCount} recherches • ${parsedSourceQueriesPerSearch} sources • ${parsedRequestsAttempted} credits Serper`
        : parsedRequestsAttempted > 0
          ? `${parsedRequestsAttempted} credits Serper consommes`
          : '';
    const profitabilitySummary = isPappersSource
      ? buildPappersProfitabilitySummary({
          isPappers: isPappersSource,
          resultCount: effectiveResultCount,
          rawCompanies: parsedRawCompaniesReceived,
          tooOldCount: parsedSkippedTooOldCount,
          requestsAttempted: parsedRequestsAttempted,
          nafScanned: parsedNafScanned,
          nafAvailable: parsedNafAvailable,
          postalScanned: parsedPostalScanned,
          postalAvailable: parsedPostalAvailable,
          maxAgeDays: Number(maxAgeDays || 0),
        })
      : buildWebProfitabilitySummary({
          isWeb: !isPappersSource,
          resultCount: effectiveResultCount,
          requestsUsed: Number(diagnostics.serper_requests_used || 0),
          requestsEstimated: Number(diagnostics.serper_requests_estimated || parsedRequestsAttempted || 0),
          leadsWithPhone: parsedLeadCount,
          webEnrichedCount: parsedWebEnrichedCount,
          searchQueriesCount: parsedSearchQueriesCount,
          sourceQueriesPerSearch: parsedSourceQueriesPerSearch,
          activitiesSelected: parsedActivitiesSelected,
          activitiesAvailable: parsedActivitiesAvailable,
          searchType: scanMeta?.search_type,
          domainMode: scanMeta?.domain_mode,
        });
    return {
      sourceKind,
      zone,
      period,
      sourceLabel,
      coverage,
      resultMix,
      diagnosticMix,
      profitabilitySummary,
    };
  }, [
    businesses,
    cityLabel,
    dateLabel,
    leadCount,
    maxAgeDays,
    nafAvailable,
    nafScanned,
    newResultsCount,
    postalAvailable,
    postalScanned,
    radiusKm,
    rawCompaniesReceived,
    registeredTotal,
    requestsAttempted,
    reusedResultsCount,
    scanMeta,
    skippedTooOldCount,
    sourceKind,
    totalFound,
    unverifiedBusinesses,
    visiteCount,
    visiteTerrainBusinesses.length,
  ]);

  const currentViewLabel = useMemo(
    () => (viewMode === 'verified' ? 'Vérifiés' : viewMode === 'unverified' ? 'À vérifier' : 'Terrain'),
    [viewMode]
  );

  useEffect(() => {
    loadBusinesses();
  }, [includeClients, scanId]);

  useEffect(() => {
    autoSelectedViewScanRef.current = null;
    setLoading(true);
    setBusinesses([]);
    setUnverifiedBusinesses([]);
    setVisiteTerrainBusinesses([]);
    setFilteredBusinesses([]);
    setStats(null);
    setScanMeta(null);
    setActiveFilter('all');
    setViewMode('verified');
  }, [scanId]);

  useEffect(() => {
    applyFilter();
  }, [businesses, unverifiedBusinesses, visiteTerrainBusinesses, activeFilter, viewMode]);

  const getEmptyStateMessage = () => {
    if (activeFilter !== 'all') {
      return {
        title: 'Aucun résultat pour ce filtre',
        subtitle: 'Essaie un autre filtre ou repasse sur "Tous".',
      };
    }

    if (sourceKind === 'pappers') {
      const zone = buildZoneLabel(cityLabel || scanMeta?.location_label, radiusKm || scanMeta?.radius_km);
      const period = dateLabel || ((maxAgeDays || scanMeta?.max_age_days) ? `${maxAgeDays || scanMeta?.max_age_days} jours` : 'la période choisie');
      return {
        title: 'Aucune entreprise trouvée pour ce scan',
        subtitle: `Zone : ${zone}. Période : ${period}. Essaie 30 jours, 12 mois ou un rayon plus large.`,
      };
    }

    return {
      title: 'Aucun établissement',
      subtitle: 'Lance un nouveau scan pour afficher des résultats.',
    };
  };

  const applyFilter = () => {
    // Choose the source list based on view mode
    let sourceList: Business[] = [];
    if (viewMode === 'verified') {
      sourceList = [...businesses];
    } else if (viewMode === 'unverified') {
      sourceList = [...unverifiedBusinesses];
    } else {
      sourceList = [...visiteTerrainBusinesses];
    }
    let filtered = sourceList;
    
    switch (activeFilter) {
      case 'no_pj':
        filtered = sourceList.filter((business) => getPJState(business) === 'absent');
        break;
      case 'no_website':
        filtered = sourceList.filter(b => !b.has_website && !b.website_url);
        break;
      case 'low_reviews':
        filtered = sourceList.filter(b => (b.google_reviews_count || 0) < 5);
        break;
      case 'opportunity_max':
        filtered = sourceList.filter(b => isOpportunityMax(b));
        break;
      case 'new':
        filtered = sourceList.filter(b => b.is_new_in_scan);
        break;
      case 'rebound':
        filtered = sourceList.filter(b => !!b.related_clue_potential);
        break;
      case 'fragile':
        filtered = sourceList.filter(b => b.contact_route === 'fragile');
        break;
      case 'visite_terrain':
        filtered = sourceList.filter(b => b.lead_type === 'visite_terrain' || (!b.phone && b.address));
        break;
      case 'pappers':
        filtered = sourceList.filter(b => b.source === 'pappers');
        break;
      default:
        filtered = sourceList;
    }

    const sortedBusinesses = [...filtered].sort((left, right) => {
      const leftDate = left.date_creation ? new Date(left.date_creation).getTime() : 0;
      const rightDate = right.date_creation ? new Date(right.date_creation).getTime() : 0;

      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }

      const leftScore = left.solocal_priority_score ?? left.score ?? 0;
      const rightScore = right.solocal_priority_score ?? right.score ?? 0;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return (left.name || '').localeCompare(right.name || '');
    });

    setFilteredBusinesses(sortedBusinesses);
  };

  // Determine if business is a "max opportunity"
  const isOpportunityMax = (b: Business): boolean => {
    const noPJ = getPJState(b) === 'absent';
    const lowVisibility = (b.google_reviews_count || 0) < 5;
    const hasPhone = !!b.phone;
    const isPappers = b.source === 'pappers';
    return (noPJ && lowVisibility && hasPhone) || (isPappers && noPJ);
  };

  // Determine if business needs field visit
  const isVisiteTerrain = (b: Business): boolean => {
    return b.lead_type === 'visite_terrain' || (!b.phone && !!b.address);
  };

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      const exportUrl = `${API_URL}/api/scans/${scanId}/export-csv?include_clients=${includeClients}`;
      const exportName = [
        source === 'pappers' ? 'pappers' : 'scan',
        normalizeZoneLabel(cityLabel) || 'zone',
        new Date().toISOString().split('T')[0],
      ]
        .join('_')
        .replace(/\s+/g, '_');
      
      if (typeof window !== 'undefined') {
        const link = document.createElement('a');
        const response = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${t}` }
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          link.href = url;
          link.download = `${exportName}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          showToast('Export CSV téléchargé.', 'success');
        } else {
          showToast('Impossible de télécharger le CSV.', 'error');
        }
      } else {
        Linking.openURL(exportUrl);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      if (Platform.OS === 'web') {
        showToast("Impossible d'exporter en CSV.", 'error');
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter en CSV');
      }
    }
  };

  const handleNewScan = () => {
    if (sourceKind === 'pappers') {
      router.push('/pappersscan');
      return;
    }
    router.push('/newscan');
  };

  const loadBusinesses = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');

      const [businessesResult, scanResult] = await Promise.allSettled([
        axios.get(
          `${API_URL}/api/scans/${scanId}/businesses`,
          {
            params: { include_clients: includeClients },
            headers: { Authorization: `Bearer ${t}` },
          }
        ),
        axios.get(
          `${API_URL}/api/scans/${scanId}`,
          {
            headers: { Authorization: `Bearer ${t}` },
          }
        ),
      ]);

      if (scanResult.status === 'fulfilled') {
        setScanMeta(scanResult.value.data || null);
      } else {
        console.error('Error loading scan meta:', scanResult.reason);
        setScanMeta(null);
      }

      if (businessesResult.status !== 'fulfilled') {
        throw businessesResult.reason;
      }

      const response = businessesResult.value;

      // Load verified businesses (main list)
      const loadedBusinesses = response.data.verified_businesses || response.data.businesses || [];
      setBusinesses(loadedBusinesses);
      
      // Load unverified businesses
      const loadedUnverified = response.data.unverified_businesses || [];
      setUnverifiedBusinesses(loadedUnverified);
      
      // Load visite terrain businesses (no phone)
      const loadedVisiteTerrain = response.data.visite_terrain_businesses || [];
      setVisiteTerrainBusinesses(loadedVisiteTerrain);

      const scanKey = Array.isArray(scanId) ? scanId[0] : scanId;
      const preferredViewMode: ViewMode =
        loadedBusinesses.length > 0
          ? 'verified'
          : loadedUnverified.length > 0
            ? 'unverified'
            : loadedVisiteTerrain.length > 0
              ? 'terrain'
              : 'verified';

      if (scanKey && autoSelectedViewScanRef.current !== scanKey) {
        setViewMode(preferredViewMode);
        autoSelectedViewScanRef.current = scanKey;
      }
      
      // Calculate enhanced stats
      const allBusinesses = [...loadedBusinesses, ...loadedUnverified, ...loadedVisiteTerrain];
      const noWebsite = allBusinesses.filter((b: Business) => !b.has_website && !b.website_url).length;
      const opportunityMax = allBusinesses.filter((b: Business) => isOpportunityMax(b)).length;
      const reboundAvailable = allBusinesses.filter((b: Business) => !!b.related_clue_potential).length;
      const fragileAvailable = allBusinesses.filter((b: Business) => b.contact_route === 'fragile').length;
      const pappersCount = allBusinesses.filter((b: Business) => b.source === 'pappers').length;
      
      setStats({
        ...response.data.stats,
        total: response.data.stats?.total || allBusinesses.length,
        total_verified: response.data.stats?.total_verified || loadedBusinesses.length,
        total_unverified: response.data.stats?.total_unverified || loadedUnverified.length,
          total_visite_terrain: response.data.stats?.total_visite_terrain || loadedVisiteTerrain.length,
            no_website: noWebsite,
            opportunity_max: opportunityMax,
            rebound_available: reboundAvailable,
            fragile_available: fragileAvailable,
            visite_terrain: loadedVisiteTerrain.length,
            pappers_count: pappersCount,
          });
    } catch (error) {
      console.error('Error loading results:', error);
      Alert.alert('Erreur', 'Impossible de charger les résultats');
    } finally {
      setLoading(false);
    }
  };

  const handleRowPress = async (item: Business) => {
    // Mark as viewed when opening detail
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${item.id}/viewed`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setBusinesses(prev => prev.map(b => 
        b.id === item.id ? { ...b, is_viewed: true } : b
      ));
    } catch (error) {
      console.log('Error marking viewed:', error);
    }
    
    router.push({
      pathname: '/businessdetail',
      params: { businessId: item.id, scanId: scanId as string },
    });
  };

  const handleToggleContacted = async (item: Business) => {
    const newStatus = item.contact_status_manual === 'contacted' ? 'not_contacted' : 'contacted';
    
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${item.id}/status`,
        { contact_status_manual: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBusinesses(prev => prev.map(b => 
        b.id === item.id ? { ...b, contact_status_manual: newStatus } : b
      ));
    } catch (error) {
      console.error('Error updating contact status:', error);
    }
  };

  const handleToggleClient = async (item: Business) => {
    const newStatus = item.client_status === 'client' ? 'not_client' : 'client';
    
    if (newStatus === 'client') {
      Alert.alert(
        'Marquer comme client ?',
        'Cet établissement sera exclu des prochains affichages par défaut.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Confirmer',
            onPress: async () => {
              try {
                await axios.patch(
                  `${API_URL}/api/businesses/${item.id}/status`,
                  { client_status: newStatus },
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                
                if (!includeClients) {
                  setBusinesses(prev => prev.filter(b => b.id !== item.id));
                } else {
                  setBusinesses(prev => prev.map(b => 
                    b.id === item.id ? { ...b, client_status: newStatus } : b
                  ));
                }
              } catch (error) {
                console.error('Error updating client status:', error);
              }
            }
          }
        ]
      );
    } else {
      try {
        await axios.patch(
          `${API_URL}/api/businesses/${item.id}/status`,
          { client_status: newStatus },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setBusinesses(prev => prev.map(b => 
          b.id === item.id ? { ...b, client_status: newStatus } : b
        ));
      } catch (error) {
        console.error('Error updating client status:', error);
      }
    }
  };

  const getPJState = (item: Business): PJState => {
    if (item.pj_manually_set) {
      return item.has_pagesjaunes ? 'present' : 'absent';
    }

    const confidence = (item.pj_confidence || '').trim().toLowerCase();
    if (confidence === 'confirmed') {
      return 'present';
    }
    if (confidence === 'not_found') {
      return 'absent';
    }
    if (item.has_pagesjaunes) {
      return 'present';
    }
    return 'unknown';
  };

  const getPJBadge = (item: Business) => {
    const pjState = getPJState(item);
    if (pjState === 'present') {
      return { emoji: '🟢', label: 'PJ', bg: '#E8F5E9' };
    }
    if (pjState === 'absent') {
      return { emoji: '🔴', label: 'PJ', bg: '#FFEBEE' };
    }
    return { emoji: '🟡', label: 'PJ?', bg: '#FFF3E0' };
  };

  const getCreationBadge = (dateCreation?: string) => {
    if (!dateCreation) {
      return null;
    }

    const createdAt = new Date(dateCreation);
    if (Number.isNaN(createdAt.getTime())) {
      return {
        label: dateCreation,
        accent: '#64748B',
        backgroundColor: '#F1F5F9',
      };
    }

    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    if (diffDays <= 30) {
      return {
        label: `Créée il y a ${diffDays || 0} j`,
        accent: '#B91C1C',
        backgroundColor: '#FEE2E2',
      };
    }

    if (diffDays <= 180) {
      return {
        label: `Créée il y a ${Math.floor(diffDays / 30)} mois`,
        accent: '#B45309',
        backgroundColor: '#FEF3C7',
      };
    }

    return {
      label: createdAt.toLocaleDateString('fr-FR'),
      accent: '#1D4ED8',
      backgroundColor: '#DBEAFE',
    };
  };

  const renderBusinessRow = ({ item }: { item: Business }) => {
    const pjState = getPJState(item);
    const pjBadge = getPJBadge(item);
      const isMaxOpp = isOpportunityMax(item);
      const creationBadge = getCreationBadge(item.date_creation);
      const contactMode = item.recommended_contact_mode ? CONTACT_MODE_META[item.recommended_contact_mode] : null;
      const contactRoute = item.contact_route ? CONTACT_ROUTE_META[item.contact_route] : null;
      const phoneReliability = item.phone_reliability_status ? PHONE_RELIABILITY_META[item.phone_reliability_status] : null;
    
    return (
      <TouchableOpacity 
        style={[
          styles.tableRow,
          item.is_new_in_scan && styles.tableRowNew,
          isMaxOpp && styles.tableRowMaxOpp,
        ]}
        onPress={() => handleRowPress(item)}
        activeOpacity={0.7}
      >
        {/* PJ Status Column - Point de couleur = statut PagesJaunes */}
        <View style={styles.cellPJStatus}>
          {/* Point PagesJaunes */}
          <View style={[
            styles.pjDot,
            pjState === 'absent' ? styles.pjDotAbsent : styles.pjDotPresent,
            pjState === 'unknown' && styles.pjDotUnknown
          ]} />
          
          {/* Max Opportunity badge */}
          {isMaxOpp && (
            <Text style={styles.badgeMaxOpp}>🔥</Text>
          )}
          
          {/* New badge */}
          {item.is_new_in_scan && !isMaxOpp && (
            <Text style={styles.badgeNewText}>🆕</Text>
          )}
        </View>

        {/* Name & City */}
        <View style={styles.cellMain}>
          <Text style={[styles.businessName, !item.is_viewed && styles.businessNameUnread]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.businessMetaRow}>
            {item.city ? (
              <View style={styles.cityBadge}>
                <Ionicons name="location-outline" size={12} color="#4F46E5" />
                <Text style={styles.cityBadgeText} numberOfLines={1}>{item.city}</Text>
              </View>
            ) : null}
            {creationBadge ? (
              <View style={[styles.creationBadge, { backgroundColor: creationBadge.backgroundColor }]}>
                <Ionicons name="calendar-outline" size={12} color={creationBadge.accent} />
                <Text style={[styles.creationBadgeText, { color: creationBadge.accent }]} numberOfLines={1}>
                  {creationBadge.label}
                </Text>
              </View>
            ) : null}
            {contactMode ? (
              <View style={[styles.contactModeBadge, { backgroundColor: contactMode.bg }]}>
                <Ionicons name={contactMode.icon} size={12} color={contactMode.color} />
                <Text style={[styles.contactModeBadgeText, { color: contactMode.color }]} numberOfLines={1}>
                  {contactMode.label}
                </Text>
              </View>
            ) : null}
          </View>
          {!!item.solocal_priority_reason && (
            <Text style={styles.priorityReasonText} numberOfLines={1}>
              {item.solocal_priority_reason}
            </Text>
          )}
            {!!item.digital_visibility_label && (
              <View style={styles.visibilityGapBadge}>
                <Ionicons name="globe-outline" size={12} color="#1D4ED8" />
                <Text style={styles.visibilityGapBadgeText} numberOfLines={1}>
                  {item.digital_visibility_label}
                </Text>
              </View>
            )}
            {contactRoute && !!item.contact_route_label && (
              <View style={[styles.contactRouteBadge, { backgroundColor: contactRoute.bg }]}>
                <Ionicons name={contactRoute.icon} size={12} color={contactRoute.color} />
                <Text style={[styles.contactRouteBadgeText, { color: contactRoute.color }]} numberOfLines={1}>
                  {item.contact_route_label}
                </Text>
              </View>
            )}
            {phoneReliability && !!item.phone_reliability_label && (
              <View style={[styles.phoneReliabilityBadge, { backgroundColor: phoneReliability.bg }]}>
                <Ionicons name={phoneReliability.icon} size={12} color={phoneReliability.color} />
                <Text style={[styles.phoneReliabilityBadgeText, { color: phoneReliability.color }]} numberOfLines={1}>
                  {item.phone_reliability_label}
                </Text>
              </View>
            )}
            {!!item.next_best_action && (
            <View style={styles.nextActionBadge}>
              <Ionicons name="flash-outline" size={12} color="#6D28D9" />
              <Text style={styles.nextActionBadgeText} numberOfLines={1}>
                {item.next_best_action}
              </Text>
            </View>
          )}
          {item.related_clue_potential && (
            <TouchableOpacity
              style={styles.reboundBadge}
              onPress={(e) => {
                e.stopPropagation?.();
                handleRowPress(item);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="git-network-outline" size={12} color={REBOUND_META.color} />
              <Text style={styles.reboundBadgeText} numberOfLines={1}>
                {item.related_clue_reason || REBOUND_META.label} • Voir
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cellPriority}>
          <View
            style={[
              styles.priorityBadge,
              (item.solocal_priority_score || 0) >= 70
                ? styles.priorityBadgeHigh
                : (item.solocal_priority_score || 0) >= 45
                  ? styles.priorityBadgeMedium
                  : styles.priorityBadgeLow,
            ]}
          >
            <Text style={styles.priorityBadgeScore}>{item.solocal_priority_score ?? 0}</Text>
            <Text style={styles.priorityBadgeLabel} numberOfLines={1}>
              {item.solocal_priority_label || 'Priorité'}
            </Text>
          </View>
        </View>

        {/* Phone with Quality Indicator (or address for visite terrain) */}
        <View style={styles.cellPhone}>
          {item.phone ? (
            <View style={styles.phoneContainer}>
              {(() => {
                const phoneAnalysis = analyzePhoneQuality(item.phone);
                return (
                  <View style={[styles.phoneQualityDot, { backgroundColor: phoneAnalysis.color }]} />
                );
              })()}
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation?.();
                  Linking.openURL(`tel:${item.phone}`);
                }}
              >
                <Text style={styles.phoneText} numberOfLines={1}>
                  {item.phone}
                </Text>
              </TouchableOpacity>
            </View>
          ) : viewMode === 'visite_terrain' && item.address ? (
            <View style={styles.addressContainer}>
              <Ionicons name="location-outline" size={12} color="#9C27B0" />
              <Text style={styles.addressText} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>-</Text>
          )}
        </View>

      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>Résultats</Text>
        <TouchableOpacity
          onPress={handleNewScan}
          style={styles.newScanButton}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color="#6366F1" />
          <Text style={styles.newScanButtonText}>Nouveau scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setListFocusMode((current) => !current)}
          style={[styles.listModeButton, listFocusMode && styles.listModeButtonActive]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={listFocusMode ? 'contract-outline' : 'list-outline'}
            size={18}
            color={listFocusMode ? '#FFF' : '#6366F1'}
          />
          <Text style={[styles.listModeButtonText, listFocusMode && styles.listModeButtonTextActive]}>
            {listFocusMode ? 'Vue normale' : 'Vue liste'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={handleExportCSV}
          style={styles.exportButton}
          activeOpacity={0.7}
        >
          <Ionicons name="download-outline" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <ResultsScanSummary
        visible={!listFocusMode}
        source={scanSummary.sourceKind}
        sourceLabel={scanSummary.sourceLabel}
        zone={scanSummary.zone}
        period={scanSummary.period}
        viewLabel={currentViewLabel}
        currentViewCount={currentViewCount}
        filteredCount={filteredBusinesses.length}
        coverage={scanSummary.coverage}
        resultMix={scanSummary.resultMix}
        diagnosticMix={scanSummary.diagnosticMix}
        premiumLabel={scanSummary.profitabilitySummary?.label}
        premiumColor={scanSummary.profitabilitySummary?.color}
        premiumBackgroundColor={scanSummary.profitabilitySummary?.backgroundColor}
        premiumSummary={scanSummary.profitabilitySummary?.summary}
        premiumCost={scanSummary.profitabilitySummary?.cost}
        premiumAction={scanSummary.profitabilitySummary?.action}
        summaryExpanded={summaryExpanded}
        onToggleSummary={() => setSummaryExpanded((current) => !current)}
      />

      <ResultsOverview
        listFocusMode={listFocusMode}
        total={stats?.total || (businesses.length + unverifiedBusinesses.length + visiteTerrainBusinesses.length)}
        totalVerified={stats?.total_verified || businesses.length}
        totalUnverified={stats?.total_unverified || unverifiedBusinesses.length}
        totalVisiteTerrain={stats?.total_visite_terrain || visiteTerrainBusinesses.length}
        opportunityMax={stats?.opportunity_max || 0}
        currentViewLabel={currentViewLabel}
        currentViewCount={currentViewCount}
      />

      <ResultsViewTabs
        visible={!listFocusMode}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          setActiveFilter('all');
        }}
        verifiedCount={stats?.total_verified || businesses.length}
        unverifiedCount={stats?.total_unverified || unverifiedBusinesses.length}
        visiteTerrainCount={stats?.total_visite_terrain || visiteTerrainBusinesses.length}
      />

      <ResultsFilterBar
        visible={!listFocusMode}
        activeFilter={activeFilter}
        onChangeFilter={(filter) => setActiveFilter(filter as FilterType)}
        totalCurrentView={viewMode === 'verified' ? businesses.length : viewMode === 'unverified' ? unverifiedBusinesses.length : visiteTerrainBusinesses.length}
        includeClients={includeClients}
        onToggleIncludeClients={setIncludeClients}
        stats={stats}
      />

      {/* Table Header */}
      <View style={[styles.tableHeader, listFocusMode && styles.tableHeaderFocused]}>
        <Text style={styles.headerCellPJStatus}>PJ</Text>
        <Text style={styles.headerCellMain}>Établissement</Text>
        <Text style={styles.headerCellPriority}>Priorité</Text>
        <Text style={styles.headerCellPhone}>Téléphone</Text>
      </View>

      {/* Business List */}
      {filteredBusinesses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color="#999" />
          <Text style={styles.emptyStateText}>{getEmptyStateMessage().title}</Text>
          <Text style={styles.emptyStateSubtext}>{getEmptyStateMessage().subtitle}</Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity style={styles.emptyPrimaryAction} onPress={handleNewScan}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={styles.emptyPrimaryActionText}>Lancer un nouveau scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emptySecondaryAction}
              onPress={() => {
                setActiveFilter('all');
                setViewMode('verified');
              }}
            >
              <Text style={styles.emptySecondaryActionText}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredBusinesses}
          keyExtractor={(item) => item.id}
          renderItem={renderBusinessRow}
          contentContainerStyle={styles.tableBody}
          style={listFocusMode ? styles.resultsListFocused : undefined}
        />
      )}
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  scanSummaryCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EAF4',
  },
  scanSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  scanSummaryHeaderMain: {
    flex: 1,
    gap: 10,
  },
  scanSummaryHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  scanSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scanSummaryBadgeText: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '700',
  },
  scanSummaryCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  scanSummaryHero: {
    gap: 10,
  },
  scanSummaryHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scanSummaryHeroSubtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  scanSummaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scanSummaryToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  scanSummaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scanSummaryPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 180,
    flexGrow: 1,
  },
  scanSummaryPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  scanSummaryPillValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  scanSummaryDetails: {
    marginTop: 12,
    gap: 10,
  },
  scanSummaryItem: {
    gap: 4,
  },
  scanSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  scanSummaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  listModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  listModeButtonActive: {
    backgroundColor: '#6366F1',
  },
  listModeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6366F1',
  },
  listModeButtonTextActive: {
    color: '#FFF',
  },
  listFocusBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#D9E2FF',
  },
  listFocusBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3730A3',
    marginBottom: 4,
  },
  listFocusBannerText: {
    fontSize: 13,
    color: '#475569',
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  filterBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  filterBadgeNew: {
    backgroundColor: '#E8F5E9',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C62828',
  },
  filterBadgeTextNew: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  filterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
  },
  filterSwitch: {
    transform: [{ scale: 0.8 }],
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#6366F1',
  },
  tableHeaderFocused: {
    marginTop: 4,
  },
  headerCellPJStatus: {
    width: 60,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerCellMain: {
    flex: 3,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerCellPhone: {
    flex: 2,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerCellPriority: {
    width: 92,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  tableBody: {
    paddingBottom: 20,
  },
  resultsListFocused: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tableRowNew: {
    backgroundColor: '#F1F8E9',
    borderLeftWidth: 3,
    borderLeftColor: '#8BC34A',
  },
  tableRowClient: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  tableRowMaxOpp: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  badgeMaxOpp: {
    fontSize: 12,
  },
  cellPJStatus: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pjDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pjDotAbsent: {
    backgroundColor: '#F44336',
  },
  pjDotPresent: {
    backgroundColor: '#4CAF50',
  },
  pjDotUnknown: {
    backgroundColor: '#FFC107',
  },
  cellStatus: {
    width: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotUnread: {
    backgroundColor: '#007AFF',
  },
  statusDotViewed: {
    backgroundColor: '#C7C7CC',
  },
  badgeNew: {
    marginRight: 2,
  },
  badgeNewText: {
    fontSize: 10,
  },
  cellMain: {
    flex: 3,
    paddingRight: 8,
  },
  businessName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  businessNameUnread: {
    fontWeight: '700',
  },
  businessMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  cityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  cityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  creationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  creationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contactModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  contactModeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  priorityReasonText: {
    marginTop: 6,
    fontSize: 11,
    color: '#6B7280',
  },
  visibilityGapBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },
  visibilityGapBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  contactRouteBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  contactRouteBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  phoneReliabilityBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  phoneReliabilityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nextActionBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F5F3FF',
  },
  nextActionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  reboundBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: REBOUND_META.bg,
  },
  reboundBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: REBOUND_META.color,
  },
  cellPriority: {
    width: 92,
    alignItems: 'center',
    paddingRight: 8,
  },
  priorityBadge: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  priorityBadgeHigh: {
    backgroundColor: '#DCFCE7',
  },
  priorityBadgeMedium: {
    backgroundColor: '#FEF3C7',
  },
  priorityBadgeLow: {
    backgroundColor: '#F3F4F6',
  },
  priorityBadgeScore: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  priorityBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },
  cellPhone: {
    flex: 2,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneQualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  phoneText: {
    fontSize: 13,
    color: '#007AFF',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    fontSize: 12,
    color: '#9C27B0',
    maxWidth: 100,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
  },
  cellPJ: {
    width: 40,
    alignItems: 'center',
  },
  pjBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pjBadgeText: {
    fontSize: 12,
  },
  cellActions: {
    width: 70,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonContacted: {
    backgroundColor: '#34C759',
  },
  actionButtonClient: {
    backgroundColor: '#FF9800',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
  },
  emptyActions: {
    marginTop: 20,
    gap: 10,
    width: '100%',
    maxWidth: 320,
  },
  emptyPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyPrimaryActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySecondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#EEF2FF',
  },
  emptySecondaryActionText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '700',
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  statsTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  statsDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    fontSize: 13,
    color: '#666',
  },
  filterScroll: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    minHeight: 70,
  },
  filterContainer: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 70,
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D0D0D0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterPillActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterPillMax: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FF9800',
    borderWidth: 2,
  },
  filterPillMaxActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  filterPillRed: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
    borderWidth: 2,
  },
  filterPillRedActive: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  filterPillGreen: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  filterPillGreenActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterPillBlue: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  filterPillBlueActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  filterPillAmber: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
    borderWidth: 2,
  },
  filterPillAmberActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  filterPillPurple: {
    backgroundColor: '#F3E5F5',
    borderColor: '#9C27B0',
    borderWidth: 2,
  },
  filterPillPurpleActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  filterPillTextMax: {
    color: '#E65100',
    fontWeight: '800',
  },
  filterPillTextRed: {
    color: '#C62828',
    fontWeight: '800',
  },
  filterPillTextGreen: {
    color: '#2E7D32',
    fontWeight: '800',
  },
  filterPillTextBlue: {
    color: '#1565C0',
    fontWeight: '800',
  },
  filterPillTextAmber: {
    color: '#92400E',
    fontWeight: '800',
  },
  filterPillTextPurple: {
    color: '#7B1FA2',
    fontWeight: '800',
  },
  clientToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  clientToggleLabel: {
    fontSize: 14,
    color: '#666',
  },
  legendEmoji: {
    fontSize: 12,
  },
  exportButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  newScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    marginRight: 8,
  },
  newScanButtonText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '700',
  },
  // View Mode Tabs styles
  viewModeTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  viewModeTabActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  viewModeTabUnverified: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  viewModeTabUnverifiedActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  viewModeTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
  },
  viewModeTabTextUnverified: {
    color: '#E65100',
  },
  viewModeTabTextActive: {
    color: '#FFF',
  },
  viewModeTabVisiteTerrain: {
    backgroundColor: '#F3E5F5',
    borderColor: '#9C27B0',
  },
  viewModeTabVisiteTerrainActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  viewModeTabTextVisiteTerrain: {
    color: '#7B1FA2',
  },
  // Stats breakdown styles
  statsBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statsBreakdownItem: {
    fontSize: 13,
    color: '#666',
  },
  statsBreakdownSep: {
    fontSize: 13,
    color: '#CCC',
    marginHorizontal: 8,
  },
  statsVerified: {
    fontWeight: '700',
    color: '#4CAF50',
  },
  statsUnverified: {
    fontWeight: '700',
    color: '#FF9800',
  },
  statsVisiteTerrain: {
    fontWeight: '700',
    color: '#9C27B0',
  },
});
