import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';

import { API_URL } from '../utils/api';

interface ExportPreset {
  id: string;
  name: string;
  description: string;
  params: Record<string, any>;
}

interface ExportFilters {
  has_phone: boolean | null;
  has_email: boolean | null;
  has_siret: boolean | null;
  source: string | null;
  min_score: number | null;
  max_age_days: number | null;
  sales_status: string | null;
}

const EMPTY_EXPORT_FILTERS: ExportFilters = {
  has_phone: null,
  has_email: null,
  has_siret: null,
  source: null,
  min_score: null,
  max_age_days: null,
  sales_status: null,
};

const SOURCE_OPTIONS = [
  { value: null, label: 'Toutes sources' },
  { value: 'google', label: 'Google Places' },
  { value: 'pappers', label: 'Pappers' },
  { value: 'web', label: 'Web' },
];

const SCORE_OPTIONS = [
  { value: null, label: 'Tous scores' },
  { value: 50, label: '50+' },
  { value: 60, label: '60+' },
  { value: 70, label: '70+ (Haut potentiel)' },
  { value: 80, label: '80+ (Excellent)' },
];

const AGE_OPTIONS = [
  { value: null, label: 'Toutes dates' },
  { value: 7, label: '7 derniers jours' },
  { value: 30, label: '30 derniers jours' },
  { value: 90, label: '3 derniers mois' },
  { value: 180, label: '6 derniers mois' },
  { value: 365, label: '1 an' },
];

const STATUS_OPTIONS = [
  { value: null, label: 'Tous statuts' },
  { value: 'new', label: 'Nouveau' },
  { value: 'to_call', label: 'À appeler' },
  { value: 'called', label: 'Appelé' },
  { value: 'callback', label: 'Rappeler' },
  { value: 'meeting_scheduled', label: 'RDV programmé' },
  { value: 'meeting_done', label: 'RDV effectué' },
  { value: 'proposal_sent', label: 'Devis envoyé' },
  { value: 'won', label: 'Gagné' },
  { value: 'lost', label: 'Perdu' },
];

