import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '../utils/api';

// Domain options
const DOMAINS = [
  { code: 'habitat', label: 'Habitat', icon: 'home', color: '#3B82F6' },
  { code: 'restauration', label: 'Restauration', icon: 'restaurant', color: '#EF4444' },
  { code: 'beaute', label: 'Beauté', icon: 'flower', color: '#EC4899' },
  { code: 'auto', label: 'Auto', icon: 'car', color: '#F59E0B' },
  { code: 'b2b', label: 'B2B/Services', icon: 'business', color: '#8B5CF6' },
  { code: 'commerce', label: 'Commerce', icon: 'storefront', color: '#10B981' },
  { code: 'sante', label: 'Santé', icon: 'medkit', color: '#06B6D4' },
];

export default function SurveillancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [surveillances, setSurveillances] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  
  // Alerts modal
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [selectedSurveillance, setSelectedSurveillance] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  
  // New surveillance form
  const [formName, setFormName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formRadius, setFormRadius] = useState('20');
  const [formDomains, setFormDomains] = useState<string[]>([]);
  const [formNotifyApp, setFormNotifyApp] = useState(true);
  const [formMaxAgeDays, setFormMaxAgeDays] = useState('30');
  
  // Geo mode: "radius" or "cities"
  const [geoMode, setGeoMode] = useState<'radius' | 'cities'>('radius');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [citySearchText, setCitySearchText] = useState('');
  
  // Frequency
  const [formFrequency, setFormFrequency] = useState('daily');

  // Age filter options
  const AGE_OPTIONS = [
    { value: '7', label: '1 semaine' },
    { value: '14', label: '2 semaines' },
    { value: '30', label: '1 mois' },
    { value: '90', label: '3 mois' },
    { value: '180', label: '6 mois' },
  ];
  
  // Frequency options
  const FREQUENCY_OPTIONS = [
    { value: 'weekly', label: 'Hebdo', desc: '1x/sem (lundi 8h)', credits: '~170/mois' },
    { value: 'daily', label: 'Quotidien', desc: '1x/jour (8h)', credits: '~720/mois' },
    { value: 'twice', label: '2x/jour', desc: '7h et 14h', credits: '~1440/mois' },
  ];
  
  // City suggestions
  const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  useEffect(() => {
    fetchSurveillances();
  }, []);

  const fetchSurveillances = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/surveillances`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSurveillances(response.data || []);
    } catch (error) {
      console.error('Error fetching surveillances:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchCities = async (query: string) => {
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    try {
      const response = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codesPostaux,departement,population&boost=population&limit=5`
      );
      const data = await response.json();
      setCitySuggestions(data);
      setShowCitySuggestions(true);
    } catch (error) {
      console.error('Error searching cities:', error);
    }
  };

  const selectCity = (city: any) => {
    setFormCity(city.nom);
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };

  const toggleDomain = (code: string) => {
    if (formDomains.includes(code)) {
      setFormDomains(formDomains.filter(d => d !== code));
    } else {
      setFormDomains([...formDomains, code]);
    }
  };

  const createSurveillance = async () => {
    // Validation based on geo mode
    if (geoMode === 'radius' && !formCity) {
      Alert.alert('Erreur', 'Veuillez sélectionner une ville');
      return;
    }
    if (geoMode === 'cities' && selectedCities.length === 0) {
      Alert.alert('Erreur', 'Veuillez ajouter au moins une ville');
      return;
    }
    if (formDomains.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un secteur');
      return;
    }
    
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      // Build name based on mode
      const defaultName = geoMode === 'cities' 
        ? `Surveillance ${selectedCities.slice(0, 2).join(', ')}${selectedCities.length > 2 ? '...' : ''}`
        : `Surveillance ${formCity}`;
      
      await axios.post(`${API_URL}/api/surveillances`, {
        name: formName || defaultName,
        geo_mode: geoMode,
        city: geoMode === 'radius' ? formCity : null,
        radius_km: geoMode === 'radius' ? (parseInt(formRadius) || 20) : null,
        cities: geoMode === 'cities' ? selectedCities : [],
        domains: formDomains,
        max_age_days: parseInt(formMaxAgeDays) || 30,
        frequency: formFrequency,
        notify_app: formNotifyApp
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Reset form
      setFormName('');
      setFormCity('');
      setFormRadius('20');
      setFormDomains([]);
      setFormMaxAgeDays('30');
      setFormFrequency('daily');
      setGeoMode('radius');
      setSelectedCities([]);
      setCitySearchText('');
      setShowModal(false);
      
      // Refresh list
      fetchSurveillances();
      Alert.alert('Succès', 'Surveillance créée ! Vous serez alerté lors de nouvelles créations d\'entreprises.');
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const deleteSurveillance = async (id: string) => {
    // Use window.confirm on web since Alert.alert callbacks don't work
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Voulez-vous vraiment supprimer cette surveillance ?')
      : true;
    
    if (!confirmed) return;
    
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(`${API_URL}/api/surveillances/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSurveillances();
    } catch (error) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Erreur lors de la suppression');
      }
    }
  };

  const toggleSurveillance = async (id: string, isActive: boolean) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(`${API_URL}/api/surveillances/${id}`, {
        is_active: !isActive
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSurveillances();
    } catch (error) {
      console.error('Error toggling surveillance:', error);
    }
  };

  const runManualCheck = async () => {
    setRunningCheck(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/surveillances/run`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { results } = response.data;
      const totalNew = results?.reduce((sum: number, r: any) => sum + (r.new_count || 0), 0) || 0;
      
      if (totalNew > 0) {
        Alert.alert('Succès', `${totalNew} nouvelle(s) entreprise(s) détectée(s) !`);
      } else {
        Alert.alert('Terminé', 'Aucune nouvelle entreprise détectée pour le moment.');
      }
      
      fetchSurveillances();
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur lors de la vérification');
    } finally {
      setRunningCheck(false);
    }
  };

  const viewAlerts = async (surveillance: any) => {
    setSelectedSurveillance(surveillance);
    setShowAlertsModal(true);
    setLoadingAlerts(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/surveillances/${surveillance.id}/alerts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlerts(response.data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
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
          <Text style={styles.headerTitle}>Surveillance de Zone</Text>
          <Text style={styles.headerSubtitle}>Alertes automatiques nouvelles entreprises</Text>
        </View>
        {surveillances.length > 0 && (
          <TouchableOpacity 
            style={[styles.checkBtn, runningCheck && styles.checkBtnDisabled]} 
            onPress={runManualCheck}
            disabled={runningCheck}
          >
            {runningCheck ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="refresh" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="notifications" size={32} color="#6366F1" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Comment ça marche ?</Text>
            <Text style={styles.infoText}>
              Configurez une zone et des secteurs d'activité. Vous serez alerté automatiquement 
              dès qu'une nouvelle entreprise est créée dans cette zone (vérification 2x/jour : 7h et 14h).
            </Text>
          </View>
        </View>

        {/* Surveillances List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mes Surveillances ({surveillances.length}/10)</Text>
            {surveillances.length < 10 && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
                <Ionicons name="add" size={20} color="#FFF" />
                <Text style={styles.addBtnText}>Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>

          {surveillances.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="radar-outline" size={64} color="#CCC" />
              <Text style={styles.emptyTitle}>Aucune surveillance</Text>
              <Text style={styles.emptyText}>
                Créez votre première surveillance pour être alerté des nouvelles entreprises
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.emptyBtnText}>Créer une surveillance</Text>
              </TouchableOpacity>
            </View>
          ) : (
            surveillances.map((surveillance) => (
              <View key={surveillance.id} style={styles.surveillanceCard}>
                <View style={styles.surveillanceHeader}>
                  <View style={[styles.statusDot, { backgroundColor: surveillance.is_active ? '#10B981' : '#9CA3AF' }]} />
                  <Text style={styles.surveillanceName}>{surveillance.name}</Text>
                  <TouchableOpacity 
                    style={styles.deleteBtn}
                    onPress={() => deleteSurveillance(surveillance.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.surveillanceInfo}>
                  <View style={styles.infoRow}>
                    <Ionicons name="location" size={16} color="#666" />
                    <Text style={styles.infoValue}>{surveillance.city} • {surveillance.radius_km} km</Text>
                  </View>
                  <View style={styles.domainsRow}>
                    {surveillance.domains?.map((domain: string) => {
                      const domainInfo = DOMAINS.find(d => d.code === domain);
                      return domainInfo ? (
                        <View key={domain} style={[styles.domainTag, { backgroundColor: domainInfo.color + '20' }]}>
                          <Text style={[styles.domainTagText, { color: domainInfo.color }]}>{domainInfo.label}</Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                  {surveillance.last_scan_at && (
                    <View style={styles.infoRow}>
                      <Ionicons name="time-outline" size={16} color="#999" />
                      <Text style={styles.lastScanText}>Dernière vérif: {formatDateTime(surveillance.last_scan_at)}</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.surveillanceFooter}>
                  <TouchableOpacity 
                    style={styles.alertsBtn}
                    onPress={() => viewAlerts(surveillance)}
                  >
                    <Ionicons name="notifications-outline" size={16} color="#6366F1" />
                    <Text style={styles.alertsBtnText}>
                      {surveillance.total_alerts || 0} alertes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, surveillance.is_active && styles.toggleBtnActive]}
                    onPress={() => toggleSurveillance(surveillance.id, surveillance.is_active)}
                  >
                    <Text style={[styles.toggleBtnText, surveillance.is_active && styles.toggleBtnTextActive]}>
                      {surveillance.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle Surveillance</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nom (optionnel)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Ex: Plombiers Lille"
                  value={formName}
                  onChangeText={setFormName}
                />
              </View>

              {/* Geo Mode Toggle */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Zone géographique *</Text>
                <View style={styles.geoModeToggle}>
                  <TouchableOpacity 
                    style={[styles.geoModeBtn, geoMode === 'radius' && styles.geoModeBtnActive]}
                    onPress={() => setGeoMode('radius')}
                  >
                    <Ionicons name="radio-button-on" size={16} color={geoMode === 'radius' ? '#FFF' : '#666'} />
                    <Text style={[styles.geoModeBtnText, geoMode === 'radius' && styles.geoModeBtnTextActive]}>
                      Ville + Rayon
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.geoModeBtn, geoMode === 'cities' && styles.geoModeBtnActive]}
                    onPress={() => setGeoMode('cities')}
                  >
                    <Ionicons name="list" size={16} color={geoMode === 'cities' ? '#FFF' : '#666'} />
                    <Text style={[styles.geoModeBtnText, geoMode === 'cities' && styles.geoModeBtnTextActive]}>
                      Villes précises
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Mode Radius: City + Radius */}
              {geoMode === 'radius' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Ville *</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Rechercher une ville..."
                      value={formCity}
                      onChangeText={(text) => {
                        setFormCity(text);
                        searchCities(text);
                      }}
                    />
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <View style={styles.suggestions}>
                        {citySuggestions.map((city) => (
                          <TouchableOpacity 
                            key={city.code} 
                            style={styles.suggestionItem}
                            onPress={() => selectCity(city)}
                          >
                            <Ionicons name="location-outline" size={16} color="#666" />
                            <Text style={styles.suggestionText}>
                              {city.nom} - {city.departement?.nom} ({city.codesPostaux?.[0]})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Rayon (km)</Text>
                    <View style={styles.radiusOptions}>
                      {['10', '20', '30', '50'].map((r) => (
                        <TouchableOpacity 
                          key={r}
                          style={[styles.radiusBtn, formRadius === r && styles.radiusBtnActive]}
                          onPress={() => setFormRadius(r)}
                        >
                          <Text style={[styles.radiusBtnText, formRadius === r && styles.radiusBtnTextActive]}>
                            {r} km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* Mode Cities: Multiple cities selection */}
              {geoMode === 'cities' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Villes à surveiller *</Text>
                  <View style={styles.cityInputRow}>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="Ajouter une ville..."
                      value={citySearchText}
                      onChangeText={(text) => {
                        setCitySearchText(text);
                        searchCities(text);
                      }}
                    />
                  </View>
                  {showCitySuggestions && citySuggestions.length > 0 && (
                    <View style={styles.suggestions}>
                      {citySuggestions.map((city) => (
                        <TouchableOpacity 
                          key={city.code} 
                          style={styles.suggestionItem}
                          onPress={() => {
                            if (!selectedCities.includes(city.nom)) {
                              setSelectedCities([...selectedCities, city.nom]);
                            }
                            setCitySearchText('');
                            setShowCitySuggestions(false);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#10B981" />
                          <Text style={styles.suggestionText}>
                            {city.nom} - {city.departement?.nom}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {/* Selected cities list */}
                  {selectedCities.length > 0 && (
                    <View style={styles.selectedCitiesList}>
                      {selectedCities.map((cityName) => (
                        <View key={cityName} style={styles.selectedCityTag}>
                          <Text style={styles.selectedCityText}>{cityName}</Text>
                          <TouchableOpacity 
                            onPress={() => setSelectedCities(selectedCities.filter(c => c !== cityName))}
                            style={styles.removeCityBtn}
                          >
                            <Ionicons name="close-circle" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={styles.formHint}>
                    {selectedCities.length} ville(s) sélectionnée(s) (max 10)
                  </Text>
                </View>
              )}

              {/* Domains */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Secteurs d'activité *</Text>
                <View style={styles.domainsGrid}>
                  {DOMAINS.map((domain) => (
                    <TouchableOpacity 
                      key={domain.code}
                      style={[
                        styles.domainOption, 
                        formDomains.includes(domain.code) && { backgroundColor: domain.color + '20', borderColor: domain.color }
                      ]}
                      onPress={() => toggleDomain(domain.code)}
                    >
                      <Ionicons 
                        name={domain.icon as any} 
                        size={20} 
                        color={formDomains.includes(domain.code) ? domain.color : '#666'} 
                      />
                      <Text style={[
                        styles.domainOptionText,
                        formDomains.includes(domain.code) && { color: domain.color }
                      ]}>
                        {domain.label}
                      </Text>
                      {formDomains.includes(domain.code) && (
                        <Ionicons name="checkmark-circle" size={18} color={domain.color} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Frequency Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Fréquence de vérification *</Text>
                <View style={styles.frequencyOptions}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.frequencyBtn, formFrequency === opt.value && styles.frequencyBtnActive]}
                      onPress={() => setFormFrequency(opt.value)}
                    >
                      <Text style={[styles.frequencyLabel, formFrequency === opt.value && styles.frequencyLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.frequencyDesc, formFrequency === opt.value && styles.frequencyDescActive]}>
                        {opt.desc}
                      </Text>
                      <Text style={[styles.frequencyCredits, formFrequency === opt.value && styles.frequencyCreditsActive]}>
                        {opt.credits}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Max Age Filter */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ancienneté maximum *</Text>
                <Text style={styles.formHint}>Entreprises créées il y a moins de :</Text>
                <View style={styles.ageOptions}>
                  {AGE_OPTIONS.map((opt) => (
                    <TouchableOpacity 
                      key={opt.value}
                      style={[styles.ageBtn, formMaxAgeDays === opt.value && styles.ageBtnActive]}
                      onPress={() => setFormMaxAgeDays(opt.value)}
                    >
                      <Text style={[styles.ageBtnText, formMaxAgeDays === opt.value && styles.ageBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
                onPress={createSurveillance}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="radar" size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>Créer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alerts Modal */}
      <Modal visible={showAlertsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.alertsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Alertes - {selectedSurveillance?.name || 'Zone'}
              </Text>
              <TouchableOpacity onPress={() => setShowAlertsModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {loadingAlerts ? (
              <View style={styles.alertsLoading}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>Chargement des alertes...</Text>
              </View>
            ) : alerts.length === 0 ? (
              <View style={styles.alertsEmpty}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                <Text style={styles.alertsEmptyTitle}>Aucune alerte</Text>
                <Text style={styles.alertsEmptyText}>
                  Les nouvelles entreprises détectées apparaîtront ici
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.alertsList} showsVerticalScrollIndicator={false}>
                {alerts.map((alert) => {
                  const domainInfo = DOMAINS.find(d => d.code === alert.domain);
                  return (
                    <View key={alert.id} style={[styles.alertCard, alert.is_read && styles.alertCardRead]}>
                      <View style={styles.alertHeader}>
                        <View style={[styles.alertDomainBadge, { backgroundColor: (domainInfo?.color || '#6366F1') + '20' }]}>
                          <Ionicons 
                            name={(domainInfo?.icon as any) || 'business'} 
                            size={14} 
                            color={domainInfo?.color || '#6366F1'} 
                          />
                          <Text style={[styles.alertDomainText, { color: domainInfo?.color || '#6366F1' }]}>
                            {domainInfo?.label || alert.domain}
                          </Text>
                        </View>
                        {!alert.is_read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.alertBusinessName}>{alert.business_name}</Text>
                      <View style={styles.alertInfoRow}>
                        <Ionicons name="location-outline" size={14} color="#666" />
                        <Text style={styles.alertInfoText}>{alert.business_city}</Text>
                      </View>
                      {alert.date_creation && (
                        <View style={styles.alertInfoRow}>
                          <Ionicons name="calendar-outline" size={14} color="#666" />
                          <Text style={styles.alertInfoText}>Créée le {formatDate(alert.date_creation)}</Text>
                        </View>
                      )}
                      <Text style={styles.alertDate}>Détectée le {formatDateTime(alert.created_at)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.closeAlertsBtn} 
                onPress={() => setShowAlertsModal(false)}
              >
                <Text style={styles.closeAlertsBtnText}>Fermer</Text>
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
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#6366F1',
    lineHeight: 18,
  },
  section: {
    marginBottom: 20,
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
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  surveillanceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  surveillanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  surveillanceName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  deleteBtn: {
    padding: 8,
  },
  surveillanceInfo: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoValue: {
    fontSize: 13,
    color: '#666',
  },
  domainsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  domainTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  domainTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  surveillanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  alertCount: {
    fontSize: 12,
    color: '#999',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  toggleBtnActive: {
    backgroundColor: '#D1FAE5',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleBtnTextActive: {
    color: '#059669',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalBody: {
    padding: 16,
    maxHeight: 450,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  suggestions: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    marginTop: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#374151',
  },
  radiusOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  radiusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  radiusBtnActive: {
    backgroundColor: '#6366F1',
  },
  radiusBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  radiusBtnTextActive: {
    color: '#FFF',
  },
  domainsGrid: {
    gap: 8,
  },
  domainOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  domainOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Check button in header
  checkBtn: {
    backgroundColor: '#10B981',
    padding: 10,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  checkBtnDisabled: {
    opacity: 0.6,
  },
  // Last scan text
  lastScanText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  // Alerts button
  alertsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    gap: 6,
  },
  alertsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
  },
  // Alerts modal
  alertsModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  alertsLoading: {
    padding: 40,
    alignItems: 'center',
  },
  alertsEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  alertsEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
  },
  alertsEmptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  alertsList: {
    padding: 16,
    maxHeight: 400,
  },
  alertCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },
  alertCardRead: {
    opacity: 0.7,
    borderLeftColor: '#D1D5DB',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  alertDomainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  alertDomainText: {
    fontSize: 11,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  alertBusinessName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  alertInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  alertInfoText: {
    fontSize: 13,
    color: '#666',
  },
  alertDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'right',
  },
  closeAlertsBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6366F1',
    alignItems: 'center',
  },
  closeAlertsBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Age filter styles
  formHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  ageOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  ageBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  ageBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  ageBtnTextActive: {
    color: '#FFF',
  },
  // Geo mode toggle
  geoModeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  geoModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  geoModeBtnActive: {
    backgroundColor: '#6366F1',
  },
  geoModeBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  geoModeBtnTextActive: {
    color: '#FFF',
  },
  // City input row
  cityInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  // Selected cities list
  selectedCitiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectedCityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  selectedCityText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
  },
  removeCityBtn: {
    padding: 2,
  },
  // Frequency options
  frequencyOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  frequencyBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  frequencyBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  frequencyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  frequencyLabelActive: {
    color: '#6366F1',
  },
  frequencyDesc: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  frequencyDescActive: {
    color: '#6366F1',
  },
  frequencyCredits: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  frequencyCreditsActive: {
    color: '#818CF8',
  },
});
