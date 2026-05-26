import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

import { API_URL, buildApiUrl } from '../utils/api';
import { formatServerDateTime } from '../utils/dates';

type AuditStatus = 'queued' | 'processing' | 'done' | 'failed';

interface AuditSummary {
  id: string;
  status: AuditStatus;
  location: string;
  radius_km: number;
  query_label?: string;
  selected_domains?: string[];
  selected_domain_labels?: string[];
  created_at: string;
  completed_at?: string;
  progress?: number;
  progress_message?: string;
  progress_step?: number;
  progress_total_steps?: number;
  result_count?: number;
  summary?: Record<string, any>;
}

interface AuditResultRow {
  name: string;
  address: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  website_host?: string;
  provider_status?: string;
  provider_name?: string;
  provider_confidence?: string;
  provider_reason?: string;
  domain_registered_at?: string;
  site_age_days?: number;
  site_age_label?: string;
  google_rating?: number;
  google_reviews_count?: number;
  distance_km?: number;
  matched_activities?: string[];
  search_locations?: string[];
  search_sources?: string[];
}

interface AuditDetail extends AuditSummary {
  results: AuditResultRow[];
  results_offset: number;
  results_limit: number;
  has_more_results: boolean;
}

interface CitySuggestion {
  nom?: string;
  name?: string;
  code?: string;
  codeDepartement?: string;
  department_code?: string;
}

const DOMAIN_OPTIONS = [
  { id: 'habitat', label: 'Habitat', icon: 'home-outline', description: 'Artisans habitat et travaux' },
  { id: 'commerce', label: 'Commerce', icon: 'storefront-outline', description: 'Commerces de proximite' },
  { id: 'restauration', label: 'Restauration', icon: 'restaurant-outline', description: 'Restaurants et restauration rapide' },
  { id: 'auto', label: 'Auto/Moto', icon: 'car-outline', description: 'Garages, carrosserie, auto-ecole' },
  { id: 'beaute', label: 'Beaute', icon: 'sparkles-outline', description: 'Coiffure, esthetique, spa' },
  { id: 'sante', label: 'Sante', icon: 'medkit-outline', description: 'Professions de sante' },
  { id: 'services', label: 'Services', icon: 'briefcase-outline', description: 'Services B2B et proximite' },
  { id: 'tech', label: 'Tech/Digital', icon: 'desktop-outline', description: 'Agences et prestations digitales' },
];

const ALL_DOMAIN_IDS = DOMAIN_OPTIONS.map((option) => option.id);
const RESULT_PAGE_SIZE = 200;

const getAuditStatusPresentation = (status: AuditStatus, progress?: number) => {
  if (status === 'processing') {
    return {
      label: typeof progress === 'number' ? `En cours (${progress}%)` : 'En cours',
      color: '#1D4ED8',
      backgroundColor: '#DBEAFE',
    };
  }
  if (status === 'done') {
    return {
      label: 'Termine',
      color: '#047857',
      backgroundColor: '#D1FAE5',
    };
  }
  if (status === 'failed') {
    return {
      label: 'Interrompu',
      color: '#B91C1C',
      backgroundColor: '#FEE2E2',
    };
  }
  return {
    label: 'En attente',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
  };
};

const formatDomainSelection = (selectedDomains: string[]) => {
  if (!selectedDomains.length || selectedDomains.length === ALL_DOMAIN_IDS.length) {
    return 'Tous les domaines';
  }
  return DOMAIN_OPTIONS.filter((option) => selectedDomains.includes(option.id))
    .map((option) => option.label)
    .join(', ');
};