export default function ExportPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [exporting, setExporting] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState<ExportFilters>({ ...EMPTY_EXPORT_FILTERS });

  useEffect(() => {
    fetchPresets();
  }, []);

  useEffect(() => {
    // Debounced preview count
    const timer = setTimeout(() => {
      fetchPreviewCount();
    }, 500);
    return () => clearTimeout(timer);
  }, [filters]);

  const fetchPresets = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/export/presets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPresets(response.data.presets);
    } catch (error) {
      console.error('Error fetching presets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewCount = async () => {
    setPreviewLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('format', 'json');
      
      if (filters.has_phone !== null) params.append('has_phone', filters.has_phone.toString());
      if (filters.has_email !== null) params.append('has_email', filters.has_email.toString());
      if (filters.has_siret !== null) params.append('has_siret', filters.has_siret.toString());
      if (filters.source) params.append('source', filters.source);
      if (filters.min_score) params.append('min_score', filters.min_score.toString());
      if (filters.max_age_days) params.append('max_age_days', filters.max_age_days.toString());
      if (filters.sales_status) params.append('sales_status', filters.sales_status);
      
      const response = await axios.get(`${API_URL}/api/export/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreviewCount(response.data.total);
    } catch (error) {
      console.error('Error fetching preview:', error);
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const applyPreset = (preset: ExportPreset) => {
    const newFilters: ExportFilters = { ...EMPTY_EXPORT_FILTERS };
    
    if (preset.params.has_phone !== undefined) newFilters.has_phone = preset.params.has_phone;
    if (preset.params.has_email !== undefined) newFilters.has_email = preset.params.has_email;
    if (preset.params.has_siret !== undefined) newFilters.has_siret = preset.params.has_siret;
    if (preset.params.source) newFilters.source = preset.params.source;
    if (preset.params.min_score) newFilters.min_score = preset.params.min_score;
    if (preset.params.max_age_days) newFilters.max_age_days = preset.params.max_age_days;
    if (preset.params.sales_status) newFilters.sales_status = preset.params.sales_status;
    
    setFilters(newFilters);
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_EXPORT_FILTERS });
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('format', 'csv');
      
      if (filters.has_phone !== null) params.append('has_phone', filters.has_phone.toString());
      if (filters.has_email !== null) params.append('has_email', filters.has_email.toString());
      if (filters.has_siret !== null) params.append('has_siret', filters.has_siret.toString());
      if (filters.source) params.append('source', filters.source);
      if (filters.min_score) params.append('min_score', filters.min_score.toString());
      if (filters.max_age_days) params.append('max_age_days', filters.max_age_days.toString());
      if (filters.sales_status) params.append('sales_status', filters.sales_status);
      
      const url = `${API_URL}/api/export/leads?${params.toString()}`;
      
      if (Platform.OS === 'web') {
        // For web, open in new tab to download
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', '');
        
        // Add auth header via fetch
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        link.href = blobUrl;
        
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'export.csv';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) filename = filenameMatch[1];
        }
        link.setAttribute('download', filename);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        
        if (typeof window !== 'undefined') {
          window.alert(`Export réussi ! ${previewCount} leads exportés.`);
        }
      }
    } catch (error) {
      console.error('Error exporting:', error);
      if (typeof window !== 'undefined') {
        window.alert('Erreur lors de l\'export');
      }
    } finally {
      setExporting(false);
    }
  };

  const buildExportParams = (format: 'json' | 'csv') => {
    const params = new URLSearchParams();
    params.append('format', format);

    if (filters.has_phone !== null) params.append('has_phone', filters.has_phone.toString());
    if (filters.has_email !== null) params.append('has_email', filters.has_email.toString());
    if (filters.has_siret !== null) params.append('has_siret', filters.has_siret.toString());
    if (filters.source) params.append('source', filters.source);
    if (filters.min_score) params.append('min_score', filters.min_score.toString());
    if (filters.max_age_days) params.append('max_age_days', filters.max_age_days.toString());
    if (filters.sales_status) params.append('sales_status', filters.sales_status);

    return params;
  };

  const activeFiltersCount = Object.values(filters).filter(v => v !== null).length;
  const activeFiltersSummary = [
    filters.has_phone ? 'Téléphone' : null,
    filters.has_email ? 'Email' : null,
    filters.has_siret ? 'SIRET' : null,
    SOURCE_OPTIONS.find(opt => opt.value === filters.source)?.label || null,
    filters.min_score ? `Score ${filters.min_score}+` : null,
    filters.max_age_days ? `${filters.max_age_days} jours` : null,
    STATUS_OPTIONS.find(opt => opt.value === filters.sales_status)?.label || null,
  ].filter(Boolean).join(' • ');

  const exportCSVWithToast = async () => {
    setExporting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const params = buildExportParams('csv');
      const url = `${API_URL}/api/export/leads?${params.toString()}`;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', '');

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        link.href = blobUrl;

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'export.csv';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename=\"?([^\"]+)\"?/);
          if (filenameMatch) filename = filenameMatch[1];
        }
        link.setAttribute('download', filename);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }

      showToast(`Export réussi : ${previewCount || 0} leads téléchargés.`, 'success');
    } catch (error) {
      console.error('Error exporting:', error);
      showToast("Erreur lors de l'export CSV.", 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Export Intelligent</Text>
          <Text style={styles.headerSubtitle}>Exportez vos leads avec des filtres avancés</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Presets Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exports rapides</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={styles.presetCard}
                onPress={() => applyPreset(preset)}
              >
                <Text style={styles.presetName}>{preset.name}</Text>
                <Text style={styles.presetDesc}>{preset.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Filters Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Filtres personnalisés</Text>
            {activeFiltersCount > 0 && (
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>Réinitialiser</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.exportSummaryCard}>
            <Text style={styles.exportSummaryLabel}>Configuration actuelle</Text>
            <Text style={styles.exportSummaryValue}>
              {activeFiltersSummary || 'Aucun filtre actif. L’export portera sur toute la base visible.'}
            </Text>
          </View>

          {/* Toggle Filters */}
          <View style={styles.filterCard}>
            <Text style={styles.filterGroupTitle}>Données requises</Text>
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="call" size={18} color="#10B981" />
                <Text style={styles.toggleLabel}>Avec téléphone</Text>
              </View>
              <Switch
                value={filters.has_phone === true}
                onValueChange={(value) => setFilters({...filters, has_phone: value ? true : null})}
                trackColor={{ false: '#E5E7EB', true: '#10B981' }}
              />
            </View>
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="mail" size={18} color="#6366F1" />
                <Text style={styles.toggleLabel}>Avec email</Text>
              </View>
              <Switch
                value={filters.has_email === true}
                onValueChange={(value) => setFilters({...filters, has_email: value ? true : null})}
                trackColor={{ false: '#E5E7EB', true: '#6366F1' }}
              />
            </View>
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="document-text" size={18} color="#F59E0B" />
                <Text style={styles.toggleLabel}>Avec SIRET</Text>
              </View>
              <Switch
                value={filters.has_siret === true}
                onValueChange={(value) => setFilters({...filters, has_siret: value ? true : null})}
                trackColor={{ false: '#E5E7EB', true: '#F59E0B' }}
              />
            </View>
          </View>

          {/* Source Filter */}
          <View style={styles.filterCard}>
            <Text style={styles.filterGroupTitle}>Source</Text>
            <View style={styles.optionsRow}>
              {SOURCE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value || 'all'}
                  style={[styles.optionBtn, filters.source === opt.value && styles.optionBtnActive]}
                  onPress={() => setFilters({...filters, source: opt.value})}
                >
                  <Text style={[styles.optionBtnText, filters.source === opt.value && styles.optionBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Score Filter */}
          <View style={styles.filterCard}>
            <Text style={styles.filterGroupTitle}>Score minimum</Text>
            <View style={styles.optionsRow}>
              {SCORE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value || 'all'}
                  style={[styles.optionBtn, filters.min_score === opt.value && styles.optionBtnActive]}
                  onPress={() => setFilters({...filters, min_score: opt.value})}
                >
                  <Text style={[styles.optionBtnText, filters.min_score === opt.value && styles.optionBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Age Filter */}
          <View style={styles.filterCard}>
            <Text style={styles.filterGroupTitle}>Date de création</Text>
            <View style={styles.optionsRow}>
              {AGE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value || 'all'}
                  style={[styles.optionBtn, filters.max_age_days === opt.value && styles.optionBtnActive]}
                  onPress={() => setFilters({...filters, max_age_days: opt.value})}
                >
                  <Text style={[styles.optionBtnText, filters.max_age_days === opt.value && styles.optionBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Status Filter */}
          <View style={styles.filterCard}>
            <Text style={styles.filterGroupTitle}>Statut commercial</Text>
            <View style={styles.optionsRow}>
              {STATUS_OPTIONS.slice(0, 5).map((opt) => (
                <TouchableOpacity
                  key={opt.value || 'all'}
                  style={[styles.optionBtn, filters.sales_status === opt.value && styles.optionBtnActive]}
                  onPress={() => setFilters({...filters, sales_status: opt.value})}
                >
                  <Text style={[styles.optionBtnText, filters.sales_status === opt.value && styles.optionBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.optionsRow}>
              {STATUS_OPTIONS.slice(5).map((opt) => (
                <TouchableOpacity
                  key={opt.value || 'all2'}
                  style={[styles.optionBtn, filters.sales_status === opt.value && styles.optionBtnActive]}
                  onPress={() => setFilters({...filters, sales_status: opt.value})}
                >
                  <Text style={[styles.optionBtnText, filters.sales_status === opt.value && styles.optionBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Export Footer */}
      <View style={styles.footer}>
        <View style={styles.previewInfo}>
          <Text style={styles.previewLabel}>Leads à exporter :</Text>
          {previewLoading ? (
            <ActivityIndicator size="small" color="#6366F1" />
          ) : (
            <Text style={styles.previewCount}>{previewCount?.toLocaleString() || '-'}</Text>
          )}
        </View>
        <Text style={styles.footerHint}>
          Export CSV orienté CRM : nom, ville, adresse, téléphone, date de création, score et source.
        </Text>

        <TouchableOpacity
          style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
          onPress={exportCSVWithToast}
          disabled={exporting || previewCount === 0}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="download" size={20} color="#FFF" />
              <Text style={styles.exportBtnText}>Exporter CSV</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  presetsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  presetCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 160,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  filterCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#374151',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  optionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  optionBtnTextActive: {
    color: '#6366F1',
  },
  exportSummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  exportSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  exportSummaryValue: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  previewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  previewCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366F1',
  },
  footerHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
