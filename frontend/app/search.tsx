import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';

interface Business {
  id: string;
  pl_reference?: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  score: number;
  scan_query?: string;
  scan_location?: string;
  linked_count?: number;
  contact_status_manual?: string;
  client_status?: string;
  interest_status?: string;
  crm_status?: string;
}

interface SearchResult {
  query: string;
  count: number;
  results: Business[];
}

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Veuillez entrer une référence PL ou un numéro de téléphone');
      } else {
        Alert.alert('Recherche', 'Veuillez entrer une référence PL ou un numéro de téléphone');
      }
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/search/businesses`, {
        params: { q: searchQuery.trim() },
        headers: { Authorization: `Bearer ${token}` },
      });

      setResults(response.data);
      
      if (response.data.count === 0) {
        setError('Aucun établissement trouvé');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la recherche');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadges = (business: Business) => {
    const badges = [];
    
    if (business.client_status === 'client') {
      badges.push({ label: 'Client', color: '#FF9800', icon: 'star' });
    }
    if (business.contact_status_manual === 'contacted') {
      badges.push({ label: 'Contacté', color: '#34C759', icon: 'call' });
    }
    if (business.interest_status === 'not_interested') {
      badges.push({ label: 'Non intéressé', color: '#FF3B30', icon: 'close-circle' });
    }
    if (business.crm_status === 'in_crm') {
      badges.push({ label: 'Dans CRM', color: '#007AFF', icon: 'cloud-done' });
    }
    
    return badges;
  };

  const renderBusinessItem = ({ item }: { item: Business }) => {
    const badges = getStatusBadges(item);
    
    return (
      <TouchableOpacity
        style={styles.businessCard}
        onPress={() => router.push(`/businessdetail?id=${item.id}`)}
      >
        <View style={styles.businessHeader}>
          {item.pl_reference && (
            <View style={styles.plBadge}>
              <Text style={styles.plBadgeText}>{item.pl_reference}</Text>
            </View>
          )}
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>{item.score}/100</Text>
          </View>
        </View>

        <Text style={styles.businessName} numberOfLines={1}>{item.name}</Text>
        
        {item.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color="#666" />
            <Text style={styles.infoText}>{item.phone}</Text>
          </View>
        )}
        
        {item.city && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#666" />
            <Text style={styles.infoText}>{item.city}</Text>
          </View>
        )}
        
        {item.scan_query && (
          <View style={styles.infoRow}>
            <Ionicons name="search-outline" size={14} color="#6366F1" />
            <Text style={styles.scanInfo}>{item.scan_query} - {item.scan_location}</Text>
          </View>
        )}

        {item.linked_count && item.linked_count > 0 && (
          <View style={styles.linkedBadge}>
            <Ionicons name="link" size={14} color="#FF9500" />
            <Text style={styles.linkedText}>{item.linked_count} fiche(s) liée(s)</Text>
          </View>
        )}

        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            {badges.map((badge, index) => (
              <View key={index} style={[styles.statusBadge, { backgroundColor: badge.color }]}>
                <Ionicons name={badge.icon as any} size={12} color="#FFF" />
                <Text style={styles.statusBadgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/home')}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔍 Recherche avancée</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Référence PL (ex: PL0001) ou téléphone..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="characters"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity
          style={[styles.searchButton, loading && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.searchButtonText}>Rechercher</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.helpBox}>
        <Ionicons name="information-circle" size={18} color="#6366F1" />
        <Text style={styles.helpText}>
          Recherchez par référence PROSPECTLOCAL (PL0001) ou par numéro de téléphone
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {results && results.count > 0 && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {results.count} résultat{results.count > 1 ? 's' : ''} pour "{results.query}"
          </Text>
        </View>
      )}

      {results && results.results.length > 0 && (
        <FlatList
          data={results.results}
          keyExtractor={(item) => item.id}
          renderItem={renderBusinessItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!results && !loading && !error && (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={60} color="#DDD" />
          <Text style={styles.emptyStateText}>
            Entrez une référence PL ou un numéro pour commencer
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFF',
    gap: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
  },
  searchButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#A5A6F6',
  },
  searchButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: '#6366F1',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FF3B30',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultsCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  businessCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  businessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  plBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  plBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  businessName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
  },
  scanInfo: {
    fontSize: 13,
    color: '#6366F1',
    fontStyle: 'italic',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  linkedText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