export default function AuditSiteExterneScreen() {
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState('20');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloadingExport, setDownloadingExport] = useState(false);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<AuditDetail | null>(null);
  const [results, setResults] = useState<AuditResultRow[]>([]);
  const [hasMoreResults, setHasMoreResults] = useState(false);

  const selectedRadius = useMemo(() => {
    const parsed = parseInt(radiusKm, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 20;
    return Math.min(parsed, 300);
  }, [radiusKm]);

  const domainSelectionLabel = formatDomainSelection(selectedDomains);

  useEffect(() => {
    loadAuditHistory();
  }, []);

  useEffect(() => {
    const searchCities = async () => {
      if (location.trim().length < 2) {
        setCitySuggestions([]);
        return;
      }
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(location)}&fields=nom,codeDepartement&boost=population&limit=5`
        );
        const data = await response.json();
        setCitySuggestions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('External audit city search error:', error);
        setCitySuggestions([]);
      }
    };

    const timer = setTimeout(searchCities, 250);
    return () => clearTimeout(timer);
  }, [location]);

  useEffect(() => {
    if (!selectedAuditId || !selectedAudit || !['queued', 'processing'].includes(selectedAudit.status)) {
      return;
    }

    const timer = setTimeout(() => {
      loadAuditDetail(selectedAuditId, { offset: 0, append: false, silent: true });
      loadAuditHistory(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [selectedAuditId, selectedAudit]);

  const loadAuditHistory = async (silent = false) => {
    if (!silent) {
      setLoadingHistory(true);
    }
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setAudits([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/external-site-audits?limit=12`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextAudits = Array.isArray(response.data) ? response.data : [];
      setAudits(nextAudits);

      if (!selectedAuditId && nextAudits.length > 0) {
        const firstAuditId = nextAudits[0]?.id;
        if (firstAuditId) {
          setSelectedAuditId(firstAuditId);
          await loadAuditDetail(firstAuditId, { offset: 0, append: false, silent: true });
        }
      }
    } catch (error) {
      console.error('External audit history error:', error);
      if (!silent) {
        Alert.alert('Erreur', "Impossible de charger l'historique des audits site externe.");
      }
    } finally {
      if (!silent) {
        setLoadingHistory(false);
      }
    }
  };

  const loadAuditDetail = async (
    auditId: string,
    options?: { offset?: number; append?: boolean; silent?: boolean }
  ) => {
    const offset = options?.offset ?? 0;
    const append = options?.append ?? false;
    const silent = options?.silent ?? false;

    if (append) {
      setLoadingMore(true);
    } else if (!silent) {
      setLoadingDetail(true);
    }

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(
        `${API_URL}/api/external-site-audits/${auditId}?offset=${offset}&limit=${RESULT_PAGE_SIZE}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const detail = response.data as AuditDetail;
      setSelectedAuditId(auditId);
      setSelectedAudit(detail);
      setHasMoreResults(Boolean(detail.has_more_results));
      setResults((current) => (append ? [...current, ...(detail.results || [])] : detail.results || []));
    } catch (error) {
      console.error('External audit detail error:', error);
      if (!silent) {
        Alert.alert('Erreur', "Impossible d'ouvrir cet audit site externe.");
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else if (!silent) {
        setLoadingDetail(false);
      }
    }
  };

  const handleToggleDomain = (domainId: string) => {
    setSelectedDomains((current) =>
      current.includes(domainId) ? current.filter((value) => value !== domainId) : [...current, domainId]
    );
  };

  const handleToggleAllDomains = () => {
    setSelectedDomains((current) => (current.length === 0 ? [...ALL_DOMAIN_IDS] : []));
  };

  const handleStartAudit = async () => {
    if (!location.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner une ville ou un secteur de depart.');
      return;
    }

    setLoadingStart(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const payload = {
        location: location.trim(),
        radius_km: selectedRadius,
        selected_domains: selectedDomains,
      };

      const response = await axios.post(`${API_URL}/api/external-site-audits`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const auditId = response.data?.audit_id;
      if (!auditId) {
        throw new Error('Identifiant audit manquant');
      }

      await loadAuditHistory(true);
      await loadAuditDetail(auditId, { offset: 0, append: false, silent: true });
      Alert.alert(
        'Audit lance',
        "L'audit site externe tourne en arriere-plan. Tu peux deja suivre sa progression ici."
      );
    } catch (error: any) {
      console.error('External audit launch error:', error);
      Alert.alert(
        'Erreur',
        error?.response?.data?.detail || "Impossible de lancer l'audit site externe."
      );
    } finally {
      setLoadingStart(false);
    }
  };

  const handleLoadMore = async () => {
    if (!selectedAuditId || !hasMoreResults || loadingMore || !selectedAudit) {
      return;
    }
    await loadAuditDetail(selectedAuditId, {
      offset: results.length,
      append: true,
      silent: true,
    });
  };

  const handleExportXlsx = async () => {
    if (!selectedAuditId || !selectedAudit || selectedAudit.status !== 'done') {
      return;
    }

    setDownloadingExport(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(buildApiUrl(`/api/external-site-audits/${selectedAuditId}/export/xlsx`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.text();
        throw new Error(payload || 'Export indisponible');
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        const headerName = response.headers.get('Content-Disposition') || '';
        const match = /filename=\"?([^\";]+)\"?/i.exec(headerName);
        link.download = match?.[1] || 'audit_site_externe.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
      }

      Alert.alert('Export pret', "L'export Excel est disponible sur la version web de l'application.");
    } catch (error: any) {
      console.error('External audit export error:', error);
      Alert.alert('Erreur', "Impossible d'exporter l'audit en Excel.");
    } finally {
      setDownloadingExport(false);
    }
  };

  const openWebsite = async (url?: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Open website error:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir ce site.");
    }
  };

  const callPhone = async (phone?: string) => {
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
    } catch (error) {
      console.error('Call phone error:', error);
      Alert.alert('Info', `Numero a appeler : ${phone}`);
    }
  };

  const emailLead = async (email?: string) => {
    if (!email) return;
    try {
      await Linking.openURL(`mailto:${email}`);
    } catch (error) {
      console.error('Mail lead error:', error);
      Alert.alert('Info', `Adresse email : ${email}`);
    }
  };

  const renderAuditResult = ({ item }: { item: AuditResultRow }) => (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultTitleWrap}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultMeta}>
            {(item.city || 'Localite inconnue')}{item.distance_km !== undefined ? ` - ${item.distance_km} km` : ''}
          </Text>
        </View>
        <View style={styles.providerBadge}>
          <Text style={styles.providerBadgeText}>{item.provider_name || 'Prestataire externe'}</Text>
        </View>
      </View>

      <Text style={styles.resultAddress}>{item.address || 'Adresse non remontee'}</Text>

      <View style={styles.infoGrid}>
        <View style={styles.infoPill}>
          <Ionicons name="globe-outline" size={14} color="#4F46E5" />
          <Text style={styles.infoPillText}>{item.website_host || 'Site externe'}</Text>
        </View>
        <View style={styles.infoPill}>
          <Ionicons name="time-outline" size={14} color="#047857" />
          <Text style={styles.infoPillText}>{item.site_age_label || 'Age inconnu'}</Text>
        </View>
        <View style={styles.infoPill}>
          <Ionicons name="star-outline" size={14} color="#B45309" />
          <Text style={styles.infoPillText}>
            {item.google_rating ? `${item.google_rating} (${item.google_reviews_count || 0})` : 'Google sans note'}
          </Text>
        </View>
      </View>

      {!!item.matched_activities?.length && (
        <Text style={styles.resultReason} numberOfLines={2}>
          Activites : {item.matched_activities.join(', ')}
        </Text>
      )}
      {!!item.provider_reason && (
        <Text style={styles.resultReason} numberOfLines={2}>
          Detection : {item.provider_reason}
        </Text>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, !item.website_url && styles.actionButtonDisabled]}
          disabled={!item.website_url}
          onPress={() => openWebsite(item.website_url)}
        >
          <Ionicons name="open-outline" size={14} color={item.website_url ? '#4F46E5' : '#94A3B8'} />
          <Text style={[styles.actionButtonText, !item.website_url && styles.actionButtonTextDisabled]}>Site</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, !item.phone && styles.actionButtonDisabled]}
          disabled={!item.phone}
          onPress={() => callPhone(item.phone)}
        >
          <Ionicons name="call-outline" size={14} color={item.phone ? '#047857' : '#94A3B8'} />
          <Text style={[styles.actionButtonText, !item.phone && styles.actionButtonTextDisabled]}>Appeler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, !item.email && styles.actionButtonDisabled]}
          disabled={!item.email}
          onPress={() => emailLead(item.email)}
        >
          <Ionicons name="mail-outline" size={14} color={item.email ? '#B45309' : '#94A3B8'} />
          <Text style={[styles.actionButtonText, !item.email && styles.actionButtonTextDisabled]}>Email</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.screenContent}>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Audit site externe</Text>
        <Text style={styles.heroSubtitle}>
          Fonction separee du scan Tout Internet pour identifier les pros equipes d'un site concurrent, sur une zone et un domaine d'activite donnes.
        </Text>
        <View style={styles.heroCallout}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#4F46E5" />
          <Text style={styles.heroCalloutText}>
            Aucun plafond de resultats n est impose par l app. La seule vraie limite pilotee ici est la zone geographique que tu definis.
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Lancer un audit</Text>
        <Text style={styles.panelSubtitle}>
          Choisis une ville de depart, un rayon kilometrique et les domaines a couvrir.
        </Text>

        <Text style={styles.fieldLabel}>Ville ou secteur de depart</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Ex: Lille, Rouen, Le Havre..."
          style={styles.input}
          placeholderTextColor="#94A3B8"
        />

        {citySuggestions.length > 0 && (
          <View style={styles.suggestionsCard}>
            {citySuggestions.map((suggestion, index) => {
              const cityLabel = suggestion.nom || suggestion.name || '';
              const dept = suggestion.codeDepartement || suggestion.department_code || suggestion.code || '';
              return (
                <TouchableOpacity
                  key={`${cityLabel}-${dept}-${index}`}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setLocation(cityLabel);
                    setCitySuggestions([]);
                  }}
                >
                  <Ionicons name="location-outline" size={16} color="#4F46E5" />
                  <Text style={styles.suggestionText}>{cityLabel} {dept ? `(${dept})` : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.fieldLabel}>Rayon kilometrique</Text>
        <View style={styles.radiusRow}>
          {[10, 20, 35, 50, 80, 120, 180].map((value) => {
            const active = selectedRadius === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.radiusChip, active && styles.radiusChipActive]}
                onPress={() => setRadiusKm(String(value))}
              >
                <Text style={[styles.radiusChipText, active && styles.radiusChipTextActive]}>{value} km</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          value={radiusKm}
          onChangeText={setRadiusKm}
          keyboardType="numeric"
          style={styles.input}
          placeholder="20"
          placeholderTextColor="#94A3B8"
        />

        <View style={styles.domainHeader}>
          <Text style={styles.fieldLabel}>Domaines d'activite</Text>
          <TouchableOpacity style={styles.selectAllChip} onPress={handleToggleAllDomains}>
            <Text style={styles.selectAllChipText}>
              {selectedDomains.length === 0 ? 'Tous les domaines actifs' : 'Reinitialiser'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.selectionHint}>{domainSelectionLabel}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.domainScroll}>
          {DOMAIN_OPTIONS.map((option) => {
            const active = selectedDomains.includes(option.id);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.domainCard, active && styles.domainCardActive]}
                onPress={() => handleToggleDomain(option.id)}
              >
                <Ionicons
                  name={option.icon as any}
                  size={18}
                  color={active ? '#FFFFFF' : '#4F46E5'}
                />
                <Text style={[styles.domainCardTitle, active && styles.domainCardTitleActive]}>{option.label}</Text>
                <Text style={[styles.domainCardDescription, active && styles.domainCardDescriptionActive]}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.launchButton} onPress={handleStartAudit} disabled={loadingStart}>
          {loadingStart ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
              <Text style={styles.launchButtonText}>Lancer l'audit site externe</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Audits recents</Text>
        <Text style={styles.panelSubtitle}>
          Suis la progression et reviens sur un audit deja termine pour exporter tout le secteur en Excel.
        </Text>
        {loadingHistory ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#4F46E5" />
          </View>
        ) : audits.length === 0 ? (
          <Text style={styles.emptyText}>Aucun audit site externe lance pour le moment.</Text>
        ) : (
          audits.map((audit) => {
            const status = getAuditStatusPresentation(audit.status, audit.progress);
            const isSelected = audit.id === selectedAuditId;
            return (
              <TouchableOpacity
                key={audit.id}
                style={[styles.auditRow, isSelected && styles.auditRowSelected]}
                onPress={() => loadAuditDetail(audit.id, { offset: 0, append: false })}
              >
                <View style={styles.auditRowTop}>
                  <Text style={styles.auditRowTitle}>{audit.location} - {audit.radius_km} km</Text>
                  <View style={[styles.auditStatusBadge, { backgroundColor: status.backgroundColor }]}>
                    <Text style={[styles.auditStatusBadgeText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <Text style={styles.auditRowMeta}>
                  {audit.selected_domain_labels?.join(', ') || 'Tous les domaines'} - {audit.result_count || 0} site(s)
                </Text>
                <Text style={styles.auditRowMeta}>
                  Lance le {formatServerDateTime(audit.created_at)}
                  {audit.completed_at ? ` - termine le ${formatServerDateTime(audit.completed_at)}` : ''}
                </Text>
                {!!audit.progress_message && audit.status !== 'done' && (
                  <Text style={styles.auditProgressText}>{audit.progress_message}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {selectedAudit && (
        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <View style={styles.panelHeaderTextWrap}>
              <Text style={styles.panelTitle}>Resultats de l'audit</Text>
              <Text style={styles.panelSubtitle}>
                {selectedAudit.location} - {selectedAudit.radius_km} km - {selectedAudit.selected_domain_labels?.join(', ') || 'Tous les domaines'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.exportButton, (selectedAudit.status !== 'done' || downloadingExport) && styles.exportButtonDisabled]}
              disabled={selectedAudit.status !== 'done' || downloadingExport}
              onPress={handleExportXlsx}
            >
              {downloadingExport ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Excel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{selectedAudit.result_count || 0}</Text>
              <Text style={styles.summaryLabel}>Sites externes</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{selectedAudit.summary?.candidate_sites || 0}</Text>
              <Text style={styles.summaryLabel}>Sites candidats</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{selectedAudit.summary?.places_seen || 0}</Text>
              <Text style={styles.summaryLabel}>Fiches Google vues</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{selectedAudit.summary?.solocal_sites_excluded || 0}</Text>
              <Text style={styles.summaryLabel}>Sites Solocal exclus</Text>
            </View>
          </View>

          {selectedAudit.status !== 'done' ? (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>Audit en cours</Text>
                <Text style={styles.progressPercent}>{selectedAudit.progress || 0}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${selectedAudit.progress || 0}%` }]} />
              </View>
              <Text style={styles.progressMessage}>{selectedAudit.progress_message || "Preparation de l'audit..."}</Text>
              {loadingDetail && (
                <View style={styles.progressLoader}>
                  <ActivityIndicator color="#4F46E5" />
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.readyText}>
              Audit termine. L'application affiche progressivement les resultats et l'export Excel contient la totalite du secteur.
            </Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={selectedAudit?.status === 'done' ? results : []}
      keyExtractor={(item, index) => `${item.website_url || item.name}-${index}`}
      renderItem={renderAuditResult}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={
        selectedAudit?.status === 'done' ? (
          <View style={styles.footerWrap}>
            {loadingMore ? (
              <ActivityIndicator color="#4F46E5" />
            ) : hasMoreResults ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreButtonText}>Charger plus de resultats</Text>
              </TouchableOpacity>
            ) : results.length > 0 ? (
              <Text style={styles.footerHint}>Tous les resultats actuellement disponibles sont affiches.</Text>
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        selectedAudit?.status === 'done' ? (
          <View style={styles.emptyResultsCard}>
            <Ionicons name="globe-outline" size={20} color="#64748B" />
            <Text style={styles.emptyText}>Aucun site externe concurrent trouve sur ce cadrage pour le moment.</Text>
          </View>
        ) : null
      }
      contentContainerStyle={styles.listContent}
      onEndReachedThreshold={0.7}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F8FAFC',
  },
  screenContent: {
    gap: 18,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
  },
  heroCallout: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
  },
  heroCalloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#3730A3',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  panelSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  suggestionsCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#0F172A',
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  radiusChipActive: {
    backgroundColor: '#4F46E5',
  },
  radiusChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  radiusChipTextActive: {
    color: '#FFFFFF',
  },
  domainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectAllChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  selectAllChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
  selectionHint: {
    fontSize: 13,
    color: '#64748B',
  },
  domainScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  domainCard: {
    width: 180,
    minHeight: 126,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#F8FAFC',
    padding: 14,
    gap: 8,
  },
  domainCardActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  domainCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  domainCardTitleActive: {
    color: '#FFFFFF',
  },
  domainCardDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
  },
  domainCardDescriptionActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  launchButton: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  launchButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  loadingBlock: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
  },
  auditRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  auditRowSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  auditRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  auditRowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  auditStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  auditStatusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  auditRowMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  auditProgressText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  panelHeaderTextWrap: {
    flex: 1,
    gap: 4,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#047857',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exportButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 999,
  },
  progressMessage: {
    fontSize: 13,
    color: '#475569',
  },
  progressLoader: {
    paddingTop: 6,
    alignItems: 'flex-start',
  },
  readyText: {
    fontSize: 13,
    color: '#065F46',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginTop: 14,
    gap: 10,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  resultTitleWrap: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  resultMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  providerBadge: {
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  providerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4338CA',
  },
  resultAddress: {
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  infoPillText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  resultReason: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
  },
  actionButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  actionButtonTextDisabled: {
    color: '#94A3B8',
  },
  footerWrap: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
  },
  loadMoreButtonText: {
    color: '#4338CA',
    fontWeight: '800',
  },
  footerHint: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyResultsCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
