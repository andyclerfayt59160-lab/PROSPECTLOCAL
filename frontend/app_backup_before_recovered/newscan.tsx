import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Activity {
  id: string;
  label: string;
  family: string;
}

interface City {
  name: string;
  code: string;
  postal_codes: string[];
  department: string;
  department_code: string;
  population: number;
  label: string;
}

// Sources consultées pendant le scan
const SCAN_SOURCES = [
  { id: 1, name: 'Google Places API', icon: 'logo-google', color: '#4285F4' },
  { id: 2, name: 'Recherche SIRET', icon: 'business', color: '#FF9800' },
  { id: 3, name: 'Vérification PagesJaunes', icon: 'search', color: '#FFCC00' },
  { id: 4, name: 'Analyse de visibilité', icon: 'analytics', color: '#34C759' },
];

export default function NewScanScreen() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  
  // City autocomplete
  const [cityQuery, setCityQuery] = useState('');
  const [filteredCities, setFilteredCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  
  const [radius, setRadius] = useState('10');
  const [loading, setLoading] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  
  // Scan progress state
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);

  // Alphabet for letter filter
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  // Activity families/categories
  const FAMILIES = [
    { id: 'all', label: 'Toutes', icon: 'grid-outline' },
    { id: 'Habitat', label: 'Habitat', icon: 'home-outline' },
    { id: 'Commerce', label: 'Commerce', icon: 'storefront-outline' },
    { id: 'Restauration', label: 'Resto', icon: 'restaurant-outline' },
    { id: 'Beauté', label: 'Beauté', icon: 'sparkles-outline' },
    { id: 'Santé', label: 'Santé', icon: 'medkit-outline' },
    { id: 'Auto', label: 'Auto', icon: 'car-outline' },
    { id: 'B2B', label: 'B2B', icon: 'business-outline' },
    { id: 'Autre', label: 'Autre', icon: 'ellipsis-horizontal-outline' },
  ];

  useEffect(() => {
    loadActivities();
  }, []);

  // Filter activities based on search, letter, and family
  useEffect(() => {
    if (activities.length === 0) return;
    
    let filtered = [...activities];
    
    // Filter by family
    if (selectedFamily) {
      filtered = filtered.filter(act => act.family === selectedFamily);
    }
    
    // Filter by letter
    if (selectedLetter) {
      filtered = filtered.filter(act => 
        act.label.toUpperCase().startsWith(selectedLetter)
      );
    }
    
    // Filter by search query
    if (searchQuery && searchQuery.length >= 1) {
      if (selectedActivity && searchQuery === selectedActivity.label) {
        setFilteredActivities([]);
        return;
      }
      filtered = filtered.filter(act =>
        act.label.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      if (selectedActivity && searchQuery !== selectedActivity.label) {
        setSelectedActivity(null);
      }
    }
    
    // Sort alphabetically
    filtered.sort((a, b) => a.label.localeCompare(b.label));
    
    // Limit to 15 results unless in picker mode
    setFilteredActivities(showActivityPicker ? filtered : filtered.slice(0, 15));
  }, [searchQuery, activities, selectedLetter, selectedFamily, showActivityPicker, selectedActivity]);

  // City autocomplete with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (cityQuery && cityQuery.length >= 2 && !selectedCity) {
        searchCities(cityQuery);
      } else {
        setFilteredCities([]);
      }
    }, 300);
    
    return () => clearTimeout(debounceTimer);
  }, [cityQuery, selectedCity]);

  const loadActivities = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      if (!t) {
        console.error('No token found, retrying...');
        // Retry after a short delay if no token
        setTimeout(loadActivities, 500);
        return;
      }
      setToken(t);

      const response = await axios.get(`${API_URL}/api/activities`, {
        headers: { Authorization: `Bearer ${t}` },
      });

      if (response.data && response.data.length > 0) {
        setActivities(response.data);
        console.log(`Loaded ${response.data.length} activities`);
      } else {
        console.error('No activities returned');
      }
    } catch (error) {
      console.error('Error loading activities:', error);
      // Retry on error after a delay
      setTimeout(loadActivities, 1000);
    } finally {
      setLoadingActivities(false);
    }
  };

  const searchCities = async (query: string) => {
    try {
      setLoadingCities(true);
      const response = await axios.get(`${API_URL}/api/cities/search`, {
        params: { q: query },
        headers: { Authorization: `Bearer ${token}` },
      });
      setFilteredCities(response.data || []);
    } catch (error) {
      console.error('Error searching cities:', error);
      setFilteredCities([]);
    } finally {
      setLoadingCities(false);
    }
  };

  const handleSelectActivity = (activity: Activity) => {
    setSelectedActivity(activity);
    setSearchQuery(activity.label);
    setFilteredActivities([]);
    setShowActivityPicker(false);
    setSelectedLetter(null);
    setSelectedFamily(null);
  };

  const handleOpenActivityPicker = () => {
    setShowActivityPicker(true);
    setFilteredActivities(activities);
  };

  const handleSelectLetter = (letter: string) => {
    if (selectedLetter === letter) {
      setSelectedLetter(null);
    } else {
      setSelectedLetter(letter);
    }
  };

  const handleSelectFamily = (familyId: string) => {
    if (selectedFamily === familyId) {
      setSelectedFamily(null);
    } else {
      setSelectedFamily(familyId === 'all' ? null : familyId);
    }
  };

  const handleCloseActivityPicker = () => {
    setShowActivityPicker(false);
    setSelectedLetter(null);
    setSelectedFamily(null);
    if (!selectedActivity) {
      setFilteredActivities([]);
    }
  };

  // Helper function for family badge colors
  const getFamilyBadgeStyle = (family: string) => {
    switch (family) {
      case 'HABITAT':
        return { backgroundColor: '#E3F2FD' };
      case 'COMMERCE':
        return { backgroundColor: '#FFF3E0' };
      case 'B2B':
        return { backgroundColor: '#E8F5E9' };
      case 'AUTRE':
        return { backgroundColor: '#F3E5F5' };
      default:
        return { backgroundColor: '#F5F5F5' };
    }
  };

  const handleSelectCity = (city: City) => {
    setSelectedCity(city);
    setCityQuery(city.name);
    setFilteredCities([]);
  };

  const handleCityInputChange = (text: string) => {
    setCityQuery(text);
    if (selectedCity && text !== selectedCity.name) {
      setSelectedCity(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedActivity) {
      Alert.alert('Erreur', 'Veuillez sélectionner une activité');
      return;
    }
    if (!selectedCity) {
      Alert.alert('Erreur', 'Veuillez sélectionner une ville dans la liste');
      return;
    }

    setLoading(true);
    setCurrentSourceIndex(0);
    setScanProgress(0);
    
    // Simuler la progression des sources en temps réel
    const progressInterval = setInterval(() => {
      setCurrentSourceIndex((prev) => {
        if (prev < SCAN_SOURCES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
      setScanProgress((prev) => Math.min(prev + 15, 90));
    }, 4000);

    try {
      const response = await axios.post(
        `${API_URL}/api/scans`,
        {
          activity_id: selectedActivity.id,
          location_label: selectedCity.name,
          radius_km: parseInt(radius),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      clearInterval(progressInterval);
      setScanProgress(100);

      // Redirection automatique vers les résultats
      if (response.data.id) {
        router.replace({
          pathname: '/results',
          params: { scanId: response.data.id },
        });
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      Alert.alert(
        'Erreur',
        error.response?.data?.detail || 'Erreur lors du lancement du scan'
      );
      setLoading(false);
      setCurrentSourceIndex(0);
      setScanProgress(0);
    }
  };

  if (loadingActivities) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <ProspectLocalLogo size={36} variant="icon" />
            <Text style={styles.headerTitle}>Nouveau scan</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1: Activity */}
          <View style={styles.section}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.sectionTitle}>Sélectionnez l'activité</Text>
            
            {/* Search Input */}
            <View style={styles.inputContainer}>
              <Ionicons name="briefcase-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder={loadingActivities ? "Chargement des activités..." : "Rechercher une activité..."}
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={handleOpenActivityPicker}
                editable={!loading && !loadingActivities}
              />
              {loadingActivities ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <TouchableOpacity onPress={handleOpenActivityPicker}>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            {/* Activity Picker with Filters */}
            {showActivityPicker && (
              <View style={styles.activityPicker}>
                {/* Close button */}
                <TouchableOpacity 
                  style={styles.pickerCloseBtn}
                  onPress={handleCloseActivityPicker}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
                
                {/* Category Filter */}
                <View style={styles.categoryFilter}>
                  <Text style={styles.filterTitle}>📁 Catégories</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.categoryRow}>
                      {FAMILIES.map((family) => (
                        <TouchableOpacity
                          key={family.id}
                          style={[
                            styles.categoryBtn,
                            (selectedFamily === family.id || (family.id === 'all' && !selectedFamily)) && styles.categoryBtnActive
                          ]}
                          onPress={() => handleSelectFamily(family.id)}
                        >
                          <Ionicons 
                            name={family.icon as any} 
                            size={16} 
                            color={(selectedFamily === family.id || (family.id === 'all' && !selectedFamily)) ? '#FFF' : '#666'} 
                          />
                          <Text style={[
                            styles.categoryBtnText,
                            (selectedFamily === family.id || (family.id === 'all' && !selectedFamily)) && styles.categoryBtnTextActive
                          ]}>
                            {family.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                
                {/* Letter Filter */}
                <View style={styles.letterFilter}>
                  <Text style={styles.filterTitle}>🔤 Par lettre</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.letterRow}>
                      <TouchableOpacity
                        style={[styles.letterBtn, !selectedLetter && styles.letterBtnActive]}
                        onPress={() => setSelectedLetter(null)}
                      >
                        <Text style={[styles.letterBtnText, !selectedLetter && styles.letterBtnTextActive]}>
                          Tous
                        </Text>
                      </TouchableOpacity>
                      {ALPHABET.map((letter) => (
                        <TouchableOpacity
                          key={letter}
                          style={[
                            styles.letterBtn,
                            selectedLetter === letter && styles.letterBtnActive
                          ]}
                          onPress={() => handleSelectLetter(letter)}
                        >
                          <Text style={[
                            styles.letterBtnText,
                            selectedLetter === letter && styles.letterBtnTextActive
                          ]}>
                            {letter}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                
                {/* Results count */}
                <Text style={styles.resultsCount}>
                  {filteredActivities.length} activité{filteredActivities.length > 1 ? 's' : ''}
                </Text>
                
                {/* Activities List */}
                <ScrollView style={styles.activitiesList} nestedScrollEnabled>
                  {filteredActivities.map((activity) => (
                    <TouchableOpacity
                      key={activity.id}
                      style={styles.activityItem}
                      onPress={() => handleSelectActivity(activity)}
                    >
                      <View style={styles.activityItemContent}>
                        <Text style={styles.activityLabel}>{activity.label}</Text>
                        <View style={[styles.familyBadge, getFamilyBadgeStyle(activity.family)]}>
                          <Text style={styles.familyBadgeText}>{activity.family}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#CCC" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Simple autocomplete when not in picker mode */}
            {!showActivityPicker && filteredActivities.length > 0 && (
              <View style={styles.autocomplete}>
                {filteredActivities.map((activity) => (
                  <TouchableOpacity
                    key={activity.id}
                    style={styles.autocompleteItem}
                    onPress={() => handleSelectActivity(activity)}
                  >
                    <Text style={styles.autocompleteLabel}>{activity.label}</Text>
                    <Text style={styles.autocompleteFamily}>{activity.family}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedActivity && (
              <View style={styles.selectedActivity}>
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                <Text style={styles.selectedText}>{selectedActivity.label}</Text>
                <TouchableOpacity onPress={() => {
                  setSelectedActivity(null);
                  setSearchQuery('');
                }}>
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Step 2: Location with Autocomplete */}
          <View style={styles.section}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.sectionTitle}>Zone géographique</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="location-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Tapez une ville (ex: Lille, Lyon...)"
                placeholderTextColor="#999"
                value={cityQuery}
                onChangeText={handleCityInputChange}
                editable={!loading}
              />
              {loadingCities && (
                <ActivityIndicator size="small" color="#6366F1" />
              )}
            </View>

            {filteredCities.length > 0 && (
              <View style={styles.autocomplete}>
                {filteredCities.map((city, index) => (
                  <TouchableOpacity
                    key={`${city.code}-${index}`}
                    style={styles.autocompleteItem}
                    onPress={() => handleSelectCity(city)}
                  >
                    <View style={styles.cityRow}>
                      <Text style={styles.autocompleteLabel}>{city.name}</Text>
                      <Text style={styles.cityDept}>({city.department_code})</Text>
                    </View>
                    <Text style={styles.autocompleteFamily}>
                      {city.department} • {city.postal_codes[0] || ''}
                      {city.population > 0 && ` • ${(city.population / 1000).toFixed(0)}k hab.`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedCity && (
              <View style={styles.selectedActivity}>
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                <Text style={styles.selectedText}>
                  {selectedCity.name} ({selectedCity.department_code})
                </Text>
              </View>
            )}
          </View>

          {/* Step 3: Radius */}
          <View style={styles.section}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.sectionTitle}>Rayon de recherche</Text>
            <View style={styles.radiusButtons}>
              {['5', '10', '20', '30', '50'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.radiusButton,
                    radius === r && styles.radiusButtonActive,
                  ]}
                  onPress={() => setRadius(r)}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.radiusButtonText,
                      radius === r && styles.radiusButtonTextActive,
                    ]}
                  >
                    {r}km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              loading && styles.submitButtonLoading,
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingButtonContainer}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.loadingText}>🔍 Analyse en cours...</Text>
                
                {/* Progress bar */}
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${scanProgress}%` }]} />
                </View>
                
                {/* Sources en temps réel */}
                <View style={styles.sourcesContainer}>
                  {SCAN_SOURCES.map((source, index) => (
                    <View 
                      key={source.id}
                      style={[
                        styles.sourceItem,
                        index <= currentSourceIndex && styles.sourceItemActive,
                        index === currentSourceIndex && styles.sourceItemCurrent
                      ]}
                    >
                      <Ionicons 
                        name={index < currentSourceIndex ? "checkmark-circle" : index === currentSourceIndex ? "sync" : "ellipse-outline"} 
                        size={16} 
                        color={index <= currentSourceIndex ? source.color : '#999'} 
                      />
                      <Text style={[
                        styles.sourceText,
                        index <= currentSourceIndex && styles.sourceTextActive
                      ]}>
                        {source.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <Ionicons name="search" size={24} color="#FFF" />
                <Text style={styles.submitButtonText}>Lancer le scan</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.infoText}>
            🎯 Prospect Local détecte les entreprises présentes sur Google mais absentes de PagesJaunes — vos meilleurs prospects pour la visibilité locale.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  stepNumber: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1C1C1E',
    paddingVertical: 12,
  },
  autocomplete: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
    overflow: 'hidden',
    maxHeight: 250,
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  autocompleteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  autocompleteFamily: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cityDept: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '500',
  },
  selectedActivity: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F3E5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
  },
  radiusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F7',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  radiusButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  radiusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  radiusButtonTextActive: {
    color: '#FFF',
  },
  submitButton: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  submitButtonLoading: {
    paddingVertical: 20,
    backgroundColor: '#4F46E5',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  loadingButtonContainer: {
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 3,
  },
  sourcesContainer: {
    width: '100%',
    gap: 6,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sourceItemActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sourceItemCurrent: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sourceText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  sourceTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  // Activity Picker Styles
  activityPicker: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    maxHeight: 450,
  },
  pickerCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 10,
  },
  categoryFilter: {
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    gap: 6,
  },
  categoryBtnActive: {
    backgroundColor: '#6366F1',
  },
  categoryBtnText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  categoryBtnTextActive: {
    color: '#FFF',
  },
  letterFilter: {
    marginBottom: 12,
  },
  letterRow: {
    flexDirection: 'row',
    gap: 4,
  },
  letterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterBtnActive: {
    backgroundColor: '#6366F1',
  },
  letterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  letterBtnTextActive: {
    color: '#FFF',
  },
  resultsCount: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  activitiesList: {
    maxHeight: 250,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  activityItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityLabel: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  familyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  familyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
});
