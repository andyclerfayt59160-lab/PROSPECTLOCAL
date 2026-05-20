import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Statuts de visite avec couleurs
const VISITE_STATUS_MAP: { [key: string]: { label: string; color: string; icon: string } } = {
  'non_visite': { label: 'Non visité', color: '#8E8E93', icon: 'time-outline' },
  'visite': { label: 'Visité', color: '#34C759', icon: 'checkmark-circle' },
  'a_revisiter': { label: 'À revisiter', color: '#FF9500', icon: 'refresh' },
  'interesse': { label: 'Intéressé', color: '#FFD700', icon: 'star' },
  'pas_interesse': { label: 'Pas intéressé', color: '#FF3B30', icon: 'close-circle' },
  'client': { label: 'Client', color: '#AF52DE', icon: 'trophy' },
};

interface VisiteBusiness {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  siret?: string;
  siren?: string;
  date_creation?: string;
  activite_naf?: string;
  has_pagesjaunes: boolean;
  score: number;
  source: string;
  lead_type: string;
  scan_id: string;
  scan_label?: string;
  visite_status?: string;
}

export default function VisitesScreen() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<VisiteBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');

  // Rafraîchir la liste quand on revient sur cette page
  useFocusEffect(
    useCallback(() => {
      loadVisites();
    }, [])
  );

  const loadVisites = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');

      // Charger toutes les entreprises de type "visite_terrain" ou source "pappers"
      const response = await axios.get(
        `${API_URL}/api/businesses/visites`,
        { headers: { Authorization: `Bearer ${t}` } }
      );

      setBusinesses(response.data || []);
    } catch (error) {
      console.error('Error loading visites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMaps = (business: VisiteBusiness) => {
    if (business.address) {
      const encodedAddress = encodeURIComponent(business.address);
      const mapsUrl = Platform.OS === 'ios'
        ? `maps://maps.apple.com/?q=${encodedAddress}`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      Linking.openURL(mapsUrl);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusInfo = (status?: string) => {
    return VISITE_STATUS_MAP[status || 'non_visite'] || VISITE_STATUS_MAP['non_visite'];
  };

  const renderVisiteItem = ({ item }: { item: VisiteBusiness }) => {
    const statusInfo = getStatusInfo(item.visite_status);
    
    return (
    <TouchableOpacity
      style={[
        styles.visiteCard, 
        { borderLeftColor: statusInfo.color }
      ]}
      onPress={() => router.push({ pathname: '/visitedetail', params: { businessId: item.id } })}
    >
      {/* Status Badge at top */}
      <View style={[styles.statusIndicator, { backgroundColor: statusInfo.color }]}>
        <Ionicons name={statusInfo.icon as any} size={12} color="#FFF" />
        <Text style={styles.statusIndicatorText}>{statusInfo.label}</Text>
      </View>
      
      <View style={styles.visiteHeader}>
        <View style={styles.visiteInfo}>
          <Text style={styles.visiteName} numberOfLines={1}>{item.name}</Text>
          {item.activite_naf && (
            <Text style={styles.visiteActivity}>{item.activite_naf}</Text>
          )}
        </View>
        <View style={styles.visiteBadges}>
          {!item.has_pagesjaunes && (
            <View style={styles.badgePJ}>
              <Text style={styles.badgePJText}>🔴 Sans PJ</Text>
            </View>
          )}
          {item.source === 'pappers' && (
            <View style={styles.badgePappers}>
              <Text style={styles.badgePappersText}>📋 Pappers</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.visiteDetails}>
        {/* Adresse */}
        <View style={styles.detailRow}>
          <Ionicons name="location" size={16} color="#6366F1" />
          <Text style={styles.detailText} numberOfLines={2}>
            {item.address || 'Adresse non disponible'}
          </Text>
        </View>

        {/* Date de création */}
        {item.date_creation && (
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color="#FF9800" />
            <Text style={styles.detailText}>
              Créée le {formatDate(item.date_creation)}
            </Text>
          </View>
        )}

        {/* SIRET */}
        {item.siret && (
          <View style={styles.detailRow}>
            <Ionicons name="document-text" size={16} color="#666" />
            <Text style={styles.detailText}>SIRET: {item.siret}</Text>
          </View>
        )}

        {/* Téléphone (si renseigné après visite) */}
        {item.phone ? (
          <View style={styles.detailRow}>
            <Ionicons name="call" size={16} color="#34C759" />
            <Text style={[styles.detailText, styles.phoneText]}>{item.phone}</Text>
          </View>
        ) : (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color="#999" />
            <Text style={[styles.detailText, styles.noPhoneText]}>
              Téléphone à récupérer sur place
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.visiteActions}>
        <TouchableOpacity
          style={styles.actionBtnMaps}
          onPress={() => handleOpenMaps(item)}
        >
          <Ionicons name="navigate" size={18} color="#FFF" />
          <Text style={styles.actionBtnText}>Itinéraire</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtnDetail}
          onPress={() => router.push({ pathname: '/visitedetail', params: { businessId: item.id } })}
        >
          <Ionicons name="create" size={18} color="#FFF" />
          <Text style={styles.actionBtnText}>Éditer</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Chargement des visites...</Text>
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
        <ProspectLocalLogo size={36} variant="icon" />
        <Text style={styles.headerTitle}>🚗 Visites de prospection</Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#1565C0" />
        <Text style={styles.infoBannerText}>
          Entreprises récentes sans coordonnées téléphoniques. Rendez-vous sur place pour récupérer leurs informations.
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          📋 {businesses.length} entreprise{businesses.length > 1 ? 's' : ''} à visiter
        </Text>
      </View>

      {/* Liste des visites */}
      {businesses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>Aucune visite prévue</Text>
          <Text style={styles.emptySubtitle}>
            Lancez un scan pour trouver de nouvelles entreprises à visiter
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/newscan')}
          >
            <Ionicons name="search" size={20} color="#FFF" />
            <Text style={styles.emptyButtonText}>Nouveau scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id}
          renderItem={renderVisiteItem}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadVisites}
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
    backgroundColor: '#F5F5F7',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  statsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  listContent: {
    padding: 16,
  },
  visiteCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomRightRadius: 8,
    gap: 4,
  },
  statusIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  visiteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 8,
  },
  visiteInfo: {
    flex: 1,
  },
  visiteName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  visiteActivity: {
    fontSize: 13,
    color: '#666',
  },
  visiteBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  badgePJ: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgePJText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C62828',
  },
  badgePappers: {
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgePappersText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7B1FA2',
  },
  visiteDetails: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  phoneText: {
    color: '#34C759',
    fontWeight: '600',
  },
  noPhoneText: {
    color: '#999',
    fontStyle: 'italic',
  },
  visiteActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionBtnMaps: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    gap: 8,
  },
  actionBtnDetail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
