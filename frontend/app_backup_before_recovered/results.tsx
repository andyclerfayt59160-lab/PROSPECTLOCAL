import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
}

interface Stats {
  total: number;
  no_pagesjaunes: number;
  new_in_scan: number;
  viewed: number;
  contacted: number;
  no_website: number;
  opportunity_max: number;
  visite_terrain: number;
  pappers_count: number;
}

// Filter types
type FilterType = 'all' | 'no_pj' | 'no_website' | 'low_reviews' | 'opportunity_max' | 'new' | 'visite_terrain' | 'pappers';

export default function ResultsScreen() {
  const router = useRouter();
  const { scanId } = useLocalSearchParams();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState<Business[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [includeClients, setIncludeClients] = useState(false);
  const [scanInfo, setScanInfo] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadBusinesses();
  }, [includeClients]);

  useEffect(() => {
    applyFilter();
  }, [businesses, activeFilter]);

  const applyFilter = () => {
    let filtered = [...businesses];
    
    switch (activeFilter) {
      case 'no_pj':
        filtered = businesses.filter(b => !b.has_pagesjaunes);
        break;
      case 'no_website':
        filtered = businesses.filter(b => !b.has_website && !b.website_url);
        break;
      case 'low_reviews':
        filtered = businesses.filter(b => (b.google_reviews_count || 0) < 5);
        break;
      case 'opportunity_max':
        filtered = businesses.filter(b => isOpportunityMax(b));
        break;
      case 'new':
        filtered = businesses.filter(b => b.is_new_in_scan);
        break;
      case 'visite_terrain':
        filtered = businesses.filter(b => b.lead_type === 'visite_terrain' || (!b.phone && b.address));
        break;
      case 'pappers':
        filtered = businesses.filter(b => b.source === 'pappers');
        break;
      default:
        filtered = businesses;
    }
    
    setFilteredBusinesses(filtered);
  };

  // Determine if business is a "max opportunity"
  const isOpportunityMax = (b: Business): boolean => {
    const noPJ = !b.has_pagesjaunes;
    const lowVisibility = (b.google_reviews_count || 0) < 5;
    const hasPhone = !!b.phone;
    const isPappers = b.source === 'pappers';
    return (noPJ && lowVisibility && hasPhone) || (isPappers && noPJ);
  };

  // Determine if business needs field visit
  const isVisiteTerrain = (b: Business): boolean => {
    return b.lead_type === 'visite_terrain' || (!b.phone && !!b.address);
  };

  const loadBusinesses = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');

      const response = await axios.get(
        `${API_URL}/api/scans/${scanId}/businesses`,
        {
          params: { include_clients: includeClients },
          headers: { Authorization: `Bearer ${t}` },
        }
      );

      const loadedBusinesses = response.data.businesses || [];
      setBusinesses(loadedBusinesses);
      
      // Calculate enhanced stats
      const noWebsite = loadedBusinesses.filter((b: Business) => !b.has_website && !b.website_url).length;
      const opportunityMax = loadedBusinesses.filter((b: Business) => isOpportunityMax(b)).length;
      const visiteTerrain = loadedBusinesses.filter((b: Business) => b.lead_type === 'visite_terrain' || (!b.phone && b.address)).length;
      const pappersCount = loadedBusinesses.filter((b: Business) => b.source === 'pappers').length;
      
      setStats({
        ...response.data.stats,
        no_website: noWebsite,
        opportunity_max: opportunityMax,
        visite_terrain: visiteTerrain,
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

  const getScoreColor = (score: number) => {
    if (score >= 60) return '#34C759';
    if (score >= 30) return '#FF9500';
    return '#FF3B30';
  };

  const getPJBadge = (item: Business) => {
    if (item.pj_manually_set) {
      return item.has_pagesjaunes 
        ? { emoji: '🟢', label: 'PJ', bg: '#E8F5E9' }
        : { emoji: '🔴', label: 'PJ', bg: '#FFEBEE' };
    }
    if (item.pj_confidence === 'confirmed') {
      return item.has_pagesjaunes 
        ? { emoji: '🟢', label: 'PJ', bg: '#E8F5E9' }
        : { emoji: '🔴', label: 'PJ', bg: '#FFEBEE' };
    }
    if (item.pj_confidence === 'not_found') {
      return { emoji: '🔴', label: 'PJ', bg: '#FFEBEE' };
    }
    return { emoji: '🟡', label: 'PJ?', bg: '#FFF3E0' };
  };

  const renderBusinessRow = ({ item }: { item: Business }) => {
    const pjBadge = getPJBadge(item);
    const isMaxOpp = isOpportunityMax(item);
    
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
            !item.has_pagesjaunes ? styles.pjDotAbsent : styles.pjDotPresent,
            item.pj_confidence === 'unknown' && styles.pjDotUnknown
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
          {item.city && (
            <Text style={styles.businessCity}>{item.city}</Text>
          )}
        </View>

        {/* Phone */}
        <View style={styles.cellPhone}>
          {item.phone ? (
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
          ) : (
            <Text style={styles.emptyText}>-</Text>
          )}
        </View>

        {/* Score */}
        <View style={styles.cellScore}>
          <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(item.score) }]}>
            <Text style={styles.scoreText}>{item.score}</Text>
          </View>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Résultats</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsBar}>
        <Text style={styles.statsTotal}>{businesses.length} établissements</Text>
        {stats && (
          <View style={styles.statsDetails}>
            {stats.opportunity_max > 0 && (
              <Text style={styles.statItem}>🔥 {stats.opportunity_max} opportunités max</Text>
            )}
            {stats.no_pagesjaunes > 0 && (
              <Text style={styles.statItem}>🔴 {stats.no_pagesjaunes} sans PJ</Text>
            )}
          </View>
        )}
      </View>

      {/* Filter Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
            Tous ({businesses.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, styles.filterPillMax, activeFilter === 'opportunity_max' && styles.filterPillMaxActive]}
          onPress={() => setActiveFilter('opportunity_max')}
        >
          <Text style={[styles.filterPillText, styles.filterPillTextMax, activeFilter === 'opportunity_max' && styles.filterPillTextActive]}>
            🔥 Opportunité Max ({stats?.opportunity_max || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, styles.filterPillRed, activeFilter === 'no_pj' && styles.filterPillRedActive]}
          onPress={() => setActiveFilter('no_pj')}
        >
          <Text style={[styles.filterPillText, styles.filterPillTextRed, activeFilter === 'no_pj' && styles.filterPillTextActive]}>
            🔴 Sans PJ ({stats?.no_pagesjaunes || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'no_website' && styles.filterPillActive]}
          onPress={() => setActiveFilter('no_website')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'no_website' && styles.filterPillTextActive]}>
            🌐 Sans site ({stats?.no_website || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'low_reviews' && styles.filterPillActive]}
          onPress={() => setActiveFilter('low_reviews')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'low_reviews' && styles.filterPillTextActive]}>
            ⭐ &lt;5 avis
          </Text>
        </TouchableOpacity>

        {stats && stats.new_in_scan > 0 && (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillGreen, activeFilter === 'new' && styles.filterPillGreenActive]}
            onPress={() => setActiveFilter('new')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextGreen, activeFilter === 'new' && styles.filterPillTextActive]}>
              🆕 Nouveaux ({stats.new_in_scan})
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Client Toggle */}
      <View style={styles.clientToggle}>
        <Text style={styles.clientToggleLabel}>Inclure les clients</Text>
        <Switch
          value={includeClients}
          onValueChange={setIncludeClients}
          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
          style={styles.filterSwitch}
        />
      </View>

      {/* Legend - Clarification des points */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotAbsent]} />
          <Text style={styles.legendText}>Absent PJ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotPresent]} />
          <Text style={styles.legendText}>Présent PJ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotUnknown]} />
          <Text style={styles.legendText}>À vérifier</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendEmoji}>🔥</Text>
          <Text style={styles.legendText}>Opportunité Max</Text>
        </View>
      </View>

      {/* Table Header */}
      <View style={styles.tableHeader}>
        <Text style={styles.headerCellPJStatus}>PJ</Text>
        <Text style={styles.headerCellMain}>Établissement</Text>
        <Text style={styles.headerCellPhone}>Téléphone</Text>
        <Text style={styles.headerCellScore}>Score</Text>
      </View>

      {/* Business List */}
      {filteredBusinesses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color="#999" />
          <Text style={styles.emptyStateText}>
            {activeFilter === 'all' ? 'Aucun établissement' : 'Aucun résultat pour ce filtre'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBusinesses}
          keyExtractor={(item) => item.id}
          renderItem={renderBusinessRow}
          contentContainerStyle={styles.tableBody}
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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
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
  headerCellScore: {
    width: 60,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  tableBody: {
    paddingBottom: 20,
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
  businessCity: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cellPhone: {
    flex: 2,
  },
  phoneText: {
    fontSize: 13,
    color: '#007AFF',
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
  cellScore: {
    width: 60,
    alignItems: 'center',
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
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
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  // New styles for the updated UI
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
});
