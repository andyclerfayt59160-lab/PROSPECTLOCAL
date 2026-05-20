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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

import { API_URL } from '../utils/api';

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
  
  // Activity selection mode: single activity or by domain
  const [activityMode, setActivityMode] = useState<'single' | 'domain'>('single');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  
  // City autocomplete
  const [cityQuery, setCityQuery] = useState('');
  const [filteredCities, setFilteredCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  
  // Multi-city search mode
  const [searchMode, setSearchMode] = useState<'radius' | 'multi'>('radius');
  const [selectedCities, setSelectedCities] = useState<City[]>([]);
  
  const [radius, setRadius] = useState('10');
  const [loading, setLoading] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(true);
  
  // Scan progress state
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  
  // Warning modal for domain scan
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [estimatedActivities, setEstimatedActivities] = useState(0);

  // Alphabet for letter filter
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  // Activity families/categories (also used as domains)
  const DOMAINS = [
    { id: 'Habitat', label: 'Habitat', icon: 'home-outline', color: '#FF9500' },
    { id: 'Commerce', label: 'Commerce', icon: 'storefront-outline', color: '#007AFF' },
    { id: 'Restauration', label: 'Restauration', icon: 'restaurant-outline', color: '#FF3B30' },
    { id: 'Beauté', label: 'Beauté', icon: 'sparkles-outline', color: '#FF2D92' },
    { id: 'Santé', label: 'Santé', icon: 'medkit-outline', color: '#34C759' },
    { id: 'Auto', label: 'Auto', icon: 'car-outline', color: '#5856D6' },
    { id: 'B2B', label: 'B2B', icon: 'business-outline', color: '#8E8E93' },
    { id: 'Autre', label: 'Autre', icon: 'ellipsis-horizontal-outline', color: '#636366' },
  ];
  
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
    if (searchMode === 'multi') {
      // In multi mode, add to list if not already present
      if (!selectedCities.find(c => c.code === city.code)) {
        setSelectedCities([...selectedCities, city]);
      }
      setCityQuery('');
      setFilteredCities([]);
    } else {
      // In radius mode, set single city
      setSelectedCity(city);
      setCityQuery(city.name);
      setFilteredCities([]);
    }
  };

  const handleRemoveCity = (cityCode: string) => {
    setSelectedCities(selectedCities.filter(c => c.code !== cityCode));
  };

  const handleCityInputChange = (text: string) => {
    setCityQuery(text);
    if (searchMode === 'radius' && selectedCity && text !== selectedCity.name) {
      setSelectedCity(null);
    }
  };

  // Domain selection handlers
  const toggleDomain = (domainId: string) => {
    setSelectedDomains(prev => 
      prev.includes(domainId) 
        ? prev.filter(d => d !== domainId)
        : [...prev, domainId]
    );
  };

  const getActivitiesCountForDomains = () => {
    return activities.filter(a => selectedDomains.includes(a.family)).length;
  };

  const handleSubmit = async () => {
    // Validation based on activity mode
    if (activityMode === 'single' && !selectedActivity) {
      Alert.alert('Erreur', 'Veuillez sélectionner une activité');
      return;
    }
    if (activityMode === 'domain' && selectedDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un domaine');
      return;
    }
    
    // Validation based on search mode
    if (searchMode === 'radius' && !selectedCity) {
      Alert.alert('Erreur', 'Veuillez sélectionner une ville dans la liste');
      return;
    }
    if (searchMode === 'multi' && selectedCities.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins une ville');
      return;
    }

    // Show warning for domain mode
    if (activityMode === 'domain') {
      const count = getActivitiesCountForDomains();
      setEstimatedActivities(count);
      setShowWarningModal(true);
      return;
    }

    // Execute single activity scan
    await executeScan();
  };

  const executeScan = async () => {
    setShowWarningModal(false);
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
      // Build request body based on activity mode and search mode
      const requestBody: any = {
        search_mode: searchMode,
        activity_mode: activityMode,
      };
      
      // Activity or domains
      if (activityMode === 'single') {
        requestBody.activity_id = selectedActivity!.id;
      } else {
        requestBody.domains = selectedDomains;
      }
      
      // Location
      if (searchMode === 'radius') {
        requestBody.location_label = selectedCity!.name;
        requestBody.radius_km = parseInt(radius);
        requestBody.additional_cities = [];
      } else {
        // Multi-city mode
        requestBody.location_label = selectedCities[0].name;
        requestBody.radius_km = 0;
        requestBody.additional_cities = selectedCities.slice(1).map(c => c.name);
      }
      
      const response = await axios.post(
        `${API_URL}/api/scans`,
        requestBody,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 300000 // 5 min timeout for domain scans
        }
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
            onPress={() => router.replace('/home')}
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
          {/* Step 1: Activity or Domain */}
          <View style={styles.section}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.sectionTitle}>Type de recherche</Text>
            
            {/* Activity Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, activityMode === 'single' && styles.modeBtnActive]}
                onPress={() => {
                  setActivityMode('single');
                  setSelectedDomains([]);
                }}
                disabled={loading}
              >
                <Ionicons name="briefcase-outline" size={18} color={activityMode === 'single' ? '#FFF' : '#666'} />
                <Text style={[styles.modeBtnText, activityMode === 'single' && styles.modeBtnTextActive]}>
                  Par activité
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, activityMode === 'domain' && styles.modeBtnActive]}
                onPress={() => {
                  setActivityMode('domain');
                  setSelectedActivity(null);
                  setSearchQuery('');
                }}
                disabled={loading}
              >
                <Ionicons name="layers-outline" size={18} color={activityMode === 'domain' ? '#FFF' : '#666'} />
                <Text style={[styles.modeBtnText, activityMode === 'domain' && styles.modeBtnTextActive]}>
                  Par domaine
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* Single Activity Mode */}
            {activityMode === 'single' && (
              <>
                {/* Search Input */}
                <View style={[styles.inputContainer, { marginTop: 16 }]}>
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
              </>
            )}
            
            {/* Domain Mode */}
            {activityMode === 'domain' && (
              <>
                <Text style={styles.domainHint}>
                  Sélectionnez un ou plusieurs domaines pour scanner toutes leurs activités
                </Text>
                <View style={styles.domainsGrid}>
                  {DOMAINS.map((domain) => {
                    const isSelected = selectedDomains.includes(domain.id);
                    const domainActivitiesCount = activities.filter(a => a.family === domain.id).length;
                    return (
                      <TouchableOpacity
                        key={domain.id}
                        style={[
                          styles.domainCard,
                          isSelected && { borderColor: domain.color, backgroundColor: `${domain.color}15` }
                        ]}
                        onPress={() => toggleDomain(domain.id)}
                        disabled={loading}
                      >
                        <View style={[styles.domainIconCircle, { backgroundColor: isSelected ? domain.color : '#F2F2F7' }]}>
                          <Ionicons 
                            name={domain.icon as any} 
                            size={24} 
                            color={isSelected ? '#FFF' : '#666'} 
                          />
                        </View>
                        <Text style={[styles.domainLabel, isSelected && { color: domain.color, fontWeight: '700' }]}>
                          {domain.label}
                        </Text>
                        <Text style={styles.domainCount}>
                          {domainActivitiesCount} activités
                        </Text>
                        {isSelected && (
                          <View style={[styles.domainCheck, { backgroundColor: domain.color }]}>
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                
                {selectedDomains.length > 0 && (
                  <View style={styles.domainSummary}>
                    <Ionicons name="information-circle" size={18} color="#6366F1" />
                    <Text style={styles.domainSummaryText}>
                      {selectedDomains.length} domaine{selectedDomains.length > 1 ? 's' : ''} • {getActivitiesCountForDomains()} activités
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Step 2: Search Mode + Location */}
          <View style={styles.section}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.sectionTitle}>Zone géographique</Text>
            
            {/* Search Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, searchMode === 'radius' && styles.modeBtnActive]}
                onPress={() => {
                  setSearchMode('radius');
                  setSelectedCities([]);
                }}
                disabled={loading}
              >
                <Ionicons name="locate" size={18} color={searchMode === 'radius' ? '#FFF' : '#666'} />
                <Text style={[styles.modeBtnText, searchMode === 'radius' && styles.modeBtnTextActive]}>
                  Ville + Rayon
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, searchMode === 'multi' && styles.modeBtnActive]}
                onPress={() => {
                  setSearchMode('multi');
                  setSelectedCity(null);
                  setCityQuery('');
                }}
                disabled={loading}
              >
                <Ionicons name="list" size={18} color={searchMode === 'multi' ? '#FFF' : '#666'} />
                <Text style={[styles.modeBtnText, searchMode === 'multi' && styles.modeBtnTextActive]}>
                  Plusieurs villes
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* City Input */}
            <View style={[styles.inputContainer, { marginTop: 16 }]}>
              <Ionicons name="location-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder={searchMode === 'multi' ? "Ajouter une ville..." : "Tapez une ville (ex: Lille, Lyon...)"}
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

            {/* Single city display (radius mode) */}
            {searchMode === 'radius' && selectedCity && (
              <View style={styles.selectedActivity}>
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                <Text style={styles.selectedText}>
                  {selectedCity.name} ({selectedCity.department_code})
                </Text>
              </View>
            )}
            
            {/* Multiple cities display (multi mode) */}
            {searchMode === 'multi' && selectedCities.length > 0 && (
              <View style={styles.selectedCitiesContainer}>
                {selectedCities.map((city) => (
                  <View key={city.code} style={styles.selectedCityChip}>
                    <Text style={styles.selectedCityText}>{city.name}</Text>
                    <TouchableOpacity onPress={() => handleRemoveCity(city.code)}>
                      <Ionicons name="close-circle" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Step 3: Radius - Only in radius mode */}
          {searchMode === 'radius' && (
            <View style={styles.section}>
              <Text style={styles.stepNumber}>3</Text>
              <Text style={styles.sectionTitle}>Rayon de recherche</Text>
              <View style={styles.radiusButtons}>
                {['1', '5', '10', '20', '30', '50'].map((r) => (
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
          )}

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
            🎯 Trouvez les entreprises actives sur Google mais absentes de PagesJaunes — vos meilleurs prospects pour la visibilité locale.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Warning Modal for Domain Scan */}
      <Modal
        visible={showWarningModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWarningModal(false)}
      >
        <View style={styles.warningModal}>
          <View style={styles.warningContent}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={48} color="#FF9500" />
            </View>
            <Text style={styles.warningTitle}>
              Scan par domaine
            </Text>
            <Text style={styles.warningText}>
              Vous allez scanner {selectedDomains.length} domaine{selectedDomains.length > 1 ? 's' : ''} avec plusieurs activités.
              Ce scan peut prendre plusieurs minutes.
            </Text>
            <View style={styles.warningEstimate}>
              <Text style={styles.warningEstimateText}>
                {estimatedActivities} activités
              </Text>
              <Text style={styles.warningEstimateLabel}>
                ≈ {Math.ceil(estimatedActivities * 0.5)} min. estimées
              </Text>
            </View>
            <View style={styles.warningButtons}>
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
                <Text style={styles.warningConfirmText}>Lancer</Text>
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
  // Multi-city mode styles
  modeToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
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
  selectedCitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
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
  // Domain mode styles
  domainHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  domainsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  domainCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    position: 'relative',
  },
  domainIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  domainLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  domainCount: {
    fontSize: 11,
    color: '#8E8E93',
  },
  domainCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  domainSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F0F0FF',
    borderRadius: 10,
  },
  domainSummaryText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  // Warning Modal
  warningModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  warningIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  warningEstimate: {
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningEstimateText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF9500',
    textAlign: 'center',
  },
  warningEstimateLabel: {
    fontSize: 12,
    color: '#FF9500',
    textAlign: 'center',
    marginTop: 4,
  },
  warningButtons: {
    flexDirection: 'row',
    gap: 12,
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
});
