import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Linking,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { TourMap } from '../components/TourMap';
import ManualVisiteModal from '../components/visites/ManualVisiteModal';
import VisitesTourPlanner from '../components/visites/VisitesTourPlanner';
import { useData } from '../contexts/DataContext';
import * as Location from 'expo-location';
import {
  buildGoogleMapsDirectionsUrl,
  calculateDistance,
  calculateTourMetrics,
  hasCoordinates,
  optimizeTourOrder as optimizeRouteOrder,
} from '../utils/tourPlanning';

import { API_URL } from '../utils/api';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface AddressSuggestion {
  label: string;
  address: string;
  city: string;
  postal_code: string;
  latitude?: number;
  longitude?: number;
}

// Dictionnaire codes NAF -> libelles (activites Solocal prioritaires)
const NAF_LABELS: { [code: string]: string } = {
  // HABITAT / BTP
  "43.22A": "Plombier / Chauffagiste",
  "43.22B": "Climatisation / Froid",
  "43.21A": "Electricien",
  "43.11Z": "Demolition",
  "43.12A": "Terrassement",
  "43.31Z": "Platrier",
  "43.32A": "Menuisier",
  "43.33Z": "Carreleur / Solier",
  "43.34Z": "Peintre en batiment",
  "43.91A": "Couvreur / Charpentier",
  // COMMERCE
  "47.11A": "Commerce alimentaire",
  "47.11B": "Epicerie / Superette",
  "47.21Z": "Fruits & Legumes",
  "47.73Z": "Pharmacie",
  "47.75Z": "Parfumerie",
  "47.76Z": "Fleuriste",
  "47.77Z": "Bijouterie / Horlogerie",
  // RESTAURATION
  "56.10A": "Restaurant traditionnel",
  "56.10B": "Cafe / Brasserie",
  "56.10C": "Restauration rapide",
  "56.21Z": "Traiteur / Evenementiel",
  "56.30Z": "Bar / Debit de boissons",
  // BEAUTE
  "96.02A": "Coiffeur",
  "96.02B": "Institut de beaute",
  "96.04Z": "Bien-etre / Spa",
  "96.09Z": "Services personnels",
  // AUTO
  "45.20A": "Garage automobile",
  "45.20B": "Carrosserie",
  "45.32Z": "Commerce auto pieces",
  "45.40Z": "Moto / Cycles",
  // SANTE
  "86.21Z": "Medecin generaliste",
  "86.22A": "Specialiste medical",
  "86.22B": "Chirurgien",
  "86.23Z": "Dentiste",
  "86.90A": "Ambulances",
  "86.90D": "Infirmier",
  // B2B / SERVICES
  "69.10Z": "Avocat",
  "69.20Z": "Expert-comptable",
  "70.22Z": "Conseil / Consulting",
  "71.11Z": "Architecte",
  "73.11Z": "Agence de pub / Communication",
  "74.10Z": "Design / Création",
  // AUTRES
  "96.01A": "Blanchisserie",
  "96.01B": "Pressing / Teinturerie",
  "95.23Z": "Cordonnier",
  "74.20Z": "Photographe",
};

// Fonction helper pour obtenir le libellé d'activité
const getActivityLabel = (libelle_naf?: string, activite_naf?: string): string | null => {
  // 1. Si libelle_naf existe, l'utiliser
  if (libelle_naf && libelle_naf.trim()) return libelle_naf;
  // 2. Sinon, chercher dans notre dictionnaire
  if (activite_naf && NAF_LABELS[activite_naf]) return NAF_LABELS[activite_naf];
  // 3. Sinon, afficher le code brut s'il existe
  if (activite_naf && activite_naf.trim()) return activite_naf;
  return null;
};

// Mapping codes NAF -> Domaines d'activité
const NAF_TO_DOMAIN: { [code: string]: string } = {
  // HABITAT / BTP
  "43.22A": "habitat", "43.22B": "habitat", "43.21A": "habitat", "43.11Z": "habitat",
  "43.12A": "habitat", "43.31Z": "habitat", "43.32A": "habitat", "43.33Z": "habitat",
  "43.34Z": "habitat", "43.91A": "habitat",
  // COMMERCE
  "47.11A": "commerce", "47.11B": "commerce", "47.21Z": "commerce", "47.73Z": "commerce",
  "47.75Z": "commerce", "47.76Z": "commerce", "47.77Z": "commerce",
  // RESTAURATION
  "56.10A": "restauration", "56.10B": "restauration", "56.10C": "restauration",
  "56.21Z": "restauration", "56.30Z": "restauration",
  // BEAUTE
  "96.02A": "beaute", "96.02B": "beaute", "96.04Z": "beaute", "96.09Z": "beaute",
  // AUTO
  "45.20A": "auto", "45.20B": "auto", "45.32Z": "auto", "45.40Z": "auto",
  // SANTE
  "86.21Z": "sante", "86.22A": "sante", "86.22B": "sante", "86.23Z": "sante",
  "86.90A": "sante", "86.90D": "sante",
  // B2B / SERVICES
  "69.10Z": "b2b", "69.20Z": "b2b", "70.22Z": "b2b", "71.11Z": "b2b",
  "73.11Z": "b2b", "74.10Z": "b2b",
  // AUTRES
  "96.01A": "autre", "96.01B": "autre", "95.23Z": "autre", "74.20Z": "autre",
};

// Labels des domaines pour l'affichage
const DOMAIN_LABELS: { [key: string]: { label: string; icon: string; color: string } } = {
  "all": { label: "Tous", icon: "apps", color: "#6366F1" },
  "habitat": { label: "Habitat / BTP", icon: "home", color: "#FF6B35" },
  "commerce": { label: "Commerce", icon: "cart", color: "#4CAF50" },
  "restauration": { label: "Restauration", icon: "restaurant", color: "#FF9800" },
  "beaute": { label: "Beaute", icon: "sparkles", color: "#E91E63" },
  "auto": { label: "Auto / Moto", icon: "car", color: "#2196F3" },
  "sante": { label: "Sante", icon: "medkit", color: "#00BCD4" },
  "b2b": { label: "B2B / Services", icon: "briefcase", color: "#9C27B0" },
  "autre": { label: "Autres", icon: "ellipsis-horizontal", color: "#607D8B" },
  "non_classe": { label: "Non classe", icon: "help-circle", color: "#9E9E9E" },
};

// Fonction pour obtenir le domaine d'une entreprise
const getBusinessDomain = (activite_naf?: string): string => {
  if (!activite_naf) return "non_classe";
  return NAF_TO_DOMAIN[activite_naf] || "non_classe";
};

// Statuts de visite avec couleurs
const VISITE_STATUS_MAP: { [key: string]: { label: string; color: string; icon: string } } = {
  'non_visite': { label: 'Non visite', color: '#8E8E93', icon: 'time-outline' },
  'visite': { label: 'Visite', color: '#34C759', icon: 'checkmark-circle' },
  'a_revisiter': { label: 'À revisiter', color: '#FF9500', icon: 'refresh' },
  'interesse': { label: 'Interesse', color: '#FFD700', icon: 'star' },
  'pas_interesse': { label: 'Pas interesse', color: '#FF3B30', icon: 'close-circle' },
  'client': { label: 'Client', color: '#AF52DE', icon: 'trophy' },
};

const CONTACT_MODE_META: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  appel: { label: 'A appeler', color: '#047857', bg: '#D1FAE5', icon: 'call-outline' },
  visite: { label: 'À visiter', color: '#7C3AED', bg: '#EDE9FE', icon: 'walk-outline' },
  creuser: { label: 'A creuser', color: '#B45309', bg: '#FEF3C7', icon: 'search-outline' },
  verifier: { label: 'À vérifier', color: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' },
};

const PHONE_RELIABILITY_META: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  verified: { color: '#047857', bg: '#D1FAE5', icon: 'checkmark-circle-outline' },
  review: { color: '#B45309', bg: '#FEF3C7', icon: 'help-circle-outline' },
  rejected: { color: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle-outline' },
  missing: { color: '#6B7280', bg: '#F3F4F6', icon: 'remove-circle-outline' },
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
  libelle_naf?: string;
  has_pagesjaunes: boolean;
  score: number;
  source: string;
  lead_type: string;
  scan_id: string;
  scan_label?: string;
  visite_status?: string;
  recommended_contact_mode?: 'appel' | 'visite' | 'creuser' | 'verifier';
  next_best_action?: string;
  next_best_action_detail?: string;
  phone_reliability_status?: 'verified' | 'review' | 'rejected' | 'missing';
  phone_reliability_label?: string;
  phone_reliability_reason?: string;
  visited_at?: string;
  contacted_at?: string;
  client_since?: string;
  latitude?: number;
  longitude?: number;
  distance?: number; // Distance calculee depuis la position utilisateur
}

// Modes de tri disponibles
type SortMode = 'default' | 'proximity' | 'tour';

const EMPTY_MANUAL_VISITE_FORM = {
  name: '',
  address: '',
  city: '',
  postal_code: '',
  phone: '',
  siret: '',
  note: '',
};

export default function VisitesScreen() {
  const router = useRouter();
  const { visites: cachedVisites, refreshVisites, deleteVisite, loadingVisites } = useData();
  const [businesses, setBusinesses] = useState<VisiteBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [token, setToken] = useState('');
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'pappers' | 'autres'>('all');
  const [ageFilter, setAgeFilter] = useState<number | null>(1); // Default: 1 year (only recent companies)
  const [domainFilter, setDomainFilter] = useState<string>('all'); // Nouveau filtre par domaine
  const [counts, setCounts] = useState({ total: 0, pappers: 0, autres: 0 });
  const [domainCounts, setDomainCounts] = useState<{ [key: string]: number }>({}); // Compteurs par domaine

  // Geolocalisation et tri
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [showTourMap, setShowTourMap] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tourActionMessage, setTourActionMessage] = useState<string | null>(null);
  const [tourActionTone, setTourActionTone] = useState<'info' | 'success' | 'warning'>('info');
  const [optimizingTour, setOptimizingTour] = useState(false);
  const [launchingTour, setLaunchingTour] = useState(false);
  const [tourStopLimit, setTourStopLimit] = useState(12);
  const [showManualVisiteModal, setShowManualVisiteModal] = useState(false);
  const [creatingManualVisite, setCreatingManualVisite] = useState(false);
  const [manualVisiteForm, setManualVisiteForm] = useState(EMPTY_MANUAL_VISITE_FORM);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [loadingAddressSuggestions, setLoadingAddressSuggestions] = useState(false);
  const [customTourStartQuery, setCustomTourStartQuery] = useState('');
  const [customTourStartSuggestions, setCustomTourStartSuggestions] = useState<AddressSuggestion[]>([]);
  const [loadingCustomTourStartSuggestions, setLoadingCustomTourStartSuggestions] = useState(false);
  const [customTourStartLocation, setCustomTourStartLocation] = useState<UserLocation | null>(null);
  const [customTourStartLabel, setCustomTourStartLabel] = useState('');
  const [quickStatusBusinessId, setQuickStatusBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const loadPersistedTourStart = async () => {
      try {
        const raw = await AsyncStorage.getItem('prospectlocal_tour_start');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (
          typeof saved?.latitude === 'number' &&
          typeof saved?.longitude === 'number'
        ) {
          setCustomTourStartLocation({
            latitude: saved.latitude,
            longitude: saved.longitude,
          });
          setCustomTourStartLabel(saved.label || '');
          setCustomTourStartQuery(saved.label || '');
        }
      } catch (error) {
        console.error('Error loading persisted tour start:', error);
      }
    };

    loadPersistedTourStart();
  }, []);

  const addReferenceDistance = useCallback(
    (items: VisiteBusiness[], startLocation: UserLocation) =>
      items.map((business) => {
        if (!hasCoordinates(business)) {
          return { ...business, distance: 9999 };
        }

        return {
          ...business,
          distance: calculateDistance(
            startLocation.latitude,
            startLocation.longitude,
            business.latitude as number,
            business.longitude as number
          ),
        };
      }),
    []
  );

  // Demander la permission et obtenir la position
  const requestLocation = async () => {
    try {
      setLocationLoading(true);
      setLocationError(null);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission de localisation refusee');
        Alert.alert(
          'Permission requise',
          'Activez la localisation pour trier par proximité ou optimiser votre tournée.'
        );
        return null;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(newLocation);
      return newLocation;
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError('Impossible d\'obtenir votre position');
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  // Calculer les distances et trier
  const sortedAndFilteredBusinesses = React.useMemo(() => {
    let result = businesses.filter(b => {
      if (domainFilter === 'all') return true;
      return getBusinessDomain(b.activite_naf) === domainFilter;
    });

    if (!userLocation || sortMode === 'default') {
      return result;
    }

    // Ajouter les distances
    result = result.map(b => {
      if (hasCoordinates(b)) {
        return {
          ...b,
          distance: calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            b.latitude as number,
            b.longitude as number
          ),
        };
      }
      return { ...b, distance: 9999 }; // Entreprises sans coordonnées à la fin
    });

    if (sortMode === 'proximity') {
      // Tri simple par distance
      return result.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
    }

    if (sortMode === 'tour') {
      // Optimisation tournee (plus proche voisin)
      return optimizeTourOrder(result, userLocation);
    }

    return result;
  }, [businesses, domainFilter, userLocation, sortMode]);

  const filterOnlyBusinesses = React.useMemo(
    () =>
      businesses.filter((business) => {
        if (domainFilter === 'all') return true;
        return getBusinessDomain(business.activite_naf) === domainFilter;
      }),
    [businesses, domainFilter]
  );

  const inferredTourStartLocation = React.useMemo(() => {
    if (customTourStartLocation) {
      return customTourStartLocation;
    }

    if (userLocation) {
      return userLocation;
    }

    const firstMappedBusiness = filterOnlyBusinesses.find(
      (business) =>
        typeof business.latitude === 'number' &&
        typeof business.longitude === 'number'
    );

    if (!firstMappedBusiness) {
      return null;
    }

    return {
      latitude: firstMappedBusiness.latitude as number,
      longitude: firstMappedBusiness.longitude as number,
    };
  }, [customTourStartLocation, filterOnlyBusinesses, userLocation]);

  const tourStartSourceLabel = React.useMemo(() => {
    if (customTourStartLocation) {
    return customTourStartLabel || 'Départ personnalisé';
    }

    if (userLocation) {
      return 'Position GPS active';
    }

    if (inferredTourStartLocation) {
      return 'Première adresse géocodée';
    }

    return null;
  }, [customTourStartLabel, customTourStartLocation, inferredTourStartLocation, userLocation]);

  const optimizedTourBusinesses = React.useMemo(() => {
    if (!inferredTourStartLocation) {
      return filterOnlyBusinesses;
    }

    return optimizeRouteOrder(
      addReferenceDistance(filterOnlyBusinesses, inferredTourStartLocation),
      inferredTourStartLocation
    );
  }, [addReferenceDistance, filterOnlyBusinesses, inferredTourStartLocation]);

  const displayedBusinesses = React.useMemo(() => {
    if (sortMode === 'tour') {
      return optimizedTourBusinesses;
    }

    if (sortMode === 'default') {
      return filterOnlyBusinesses;
    }

    return sortedAndFilteredBusinesses;
  }, [filterOnlyBusinesses, optimizedTourBusinesses, sortMode, sortedAndFilteredBusinesses]);

  const mappedTourBusinesses = React.useMemo(
    () =>
      optimizedTourBusinesses.filter((business) => hasCoordinates(business)),
    [optimizedTourBusinesses]
  );

  const plannedTourBusinesses = React.useMemo(
    () => optimizedTourBusinesses.slice(0, tourStopLimit),
    [optimizedTourBusinesses, tourStopLimit]
  );

  const morningTourBusinesses = React.useMemo(() => {
    const splitIndex = Math.ceil(plannedTourBusinesses.length / 2);
    return plannedTourBusinesses.slice(0, splitIndex);
  }, [plannedTourBusinesses]);

  const afternoonTourBusinesses = React.useMemo(() => {
    const splitIndex = Math.ceil(plannedTourBusinesses.length / 2);
    return plannedTourBusinesses.slice(splitIndex);
  }, [plannedTourBusinesses]);

  const tourMetrics = React.useMemo(
    () => calculateTourMetrics(optimizedTourBusinesses, inferredTourStartLocation),
    [optimizedTourBusinesses, inferredTourStartLocation]
  );

  const plannedTourMetrics = React.useMemo(
    () => calculateTourMetrics(plannedTourBusinesses, inferredTourStartLocation),
    [plannedTourBusinesses, inferredTourStartLocation]
  );

  const plannedTourIdSet = React.useMemo(
    () => new Set(plannedTourBusinesses.map((business) => business.id)),
    [plannedTourBusinesses]
  );

  const plannedTourStatusCounts = React.useMemo(() => {
    const counts = {
      non_visite: 0,
      visite: 0,
      a_revisiter: 0,
      interesse: 0,
      pas_interesse: 0,
      client: 0,
    };

    plannedTourBusinesses.forEach((business) => {
      const status = business.visite_status || 'non_visite';
      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      } else {
        counts.non_visite += 1;
      }
    });

    return counts;
  }, [plannedTourBusinesses]);

  const plannedRemainingStops = React.useMemo(
    () => plannedTourStatusCounts.non_visite + plannedTourStatusCounts.a_revisiter,
    [plannedTourStatusCounts]
  );

  const pendingPlannedTourBusinesses = React.useMemo(
    () =>
      plannedTourBusinesses.filter((business) =>
        ['non_visite', 'a_revisiter'].includes(business.visite_status || 'non_visite')
      ),
    [plannedTourBusinesses]
  );

  const nextPlannedBusiness = React.useMemo(
    () => pendingPlannedTourBusinesses[0] || null,
    [pendingPlannedTourBusinesses]
  );

  const completedTodayCount = React.useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = today.getMonth();
    const dd = today.getDate();

    return plannedTourBusinesses.filter((business) => {
      if (!business.visited_at) return false;
      const visitedDate = new Date(business.visited_at);
      return (
        visitedDate.getFullYear() === yyyy &&
        visitedDate.getMonth() === mm &&
        visitedDate.getDate() === dd
      );
    }).length;
  }, [plannedTourBusinesses]);

  const routePreviewStops = React.useMemo(
    () => plannedTourBusinesses.slice(0, 5),
    [plannedTourBusinesses]
  );

  const isTourOrderChanged = React.useMemo(() => {
    if (filterOnlyBusinesses.length !== optimizedTourBusinesses.length) {
      return true;
    }

    return filterOnlyBusinesses.some((business, index) => business.id !== optimizedTourBusinesses[index]?.id);
  }, [filterOnlyBusinesses, optimizedTourBusinesses]);

  // Handler pour changer le mode de tri
  const handleSortModeChange = async (mode: SortMode) => {
    if (mode === 'default') {
      setSortMode('default');
      setTourActionTone('info');
      setTourActionMessage('La liste reste dans son ordre standard, sans tri geographique.');
      return;
    }

    // Pour proximity, on a besoin d'une vraie position GPS
    if (mode === 'proximity' && !userLocation) {
      const location = await requestLocation();
      if (!location) {
        return; // Pas de localisation, on reste en mode default
      }
    }

    if (mode === 'tour' && !userLocation && !customTourStartLocation) {
      const location = await requestLocation();
      if (!location) {
        setLocationError("GPS indisponible : ordre optimisé à partir de la première adresse géocodée.");
      }
    }
    
    setSortMode(mode);
    if (mode === 'proximity') {
      setTourActionTone('success');
      setTourActionMessage('La liste est triee par distance depuis votre position actuelle.');
    }
    if (mode === 'tour') {
      setOptimizingTour(true);
      setShowTourMap(true);
      const mappedStops = tourMetrics.mappedStops;
      const sameOrder = !isTourOrderChanged;
      const previewLabel = routePreviewStops
        .slice(0, 3)
        .map((business, index) => `${index + 1}. ${business.name}`)
        .join(' - ');

      if (mappedStops < 2) {
        setTourActionTone('warning');
        setTourActionMessage(
          "Pas assez d'adresses géocodées pour recalculer une vraie tournée. La liste reste proche de son ordre actuel."
        );
      } else if (sameOrder) {
        setTourActionTone('info');
        setTourActionMessage(
          `Ordre déjà cohérent pour ${mappedStops} arrêt${mappedStops > 1 ? 's' : ''}. Départ prévu : ${previewLabel || 'aucun aperçu disponible'}.`
        );
      } else {
        setTourActionTone('success');
        setTourActionMessage(
          `Ordre recalculé sur ${mappedStops} arrêt${mappedStops > 1 ? 's' : ''}. Départ prévu : ${previewLabel || 'aucun aperçu disponible'}.`
        );
      }
      setOptimizingTour(false);
    }
  };

  // Calculer les compteurs par domaine quand les donnees changent
  useEffect(() => {
    const counts: { [key: string]: number } = {};
    businesses.forEach(b => {
      const domain = getBusinessDomain(b.activite_naf);
      counts[domain] = (counts[domain] || 0) + 1;
    });
    setDomainCounts(counts);
  }, [businesses]);

  // Export CSV function
  const handleExportCSV = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      let exportUrl = `${API_URL}/api/businesses/visites/export-csv`;
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('visite_type', typeFilter);
      if (ageFilter) params.append('max_age_years', ageFilter.toString());
      if (params.toString()) exportUrl += `?${params.toString()}`;
      
      if (typeof window !== 'undefined') {
        const response = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${t}` }
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `visites_terrain_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          Alert.alert('Succès', 'Export CSV téléchargé !');
        } else {
          Alert.alert('Erreur', 'Impossible de télécharger le CSV');
        }
      } else {
        Linking.openURL(exportUrl);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      Alert.alert('Erreur', 'Impossible d\'exporter en CSV');
    }
  };

  const updateManualVisiteField = (field: keyof typeof EMPTY_MANUAL_VISITE_FORM, value: string) => {
    setManualVisiteForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const resetManualVisiteForm = () => {
    setManualVisiteForm(EMPTY_MANUAL_VISITE_FORM);
    setAddressSuggestions([]);
  };

  // Rafraichir la liste quand on revient sur cette page
  useFocusEffect(
    useCallback(() => {
      loadVisites();
    }, [typeFilter, ageFilter])
  );

  // Pull-to-refresh handler
  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    await refreshVisites();
    await loadVisites();
    setPullRefreshing(false);
  }, [refreshVisites, typeFilter, ageFilter]);

  const loadVisites = async () => {
    try {
      setLoading(true);
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');

      // Build query params
      const params = new URLSearchParams();
      if (typeFilter !== 'all') {
        params.append('visite_type', typeFilter);
      }
      if (ageFilter) {
        params.append('max_age_years', ageFilter.toString());
      }

      // Charger les visites avec filtres
      const response = await axios.get(
        `${API_URL}/api/businesses/visites?${params.toString()}`,
        { headers: { Authorization: `Bearer ${t}` } }
      );

      const data = response.data;
      setBusinesses(data.businesses || []);
      setCounts({
        total: data.total || 0,
        pappers: data.pappers_count || 0,
        autres: data.autres_count || 0
      });
    } catch (error) {
      console.error('Error loading visites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManualVisite = async () => {
    const payload = {
      name: manualVisiteForm.name.trim(),
      address: manualVisiteForm.address.trim(),
      city: manualVisiteForm.city.trim(),
      postal_code: manualVisiteForm.postal_code.trim(),
      phone: manualVisiteForm.phone.trim() || undefined,
      siret: manualVisiteForm.siret.trim() || undefined,
      note: manualVisiteForm.note.trim() || undefined,
    };

    if (!payload.name || !payload.address || !payload.city || !payload.postal_code) {
      Alert.alert('Champs requis', 'Nom, adresse, ville et code postal sont obligatoires.');
      return;
    }

    setCreatingManualVisite(true);
    try {
      const currentToken = token || (await AsyncStorage.getItem('token')) || '';
      const response = await axios.post(
        `${API_URL}/api/businesses/visites/manual`,
        payload,
        { headers: { Authorization: `Bearer ${currentToken}` } }
      );

      const createdBusiness = response.data?.business;
      if (createdBusiness) {
        setBusinesses((previous) => [createdBusiness, ...previous]);
      }

      setTourActionTone('success');
      setTourActionMessage(`"${payload.name}" a été ajouté à vos visites terrain.`);
      setShowManualVisiteModal(false);
      resetManualVisiteForm();
      Alert.alert('Fiche créée', `"${payload.name}" a bien été ajoutée dans tes visites terrain.`);
      await Promise.allSettled([refreshVisites(), loadVisites()]);
    } catch (error: any) {
      console.error('Error creating manual visite:', error?.response?.data || error?.message || error);
      Alert.alert(
        'Création impossible',
        error?.response?.data?.detail || "Impossible d'ajouter cette visite terrain pour le moment."
      );
    } finally {
      setCreatingManualVisite(false);
    }
  };

  const createVisitFollowUpInteraction = async (
    currentToken: string,
    business: VisiteBusiness,
    visiteStatus: 'visite' | 'a_revisiter' | 'pas_interesse'
  ) => {
    if (visiteStatus === 'visite') {
      return;
    }

    const tomorrowAtNine = new Date();
    tomorrowAtNine.setDate(tomorrowAtNine.getDate() + 1);
    tomorrowAtNine.setHours(9, 0, 0, 0);

    const isRetry = visiteStatus === 'a_revisiter';
    await axios.post(
      `${API_URL}/api/crm/interactions`,
      {
        business_id: business.id,
        interaction_type: isRetry ? 'callback' : 'note',
        title: isRetry ? 'Rappeler' : 'Passage terrain',
        content: isRetry
          ? `Passage terrain à reprogrammer pour ${business.name}.`
          : `Passage terrain sans suite immédiate pour ${business.name}.`,
        callback_date: isRetry ? tomorrowAtNine.toISOString() : undefined,
      },
      { headers: { Authorization: `Bearer ${currentToken}` } }
    );
  };

  const handleQuickVisitStatus = async (
    business: VisiteBusiness,
    visiteStatus: 'visite' | 'a_revisiter' | 'pas_interesse'
  ) => {
    setQuickStatusBusinessId(business.id);
    try {
      const currentToken = token || (await AsyncStorage.getItem('token')) || '';
      const response = await axios.patch(
        `${API_URL}/api/businesses/${business.id}/visite`,
        { visite_status: visiteStatus },
        { headers: { Authorization: `Bearer ${currentToken}` } }
      );

      const updatedBusiness = response.data?.business;
      await createVisitFollowUpInteraction(currentToken, business, visiteStatus);

      setBusinesses((previous) =>
        previous.map((item) =>
          item.id === business.id
            ? {
                ...item,
                ...(updatedBusiness || {}),
                visite_status: updatedBusiness?.visite_status || visiteStatus,
              }
            : item
        )
      );

      const nextMessage =
        visiteStatus === 'visite'
          ? `"${business.name}" marquée comme visitée.`
          : visiteStatus === 'a_revisiter'
            ? `"${business.name}" passe à revoir, avec rappel créé pour demain matin.`
            : `"${business.name}" marquée sans suite immédiate, avec trace CRM créée.`;

      setTourActionTone('success');
      setTourActionMessage(nextMessage);
      void refreshVisites();
    } catch (error: any) {
      console.error('Error updating visite status:', error?.response?.data || error?.message || error);
      Alert.alert(
        'Mise à jour impossible',
        error?.response?.data?.detail || 'Impossible de mettre à jour ce statut pour le moment.'
      );
    } finally {
      setQuickStatusBusinessId(null);
    }
  };

  const handleSelectAddressSuggestion = (suggestion: AddressSuggestion) => {
    setManualVisiteForm((previous) => ({
      ...previous,
      address: suggestion.address,
      city: suggestion.city,
      postal_code: suggestion.postal_code,
    }));
    setAddressSuggestions([]);
  };

  const persistCustomTourStart = async (payload: { label: string; latitude: number; longitude: number } | null) => {
    try {
      if (!payload) {
        await AsyncStorage.removeItem('prospectlocal_tour_start');
        return;
      }

      await AsyncStorage.setItem('prospectlocal_tour_start', JSON.stringify(payload));
    } catch (error) {
      console.error('Error saving custom tour start:', error);
    }
  };

  const handleSelectCustomTourStartSuggestion = async (suggestion: AddressSuggestion) => {
    if (typeof suggestion.latitude !== 'number' || typeof suggestion.longitude !== 'number') {
      return;
    }

    const label = suggestion.label || [suggestion.address, suggestion.postal_code, suggestion.city].filter(Boolean).join(', ');
    const nextLocation = {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };

    setCustomTourStartLocation(nextLocation);
    setCustomTourStartLabel(label);
    setCustomTourStartQuery(label);
    setCustomTourStartSuggestions([]);
    setLocationError(null);
    await persistCustomTourStart({
      label,
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
    });
    setTourActionTone('success');
      setTourActionMessage(`Départ personnalisé enregistré : ${label}.`);
  };

  const clearCustomTourStart = async () => {
    setCustomTourStartLocation(null);
    setCustomTourStartLabel('');
    setCustomTourStartQuery('');
    setCustomTourStartSuggestions([]);
    await persistCustomTourStart(null);
    setTourActionTone('info');
    setTourActionMessage('Départ personnalisé supprimé. La tournée reprend son point de départ par défaut.');
  };

  useEffect(() => {
    if (!showManualVisiteModal) {
      return;
    }

    const addressQuery = manualVisiteForm.address.trim();
    const cityQuery = manualVisiteForm.city.trim();
    const postalCodeQuery = manualVisiteForm.postal_code.trim();

    if (addressQuery.length < 4 || (!cityQuery && postalCodeQuery.length < 5)) {
      setAddressSuggestions([]);
      setLoadingAddressSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const debounce = setTimeout(async () => {
      try {
        setLoadingAddressSuggestions(true);
        const params = new URLSearchParams({
          q: addressQuery,
          limit: '5',
        });
        if (postalCodeQuery) {
          params.append('postcode', postalCodeQuery);
        }
        if (cityQuery) {
          params.append('city', cityQuery);
        }

        const response = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Adresse non trouvée');
        }

        const data = await response.json();
        const suggestions = (data.features || []).map((feature: any) => {
          const properties = feature.properties || {};
          const streetLine = [properties.housenumber, properties.street].filter(Boolean).join(' ').trim();
          return {
            label: properties.label || `${streetLine}, ${properties.postcode || ''} ${properties.city || ''}`.trim(),
            address: streetLine || properties.name || addressQuery,
            city: properties.city || cityQuery,
            postal_code: properties.postcode || postalCodeQuery,
            latitude: feature.geometry?.coordinates?.[1],
            longitude: feature.geometry?.coordinates?.[0],
          };
        }).filter((item: AddressSuggestion) => item.address && item.city && item.postal_code);

        setAddressSuggestions(suggestions);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Error loading address suggestions:', error);
          setAddressSuggestions([]);
        }
      } finally {
        setLoadingAddressSuggestions(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [manualVisiteForm.address, manualVisiteForm.city, manualVisiteForm.postal_code, showManualVisiteModal]);

  useEffect(() => {
    const query = customTourStartQuery.trim();

    if (query.length < 4) {
      setCustomTourStartSuggestions([]);
      setLoadingCustomTourStartSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const debounce = setTimeout(async () => {
      try {
        setLoadingCustomTourStartSuggestions(true);
        const params = new URLSearchParams({
          q: query,
          limit: '5',
        });

        const response = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Départ non trouvé');
        }

        const data = await response.json();
        const suggestions = (data.features || []).map((feature: any) => {
          const properties = feature.properties || {};
          const streetLine = [properties.housenumber, properties.street].filter(Boolean).join(' ').trim();
          return {
            label: properties.label || `${streetLine}, ${properties.postcode || ''} ${properties.city || ''}`.trim(),
            address: streetLine || properties.name || query,
            city: properties.city || '',
            postal_code: properties.postcode || '',
            latitude: feature.geometry?.coordinates?.[1],
            longitude: feature.geometry?.coordinates?.[0],
          };
        }).filter((item: AddressSuggestion) => item.label && typeof item.latitude === 'number' && typeof item.longitude === 'number');

        setCustomTourStartSuggestions(suggestions);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Error loading custom tour start suggestions:', error);
          setCustomTourStartSuggestions([]);
        }
      } finally {
        setLoadingCustomTourStartSuggestions(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [customTourStartQuery]);

  const handleOpenMaps = (business: VisiteBusiness) => {
    if (!business.address) {
      Alert.alert('Erreur', 'Adresse non disponible');
      return;
    }
    
    const encodedAddress = encodeURIComponent(business.address);
    
    // Options de navigation
    const openGoogleMaps = () => {
      const url = Platform.OS === 'ios'
        ? `comgooglemaps://?q=${encodedAddress}`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      Linking.openURL(url).catch(() => {
        // Fallback vers la version web si l'app n'est pas installee
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
      });
    };
    
    const openWaze = () => {
      const url = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
      Linking.openURL(url);
    };
    
    const openAppleMaps = () => {
      Linking.openURL(`maps://maps.apple.com/?q=${encodedAddress}`);
    };
    
    // Sur le web, proposer un choix via boutons
    if (Platform.OS === 'web') {
      // Creer une modale de choix simple pour le web
      const choice = window.confirm(
        `Ouvrir l'itinéraire vers "${business.name}" :\n\n` +
        `- OK = Waze\n` +
        `- Annuler = Google Maps`
      );
      if (choice) {
        openWaze();
      } else {
        openGoogleMaps();
      }
    } else {
      // Sur mobile, utiliser Alert avec plusieurs options
      const buttons: any[] = [
        { text: 'Waze', onPress: openWaze },
        { text: 'Google Maps', onPress: openGoogleMaps },
      ];
      
      // Ajouter Apple Maps sur iOS
      if (Platform.OS === 'ios') {
        buttons.unshift({ text: 'Plans Apple', onPress: openAppleMaps });
      }
      
      buttons.push({ text: 'Annuler', style: 'cancel' });
      
      Alert.alert(
        'Ouvrir avec...',
        `Itinéraire vers ${business.name}`,
        buttons
      );
    }
  };

  const handleLaunchTour = async () => {
    if (!plannedTourBusinesses.length) {
      Alert.alert('Tournée vide', 'Aucune visite terrain à lancer.');
      return;
    }

    setLaunchingTour(true);

    let currentLocation = userLocation || customTourStartLocation || inferredTourStartLocation;

    if (!currentLocation) {
      currentLocation = await requestLocation();
      if (!currentLocation) {
        currentLocation = inferredTourStartLocation;
        setLocationError('GPS indisponible : itinéraire lancé avec le meilleur point de départ disponible.');
      }
    }

    const routeUrl = buildGoogleMapsDirectionsUrl(plannedTourBusinesses, currentLocation);

    if (!routeUrl) {
      setLaunchingTour(false);
      Alert.alert(
        'Tournée indisponible',
        "Impossible de générer un itinéraire avec les données actuelles."
      );
      return;
    }

    const usableStops = plannedTourBusinesses.filter((business) => business.address || hasCoordinates(business));
    const routedStops = Math.min(usableStops.length, 9);

    setTourActionMessage(
      routedStops >= 2
        ? `Google Maps va s'ouvrir avec ${routedStops} arrêt${routedStops > 1 ? 's' : ''} dans l'ordre optimisé.`
        : "Google Maps va s'ouvrir avec le meilleur itinéraire disponible."
    );
    setTourActionTone('success');

    Linking.openURL(routeUrl).then(() => {
      setTourActionMessage(
        routedStops >= 2
          ? `Tournée ouverte dans votre navigateur ou votre app carto avec ${routedStops} arrêt${routedStops > 1 ? 's' : ''}.`
          : 'Itinéraire ouvert avec le meilleur arrêt disponible.'
      );
    }).catch(() => {
      setTourActionTone('warning');
      Alert.alert('Erreur', "Impossible d'ouvrir la tournee dans Google Maps.");
    }).finally(() => {
      setLaunchingTour(false);
    });
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

  const handleDeleteVisite = async (business: VisiteBusiness) => {
    const confirmDelete = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(`Supprimer "${business.name}" de vos visites ?`));
        } else {
          Alert.alert(
            'Supprimer cette visite ?',
            `"${business.name}" sera définitivement supprimée.`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    try {
      console.log(`[Delete] Deleting business ${business.id}...`);
      
      const response = await axios.delete(
        `${API_URL}/api/businesses/${business.id}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000  // 30 second timeout
        }
      );
      
      console.log(`[Delete] Success:`, response.data);
      
      // Remove from local state AND global cache
      setBusinesses(prev => prev.filter(b => b.id !== business.id));
      deleteVisite(business.id);
      
      if (Platform.OS === 'web') {
        // Show brief success message
        console.log(`[Delete] Visite "${business.name}" supprimée`);
      } else {
        Alert.alert('OK', 'Visite supprimée');
      }
    } catch (error: any) {
      console.error('[Delete] Error:', error?.response?.data || error?.message || error);
      if (Platform.OS === 'web') {
        window.alert(`Erreur lors de la suppression: ${error?.response?.data?.detail || error?.message || 'Erreur inconnue'}`);
      } else {
        Alert.alert('Erreur', 'Impossible de supprimer');
      }
    }
  };

  const renderVisiteItem = ({ item, index }: { item: VisiteBusiness; index: number }) => {
    const statusInfo = getStatusInfo(item.visite_status);
    const contactModeMeta = item.recommended_contact_mode
      ? CONTACT_MODE_META[item.recommended_contact_mode]
      : null;
    const phoneReliabilityMeta = item.phone_reliability_status
      ? PHONE_RELIABILITY_META[item.phone_reliability_status]
      : null;
    
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
          {getActivityLabel(item.libelle_naf, item.activite_naf) && (
            <View style={styles.activityBadge}>
              <Ionicons name="briefcase" size={12} color="#6366F1" />
              <Text style={styles.activityBadgeText} numberOfLines={1}>
                {getActivityLabel(item.libelle_naf, item.activite_naf)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.visiteBadges}>
          {sortMode === 'tour' && plannedTourIdSet.has(item.id) && (
            <View style={styles.badgeTourOrder}>
              <Ionicons name="git-commit" size={12} color="#4F46E5" />
              <Text style={styles.badgeTourOrderText}>Étape {index + 1}</Text>
            </View>
          )}
          {sortMode === 'tour' && !plannedTourIdSet.has(item.id) && (
            <View style={styles.badgeOutOfPlan}>
              <Ionicons name="calendar-outline" size={12} color="#92400E" />
              <Text style={styles.badgeOutOfPlanText}>Hors plan du jour</Text>
            </View>
          )}
          {/* Distance badge when available */}
          {item.distance !== undefined && item.distance < 9999 && sortMode !== 'default' && (
            <View style={styles.badgeDistance}>
              <Ionicons name="navigate" size={12} color="#4CAF50" />
              <Text style={styles.badgeDistanceText}>
                {item.distance < 1 
                  ? `${Math.round(item.distance * 1000)} m` 
                  : `${item.distance.toFixed(1)} km`}
              </Text>
            </View>
          )}
          {!item.has_pagesjaunes && (
            <View style={styles.badgePJ}>
              <Text style={styles.badgePJText}>Sans PJ</Text>
            </View>
          )}
          {item.source === 'pappers' && (
            <View style={styles.badgePappers}>
              <Text style={styles.badgePappersText}>Pappers</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.visiteDetails}>
        {(contactModeMeta || (phoneReliabilityMeta && item.phone_reliability_label)) && (
          <View style={styles.visiteMetaRow}>
            {contactModeMeta ? (
              <View style={[styles.contactModeBadge, { backgroundColor: contactModeMeta.bg }]}>
                <Ionicons name={contactModeMeta.icon} size={13} color={contactModeMeta.color} />
                <Text style={[styles.contactModeBadgeText, { color: contactModeMeta.color }]}>
                  {contactModeMeta.label}
                </Text>
              </View>
            ) : null}
            {phoneReliabilityMeta && item.phone_reliability_label ? (
              <View style={[styles.phoneReliabilityBadge, { backgroundColor: phoneReliabilityMeta.bg }]}>
                <Ionicons name={phoneReliabilityMeta.icon} size={13} color={phoneReliabilityMeta.color} />
                <Text style={[styles.phoneReliabilityBadgeText, { color: phoneReliabilityMeta.color }]}>
                  {item.phone_reliability_label}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {!!item.next_best_action_detail && (
          <View style={styles.nextActionCard}>
            <Ionicons name="flash-outline" size={15} color="#4F46E5" />
            <Text style={styles.nextActionText}>{item.next_best_action_detail}</Text>
          </View>
        )}

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

        {/* Telephone (si renseigne apres visite) */}
        {item.phone ? (
          <>
            <View style={styles.detailRow}>
              <Ionicons name="call" size={16} color="#34C759" />
              <Text style={[styles.detailText, styles.phoneText]}>{item.phone}</Text>
            </View>
            {!!item.phone_reliability_reason && (
              <Text style={styles.phoneReliabilityReason}>{item.phone_reliability_reason}</Text>
            )}
          </>
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
      <View style={styles.quickStatusRow}>
        <TouchableOpacity
          style={[styles.quickStatusBtn, styles.quickStatusBtnDone]}
          onPress={() => handleQuickVisitStatus(item, 'visite')}
          disabled={quickStatusBusinessId === item.id}
        >
          {quickStatusBusinessId === item.id ? (
            <ActivityIndicator size="small" color="#166534" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={15} color="#166534" />
              <Text style={[styles.quickStatusBtnText, styles.quickStatusBtnTextDone]}>Fait</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickStatusBtn, styles.quickStatusBtnRetry]}
          onPress={() => handleQuickVisitStatus(item, 'a_revisiter')}
          disabled={quickStatusBusinessId === item.id}
        >
          {quickStatusBusinessId === item.id ? (
            <ActivityIndicator size="small" color="#9A3412" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={15} color="#9A3412" />
              <Text style={[styles.quickStatusBtnText, styles.quickStatusBtnTextRetry]}>A revoir</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickStatusBtn, styles.quickStatusBtnNope]}
          onPress={() => handleQuickVisitStatus(item, 'pas_interesse')}
          disabled={quickStatusBusinessId === item.id}
        >
          {quickStatusBusinessId === item.id ? (
            <ActivityIndicator size="small" color="#991B1B" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={15} color="#991B1B" />
              <Text style={[styles.quickStatusBtnText, styles.quickStatusBtnTextNope]}>Absent / refus</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
          <Text style={styles.actionBtnText}>Editer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtnDelete}
          onPress={() => handleDeleteVisite(item)}
        >
          <Ionicons name="trash" size={18} color="#FFF" />
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

  const visitesListHeader = (
    <>
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#1565C0" />
        <Text style={styles.infoBannerText}>
          Entreprises sans coordonnées téléphoniques. Rendez-vous sur place pour récupérer leurs informations.
        </Text>
      </View>

      <VisitesTourPlanner
        onOpenManualVisite={() => setShowManualVisiteModal(true)}
        showTourMap={showTourMap}
        onToggleTourMap={() => setShowTourMap((value) => !value)}
        optimizedTourBusinesses={optimizedTourBusinesses}
        mappedTourBusinesses={mappedTourBusinesses}
        inferredTourStartLocation={inferredTourStartLocation}
        tourMetrics={tourMetrics}
        optimizingTour={optimizingTour}
        launchingTour={launchingTour}
        onOptimizeTour={() => handleSortModeChange('tour')}
        onLaunchTour={handleLaunchTour}
        tourStartSourceLabel={tourStartSourceLabel}
        customTourStartQuery={customTourStartQuery}
        onChangeCustomTourStartQuery={setCustomTourStartQuery}
        loadingCustomTourStartSuggestions={loadingCustomTourStartSuggestions}
        customTourStartSuggestions={customTourStartSuggestions}
        onSelectCustomTourStartSuggestion={handleSelectCustomTourStartSuggestion}
        onUseGpsStart={async () => {
          await clearCustomTourStart();
          const location = await requestLocation();
          if (location) {
            setTourActionTone('success');
            setTourActionMessage('Position GPS active utilisée comme départ de tournée.');
          }
        }}
        onClearCustomTourStart={clearCustomTourStart}
        tourStopLimit={tourStopLimit}
        onChangeTourStopLimit={setTourStopLimit}
        plannedTourBusinesses={plannedTourBusinesses}
        morningTourBusinesses={morningTourBusinesses}
        afternoonTourBusinesses={afternoonTourBusinesses}
        plannedTourMetrics={plannedTourMetrics}
        plannedRemainingStops={plannedRemainingStops}
        completedTodayCount={completedTodayCount}
        plannedTourStatusCounts={plannedTourStatusCounts}
        nextPlannedBusiness={nextPlannedBusiness}
        getNextPlannedBusinessIndex={(businessId) =>
          plannedTourBusinesses.findIndex((business) => business.id === businessId)
        }
        onOpenMaps={handleOpenMaps}
        onOpenBusiness={(businessId) =>
          router.push({ pathname: '/visitedetail', params: { businessId } })
        }
        tourActionMessage={tourActionMessage}
        tourActionTone={tourActionTone}
        routePreviewStops={routePreviewStops}
      />

      {false && (<View style={styles.tourHeroCard}>
        <View style={styles.tourHeroHeader}>
          <View style={styles.tourHeroTextBlock}>
            <Text style={styles.tourHeroTitle}>Tournée terrain</Text>
            <Text style={styles.tourHeroSubtitle}>
              Carte, ordre optimisé et lancement direct vers Google Maps.
            </Text>
          </View>
          <View style={styles.tourHeroHeaderActions}>
            <TouchableOpacity
              style={styles.manualVisiteHeaderButton}
              onPress={() => setShowManualVisiteModal(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#4F46E5" />
              <Text style={styles.manualVisiteHeaderButtonText}>Nouvelle visite terrain</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tourHeroBadge, showTourMap && styles.tourHeroBadgeActive]}
              onPress={() => setShowTourMap((value) => !value)}
            >
              <Ionicons name={showTourMap ? 'map' : 'map-outline'} size={16} color={showTourMap ? '#FFF' : '#4F46E5'} />
              <Text style={[styles.tourHeroBadgeText, showTourMap && styles.tourHeroBadgeTextActive]}>
                {showTourMap ? 'Carte visible' : 'Afficher la carte'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tourHeroStats}>
          <View style={styles.tourHeroStat}>
            <Text style={styles.tourHeroStatValue}>{optimizedTourBusinesses.length}</Text>
            <Text style={styles.tourHeroStatLabel}>arrêts</Text>
          </View>
          <View style={styles.tourHeroStat}>
            <Text style={styles.tourHeroStatValue}>{tourMetrics.totalDistanceKm.toFixed(1)} km</Text>
            <Text style={styles.tourHeroStatLabel}>estimes</Text>
          </View>
          <View style={styles.tourHeroStat}>
            <Text style={styles.tourHeroStatValue}>{Math.round(tourMetrics.averageLegKm * 10) / 10} km</Text>
            <Text style={styles.tourHeroStatLabel}>étape moy.</Text>
          </View>
        </View>

        <View style={styles.tourHeroActions}>
          <TouchableOpacity
            style={styles.tourHeroPrimaryBtn}
            onPress={() => handleSortModeChange('tour')}
            disabled={optimizingTour}
          >
            {optimizingTour ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="navigate" size={18} color="#FFF" />
            )}
            <Text style={styles.tourHeroPrimaryBtnText}>
              {optimizingTour ? "Optimisation..." : "Optimiser l'ordre"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tourHeroSecondaryBtn}
            onPress={handleLaunchTour}
            disabled={launchingTour}
          >
            {launchingTour ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Ionicons name="car" size={18} color="#4F46E5" />
            )}
            <Text style={styles.tourHeroSecondaryBtnText}>
              {launchingTour ? 'Ouverture...' : 'Lancer la tournée'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tourStartCard}>
          <View style={styles.tourStartHeader}>
            <Text style={styles.tourStartTitle}>Départ de tournée</Text>
            {!!tourStartSourceLabel && (
              <View style={styles.tourStartSourceBadge}>
                <Ionicons name="flag-outline" size={12} color="#4F46E5" />
                <Text style={styles.tourStartSourceBadgeText}>{tourStartSourceLabel}</Text>
              </View>
            )}
          </View>
          <Text style={styles.tourStartSubtitle}>
            Définis ton agence, ton domicile ou un départ fixe pour éviter des détours inutiles.
          </Text>
          <TextInput
            value={customTourStartQuery}
            onChangeText={setCustomTourStartQuery}
                placeholder="Saisir un départ personnalisé"
            style={styles.tourStartInput}
            placeholderTextColor="#9CA3AF"
          />
          {loadingCustomTourStartSuggestions ? (
            <View style={styles.tourStartLoadingRow}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.tourStartLoadingText}>Recherche d'adresse...</Text>
            </View>
          ) : null}
          {customTourStartSuggestions.length > 0 ? (
            <View style={styles.tourStartSuggestions}>
              {customTourStartSuggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={`${suggestion.label}-${index}`}
                  style={styles.tourStartSuggestionItem}
                  onPress={() => handleSelectCustomTourStartSuggestion(suggestion)}
                >
                  <Ionicons name="location-outline" size={14} color="#4F46E5" />
                  <Text style={styles.tourStartSuggestionText}>{suggestion.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.tourStartActions}>
            <TouchableOpacity
              style={styles.tourStartActionBtn}
              onPress={async () => {
                await clearCustomTourStart();
                const location = await requestLocation();
                if (location) {
                  setTourActionTone('success');
                  setTourActionMessage('Position GPS active utilisee comme depart de tournee.');
                }
              }}
            >
              <Ionicons name="locate-outline" size={15} color="#4F46E5" />
              <Text style={styles.tourStartActionText}>Utiliser mon GPS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tourStartActionBtn} onPress={clearCustomTourStart}>
              <Ionicons name="trash-outline" size={15} color="#B91C1C" />
              <Text style={[styles.tourStartActionText, styles.tourStartActionTextDanger]}>Effacer</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tourPlanningCard}>
          <View style={styles.tourPlanningHeader}>
            <Text style={styles.tourPlanningTitle}>Plan de journée</Text>
            <Text style={styles.tourPlanningSubtitle}>
              Limite les arrêts et visualise une découpe simple matin / après-midi.
            </Text>
          </View>
          <View style={styles.tourStopLimitRow}>
            {[6, 8, 10, 12].map((limit) => (
              <TouchableOpacity
                key={limit}
                style={[
                  styles.tourStopLimitBtn,
                  tourStopLimit === limit && styles.tourStopLimitBtnActive,
                ]}
                onPress={() => setTourStopLimit(limit)}
              >
                <Text
                  style={[
                    styles.tourStopLimitBtnText,
                    tourStopLimit === limit && styles.tourStopLimitBtnTextActive,
                  ]}
                >
                  {limit} arrêts
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.tourPlanningStats}>
            <View style={styles.tourPlanningStat}>
              <Text style={styles.tourPlanningStatValue}>{plannedTourBusinesses.length}</Text>
              <Text style={styles.tourPlanningStatLabel}>prévu(s)</Text>
            </View>
            <View style={styles.tourPlanningStat}>
              <Text style={styles.tourPlanningStatValue}>{morningTourBusinesses.length}</Text>
              <Text style={styles.tourPlanningStatLabel}>matin</Text>
            </View>
            <View style={styles.tourPlanningStat}>
              <Text style={styles.tourPlanningStatValue}>{afternoonTourBusinesses.length}</Text>
              <Text style={styles.tourPlanningStatLabel}>apres-midi</Text>
            </View>
            <View style={styles.tourPlanningStat}>
              <Text style={styles.tourPlanningStatValue}>{plannedTourMetrics.totalDistanceKm.toFixed(1)} km</Text>
              <Text style={styles.tourPlanningStatLabel}>parcours</Text>
            </View>
          </View>
          <View style={styles.tourProgressCard}>
            <View style={styles.tourProgressHeader}>
              <Text style={styles.tourProgressTitle}>Progression du jour</Text>
              <Text style={styles.tourProgressSubtitle}>
                {plannedRemainingStops} arrêt(s) encore à traiter sur {plannedTourBusinesses.length}
              </Text>
            </View>
            <View style={styles.tourProgressGrid}>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{completedTodayCount}</Text>
                <Text style={styles.tourProgressPillLabel}>Faites aujourd'hui</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.non_visite}</Text>
                <Text style={styles.tourProgressPillLabel}>A faire</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.visite}</Text>
                <Text style={styles.tourProgressPillLabel}>Visitees</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.a_revisiter}</Text>
                <Text style={styles.tourProgressPillLabel}>A revoir</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.interesse}</Text>
                <Text style={styles.tourProgressPillLabel}>Interessees</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.pas_interesse}</Text>
                <Text style={styles.tourProgressPillLabel}>Non interessees</Text>
              </View>
              <View style={styles.tourProgressPill}>
                <Text style={styles.tourProgressPillValue}>{plannedTourStatusCounts.client}</Text>
                <Text style={styles.tourProgressPillLabel}>Clients</Text>
              </View>
            </View>
          </View>
          {nextPlannedBusiness ? (
            <View style={styles.nextStopCard}>
              <View style={styles.nextStopHeader}>
                <View style={styles.nextStopIndexBadge}>
                  <Text style={styles.nextStopIndexText}>
                    {plannedTourBusinesses.findIndex((business) => business.id === nextPlannedBusiness.id) + 1}
                  </Text>
                </View>
                <View style={styles.nextStopContent}>
                  <Text style={styles.nextStopTitle}>Prochaine étape</Text>
                  <Text style={styles.nextStopName} numberOfLines={1}>{nextPlannedBusiness.name}</Text>
                  <Text style={styles.nextStopMeta} numberOfLines={1}>
                    {[nextPlannedBusiness.city, nextPlannedBusiness.address].filter(Boolean).join(' - ') || 'Adresse à confirmer'}
                  </Text>
                </View>
              </View>
              <View style={styles.nextStopActions}>
                <TouchableOpacity
                  style={styles.nextStopActionBtn}
                  onPress={() => handleOpenMaps(nextPlannedBusiness)}
                >
                  <Ionicons name="navigate-outline" size={15} color="#4F46E5" />
                  <Text style={styles.nextStopActionText}>Y aller</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextStopActionBtn}
                  onPress={() => router.push({ pathname: '/visitedetail', params: { businessId: nextPlannedBusiness.id } })}
                >
                  <Ionicons name="create-outline" size={15} color="#4F46E5" />
                  <Text style={styles.nextStopActionText}>Ouvrir la fiche</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.tourHalfDayGrid}>
            <View style={styles.tourHalfDayCard}>
              <Text style={styles.tourHalfDayTitle}>Matin</Text>
              <Text style={styles.tourHalfDayText}>
                {morningTourBusinesses.length
                  ? morningTourBusinesses.slice(0, 3).map((business, index) => `${index + 1}. ${business.name}`).join(' - ')
                  : 'Aucun arrêt prévu'}
              </Text>
            </View>
            <View style={styles.tourHalfDayCard}>
              <Text style={styles.tourHalfDayTitle}>Apres-midi</Text>
              <Text style={styles.tourHalfDayText}>
                {afternoonTourBusinesses.length
                  ? afternoonTourBusinesses.slice(0, 3).map((business, index) => `${index + 1}. ${business.name}`).join(' - ')
                  : 'Aucun arrêt prévu'}
              </Text>
            </View>
          </View>
        </View>

        {tourActionMessage ? (
          <View
            style={[
              styles.tourPlannerNotice,
              tourActionTone === 'success' && styles.tourPlannerNoticeSuccess,
              tourActionTone === 'warning' && styles.tourPlannerNoticeWarning,
            ]}
          >
            <Ionicons
              name={
                tourActionTone === 'warning'
                  ? 'warning'
                  : tourActionTone === 'success'
                    ? 'checkmark-circle'
                    : 'information-circle'
              }
              size={16}
              color={
                tourActionTone === 'warning'
                  ? '#B45309'
                  : tourActionTone === 'success'
                    ? '#0F766E'
                    : '#1D4ED8'
              }
            />
            <Text
              style={[
                styles.tourPlannerNoticeText,
                styles.tourActionText,
                tourActionTone === 'success' && styles.tourActionTextSuccess,
                tourActionTone === 'warning' && styles.tourActionTextWarning,
              ]}
            >
              {tourActionMessage}
            </Text>
          </View>
        ) : null}

        {routePreviewStops.length ? (
          <View style={styles.tourPreviewCard}>
            <Text style={styles.tourPreviewTitle}>Aperçu de la tournée</Text>
            <Text style={styles.tourPreviewSubtitle}>
              Les premiers arrêts affichent l'ordre actuellement calculé pour la liste.
            </Text>
            <View style={styles.tourPreviewList}>
              {routePreviewStops.map((business, index) => (
                <View key={business.id} style={styles.tourPreviewItem}>
                  <View style={styles.tourPreviewIndex}>
                    <Text style={styles.tourPreviewIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.tourPreviewContent}>
                    <Text style={styles.tourPreviewName} numberOfLines={1}>{business.name}</Text>
                    <Text style={styles.tourPreviewMeta} numberOfLines={1}>
                    {[business.city, business.address].filter(Boolean).join(' - ') || 'Adresse à confirmer'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {tourMetrics.mappedStops < optimizedTourBusinesses.length && (
          <View style={styles.tourPlannerNotice}>
            <Ionicons name="information-circle" size={16} color="#B45309" />
            <Text style={styles.tourPlannerNoticeText}>
              Carte : {tourMetrics.mappedStops} sur {optimizedTourBusinesses.length} entreprises géocodées.
              La liste reste complète, mais la carte et l'ordre optimisé ne s'appuient que sur les adresses
              positionnées correctement.
            </Text>
          </View>
        )}

        {showTourMap && (
          <View style={styles.tourMapSection}>
            <TourMap businesses={mappedTourBusinesses} startLocation={inferredTourStartLocation} height={420} />
          </View>
        )}
      </View>)}

      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Type :</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterBtn, typeFilter === 'all' && styles.filterBtnActive]}
              onPress={() => setTypeFilter('all')}
            >
              <Text style={[styles.filterBtnText, typeFilter === 'all' && styles.filterBtnTextActive]}>
                Tous ({counts.total})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterBtn, styles.filterBtnPappers, typeFilter === 'pappers' && styles.filterBtnPappersActive]}
              onPress={() => setTypeFilter('pappers')}
            >
              <Text style={[styles.filterBtnText, typeFilter === 'pappers' && styles.filterBtnTextActive]}>
                Pappers ({counts.pappers})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterBtn, styles.filterBtnAutres, typeFilter === 'autres' && styles.filterBtnAutresActive]}
              onPress={() => setTypeFilter('autres')}
            >
              <Text style={[styles.filterBtnText, typeFilter === 'autres' && styles.filterBtnTextActive]}>
                Autres ({counts.autres})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {(typeFilter === 'pappers' || typeFilter === 'all') && (
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Anciennete :</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterBtn, ageFilter === null && styles.filterBtnActive]}
                onPress={() => setAgeFilter(null)}
              >
                <Text style={[styles.filterBtnText, ageFilter === null && styles.filterBtnTextActive]}>
                  Toutes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, ageFilter === 1 && styles.filterBtnActive]}
                onPress={() => setAgeFilter(1)}
              >
                <Text style={[styles.filterBtnText, ageFilter === 1 && styles.filterBtnTextActive]}>
                  &lt; 1 an
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, ageFilter === 2 && styles.filterBtnActive]}
                onPress={() => setAgeFilter(2)}
              >
                <Text style={[styles.filterBtnText, ageFilter === 2 && styles.filterBtnTextActive]}>
                  &lt; 2 ans
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Activité :</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.domainScrollView}
            contentContainerStyle={styles.domainScrollContent}
          >
            {Object.entries(DOMAIN_LABELS).map(([key, domain]) => {
              const count = key === 'all' ? businesses.length : (domainCounts[key] || 0);
              if (key !== 'all' && count === 0) return null;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.domainBtn,
                    domainFilter === key && { backgroundColor: domain.color, borderColor: domain.color }
                  ]}
                  onPress={() => setDomainFilter(key)}
                >
                  <Ionicons
                    name={domain.icon as any}
                    size={14}
                    color={domainFilter === key ? '#FFF' : domain.color}
                  />
                  <Text style={[
                    styles.domainBtnText,
                    domainFilter === key && styles.domainBtnTextActive
                  ]}>
                    {domain.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Tri :</Text>
          <View style={styles.sortButtons}>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode === 'default' && styles.sortBtnActive]}
              onPress={() => handleSortModeChange('default')}
            >
              <Ionicons name="list" size={16} color={sortMode === 'default' ? '#FFF' : '#666'} />
              <Text style={[styles.sortBtnText, sortMode === 'default' && styles.sortBtnTextActive]}>
                Par defaut
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode === 'proximity' && styles.sortBtnActiveBlue]}
              onPress={() => handleSortModeChange('proximity')}
              disabled={locationLoading}
            >
              {locationLoading && sortMode !== 'proximity' ? (
                <ActivityIndicator size="small" color="#2196F3" />
              ) : (
                <Ionicons name="locate" size={16} color={sortMode === 'proximity' ? '#FFF' : '#2196F3'} />
              )}
              <Text style={[styles.sortBtnText, sortMode === 'proximity' && styles.sortBtnTextActive]}>
                Proximite
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode === 'tour' && styles.sortBtnActiveGreen]}
              onPress={() => handleSortModeChange('tour')}
              disabled={locationLoading}
            >
              {locationLoading && sortMode !== 'tour' ? (
                <ActivityIndicator size="small" color="#4CAF50" />
              ) : (
                <Ionicons name="navigate" size={16} color={sortMode === 'tour' ? '#FFF' : '#4CAF50'} />
              )}
              <Text style={[styles.sortBtnText, sortMode === 'tour' && styles.sortBtnTextActive]}>
                Tournee
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {inferredTourStartLocation && sortMode !== 'default' && (
          <View style={styles.locationInfo}>
            <Ionicons name="location" size={14} color="#4CAF50" />
            <Text style={styles.locationInfoText}>
              Position GPS active - {sortMode === 'tour' ? 'Ordre optimisé' : 'Trié par distance'}
            </Text>
          </View>
        )}
        {locationError && (
          <View style={styles.locationError}>
            <Ionicons name="warning" size={14} color="#FF9800" />
            <Text style={styles.locationErrorText}>{locationError}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {displayedBusinesses.length} entreprise{displayedBusinesses.length > 1 ? 's' : ''} à visiter
          {domainFilter !== 'all' && ` (${DOMAIN_LABELS[domainFilter]?.label || domainFilter})`}
        </Text>
      </View>
    </>
  );

  const visitesEmptyState = (
    <View style={styles.emptyContainer}>
      <Ionicons name="car-outline" size={64} color="#CCC" />
      <Text style={styles.emptyTitle}>
        {domainFilter !== 'all' ? 'Aucune visite dans ce domaine' : 'Aucune visite prévue'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {domainFilter !== 'all'
          ? 'Essayez un autre filtre ou lancez un nouveau scan'
          : 'Lancez un scan pour trouver de nouvelles entreprises à visiter'
        }
      </Text>
      {domainFilter !== 'all' ? (
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => setDomainFilter('all')}
        >
          <Ionicons name="refresh" size={20} color="#FFF" />
          <Text style={styles.emptyButtonText}>Voir toutes les visites</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push('/newscan')}
        >
          <Ionicons name="search" size={20} color="#FFF" />
          <Text style={styles.emptyButtonText}>Nouveau scan</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ManualVisiteModal
        visible={showManualVisiteModal}
        creatingManualVisite={creatingManualVisite}
        manualVisiteForm={manualVisiteForm}
        loadingAddressSuggestions={loadingAddressSuggestions}
        addressSuggestions={addressSuggestions}
        styles={styles}
        onClose={() => setShowManualVisiteModal(false)}
        onChangeField={updateManualVisiteField}
        onSelectAddressSuggestion={handleSelectAddressSuggestion}
        onSubmit={handleCreateManualVisite}
      />

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
        <Text style={styles.headerTitle}>Visites de prospection</Text>
      </View>

      {false ? (
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContent}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            colors={['#6366F1']}
            tintColor="#6366F1"
          />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#1565C0" />
          <Text style={styles.infoBannerText}>
            Entreprises sans coordonnées téléphoniques. Rendez-vous sur place pour récupérer leurs informations.
          </Text>
        </View>

        <View style={styles.tourHeroCard}>
          <View style={styles.tourHeroHeader}>
            <View style={styles.tourHeroTextBlock}>
              <Text style={styles.tourHeroTitle}>Tournée terrain</Text>
              <Text style={styles.tourHeroSubtitle}>
                Carte, ordre optimisé et lancement direct vers Google Maps.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.tourHeroBadge, showTourMap && styles.tourHeroBadgeActive]}
              onPress={() => setShowTourMap((value) => !value)}
            >
              <Ionicons name={showTourMap ? 'map' : 'map-outline'} size={16} color={showTourMap ? '#FFF' : '#4F46E5'} />
              <Text style={[styles.tourHeroBadgeText, showTourMap && styles.tourHeroBadgeTextActive]}>
                {showTourMap ? 'Carte visible' : 'Afficher la carte'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tourHeroStats}>
            <View style={styles.tourHeroStat}>
              <Text style={styles.tourHeroStatValue}>{optimizedTourBusinesses.length}</Text>
              <Text style={styles.tourHeroStatLabel}>arrêts</Text>
            </View>
            <View style={styles.tourHeroStat}>
              <Text style={styles.tourHeroStatValue}>{tourMetrics.totalDistanceKm.toFixed(1)} km</Text>
              <Text style={styles.tourHeroStatLabel}>estimes</Text>
            </View>
            <View style={styles.tourHeroStat}>
              <Text style={styles.tourHeroStatValue}>{Math.round(tourMetrics.averageLegKm * 10) / 10} km</Text>
              <Text style={styles.tourHeroStatLabel}>étape moy.</Text>
            </View>
          </View>

          <View style={styles.tourHeroActions}>
            <TouchableOpacity style={styles.tourHeroPrimaryBtn} onPress={() => handleSortModeChange('tour')}>
              <Ionicons name="navigate" size={18} color="#FFF" />
              <Text style={styles.tourHeroPrimaryBtnText}>Optimiser l'ordre</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tourHeroSecondaryBtn} onPress={handleLaunchTour}>
              <Ionicons name="car" size={18} color="#4F46E5" />
              <Text style={styles.tourHeroSecondaryBtnText}>Lancer la tournée</Text>
            </TouchableOpacity>
          </View>

          {tourMetrics.mappedStops < optimizedTourBusinesses.length && (
            <View style={styles.tourPlannerNotice}>
              <Ionicons name="information-circle" size={16} color="#B45309" />
              <Text style={styles.tourPlannerNoticeText}>
                Carte : {tourMetrics.mappedStops} sur {optimizedTourBusinesses.length} entreprises géocodées.
                La liste reste complète, mais la carte et l'ordre optimisé ne s'appuient que sur les adresses
                positionnées correctement.
              </Text>
            </View>
          )}

          {showTourMap && (
            <View style={styles.tourMapSection}>
              <TourMap businesses={mappedTourBusinesses} startLocation={inferredTourStartLocation} height={420} />
            </View>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
          {/* Type Filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Type :</Text>
            <View style={styles.filterButtons}>
              <TouchableOpacity
                style={[styles.filterBtn, typeFilter === 'all' && styles.filterBtnActive]}
                onPress={() => setTypeFilter('all')}
              >
                <Text style={[styles.filterBtnText, typeFilter === 'all' && styles.filterBtnTextActive]}>
                  Tous ({counts.total})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, styles.filterBtnPappers, typeFilter === 'pappers' && styles.filterBtnPappersActive]}
                onPress={() => setTypeFilter('pappers')}
              >
                <Text style={[styles.filterBtnText, typeFilter === 'pappers' && styles.filterBtnTextActive]}>
                  Pappers ({counts.pappers})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterBtn, styles.filterBtnAutres, typeFilter === 'autres' && styles.filterBtnAutresActive]}
                onPress={() => setTypeFilter('autres')}
              >
                <Text style={[styles.filterBtnText, typeFilter === 'autres' && styles.filterBtnTextActive]}>
                  Autres ({counts.autres})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Age Filter - Only show for Pappers */}
          {(typeFilter === 'pappers' || typeFilter === 'all') && (
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Anciennete :</Text>
              <View style={styles.filterButtons}>
                <TouchableOpacity
                  style={[styles.filterBtn, ageFilter === null && styles.filterBtnActive]}
                  onPress={() => setAgeFilter(null)}
                >
                  <Text style={[styles.filterBtnText, ageFilter === null && styles.filterBtnTextActive]}>
                    Toutes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, ageFilter === 1 && styles.filterBtnActive]}
                  onPress={() => setAgeFilter(1)}
                >
                  <Text style={[styles.filterBtnText, ageFilter === 1 && styles.filterBtnTextActive]}>
                    &lt; 1 an
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, ageFilter === 2 && styles.filterBtnActive]}
                  onPress={() => setAgeFilter(2)}
                >
                  <Text style={[styles.filterBtnText, ageFilter === 2 && styles.filterBtnTextActive]}>
                    &lt; 2 ans
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Domain Filter - Filtre par domaine d'activité */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Activité :</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.domainScrollView}
              contentContainerStyle={styles.domainScrollContent}
            >
              {Object.entries(DOMAIN_LABELS).map(([key, domain]) => {
                const count = key === 'all' ? businesses.length : (domainCounts[key] || 0);
                if (key !== 'all' && count === 0) return null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.domainBtn,
                      domainFilter === key && { backgroundColor: domain.color, borderColor: domain.color }
                    ]}
                    onPress={() => setDomainFilter(key)}
                  >
                    <Ionicons
                      name={domain.icon as any}
                      size={14}
                      color={domainFilter === key ? '#FFF' : domain.color}
                    />
                    <Text style={[
                      styles.domainBtnText,
                      domainFilter === key && styles.domainBtnTextActive
                    ]}>
                      {domain.label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Sort Mode - Tri par proximite / Mode Tournee */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Tri :</Text>
            <View style={styles.sortButtons}>
              <TouchableOpacity
                style={[styles.sortBtn, sortMode === 'default' && styles.sortBtnActive]}
                onPress={() => handleSortModeChange('default')}
              >
                <Ionicons name="list" size={16} color={sortMode === 'default' ? '#FFF' : '#666'} />
                <Text style={[styles.sortBtnText, sortMode === 'default' && styles.sortBtnTextActive]}>
                  Par defaut
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, sortMode === 'proximity' && styles.sortBtnActiveBlue]}
                onPress={() => handleSortModeChange('proximity')}
                disabled={locationLoading}
              >
                {locationLoading && sortMode !== 'proximity' ? (
                  <ActivityIndicator size="small" color="#2196F3" />
                ) : (
                  <Ionicons name="locate" size={16} color={sortMode === 'proximity' ? '#FFF' : '#2196F3'} />
                )}
                <Text style={[styles.sortBtnText, sortMode === 'proximity' && styles.sortBtnTextActive]}>
                  Proximite
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, sortMode === 'tour' && styles.sortBtnActiveGreen]}
                onPress={() => handleSortModeChange('tour')}
                disabled={locationLoading}
              >
                {locationLoading && sortMode !== 'tour' ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <Ionicons name="navigate" size={16} color={sortMode === 'tour' ? '#FFF' : '#4CAF50'} />
                )}
                <Text style={[styles.sortBtnText, sortMode === 'tour' && styles.sortBtnTextActive]}>
                  Tournee
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Info localisation */}
          {inferredTourStartLocation && sortMode !== 'default' && (
            <View style={styles.locationInfo}>
              <Ionicons name="location" size={14} color="#4CAF50" />
              <Text style={styles.locationInfoText}>
                {tourStartSourceLabel || 'Point de départ disponible'} - {sortMode === 'tour' ? 'Ordre optimisé' : 'Trié par distance'}
              </Text>
            </View>
          )}
          {locationError && (
            <View style={styles.locationError}>
              <Ionicons name="warning" size={14} color="#FF9800" />
              <Text style={styles.locationErrorText}>{locationError}</Text>
            </View>
          )}

        </View>

        {/* Stats */}
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            {displayedBusinesses.length} entreprise{displayedBusinesses.length > 1 ? 's' : ''} à visiter
            {domainFilter !== 'all' && ` (${DOMAIN_LABELS[domainFilter]?.label || domainFilter})`}
          </Text>
        </View>

        {/* Liste des visites */}
        {displayedBusinesses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={64} color="#CCC" />
            <Text style={styles.emptyTitle}>
              {domainFilter !== 'all' ? 'Aucune visite dans ce domaine' : 'Aucune visite prévue'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {domainFilter !== 'all'
                ? 'Essayez un autre filtre ou lancez un nouveau scan'
                : 'Lancez un scan pour trouver de nouvelles entreprises à visiter'
              }
            </Text>
            {domainFilter !== 'all' ? (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setDomainFilter('all')}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={styles.emptyButtonText}>Voir toutes les visites</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/newscan')}
              >
                <Ionicons name="search" size={20} color="#FFF" />
                <Text style={styles.emptyButtonText}>Nouveau scan</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.listContent}>
            {displayedBusinesses.map((item, index) => (
              <React.Fragment key={item.id}>
                {renderVisiteItem({ item, index })}
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
      ) : (
      <FlatList
        data={displayedBusinesses}
        keyExtractor={(item) => item.id}
        renderItem={renderVisiteItem}
        ListHeaderComponent={visitesListHeader}
        ListEmptyComponent={visitesEmptyState}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContent}
        showsVerticalScrollIndicator
        persistentScrollbar
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            colors={['#6366F1']}
            tintColor="#6366F1"
          />
        }
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
  contentScroll: {
    flex: 1,
  },
  contentScrollContent: {
    flexGrow: 1,
    paddingBottom: 72,
  },
  manualVisiteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  manualVisiteModalCard: {
    maxHeight: '88%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    overflow: 'hidden',
  },
  manualVisiteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2FF',
  },
  manualVisiteModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  manualVisiteModalSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    maxWidth: 420,
  },
  manualVisiteModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualVisiteModalBody: {
    maxHeight: 520,
  },
  manualVisiteModalBodyContent: {
    padding: 20,
    gap: 16,
  },
  manualVisiteFieldBlock: {
    gap: 8,
  },
  manualVisiteFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  manualVisiteFieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  manualVisiteFieldHalf: {
    flex: 1,
  },
  manualVisiteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFF',
  },
  addressSuggestionLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addressSuggestionLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  addressSuggestionsList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  addressSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  addressSuggestionContent: {
    flex: 1,
  },
  addressSuggestionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  addressSuggestionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  manualVisiteTextarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  manualVisiteModalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#EEF2FF',
  },
  manualVisiteCancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  manualVisiteCancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  manualVisiteSubmitButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  manualVisiteSubmitButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
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
  manualVisiteHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  manualVisiteHeaderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
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
  tourHeroCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    gap: 12,
  },
  tourHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  tourHeroHeaderActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  tourHeroTextBlock: {
    flex: 1,
  },
  tourHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  tourHeroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  tourHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  tourHeroBadgeActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  tourHeroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tourHeroBadgeTextActive: {
    color: '#FFFFFF',
  },
  tourHeroStats: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourHeroStat: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tourHeroStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  tourHeroStatLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tourHeroActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourStartCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  tourStartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourStartTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  tourStartSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  tourStartSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  tourStartSourceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tourStartInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#111827',
  },
  tourStartLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tourStartLoadingText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  tourStartSuggestions: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  tourStartSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tourStartSuggestionText: {
    flex: 1,
    fontSize: 13,
    color: '#1F2937',
  },
  tourStartActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourStartActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  tourStartActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tourStartActionTextDanger: {
    color: '#B91C1C',
  },
  tourPlanningCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  tourPlanningHeader: {
    gap: 4,
  },
  tourPlanningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  tourPlanningSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  tourStopLimitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tourStopLimitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  tourStopLimitBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  tourStopLimitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  tourStopLimitBtnTextActive: {
    color: '#FFFFFF',
  },
  tourPlanningStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tourPlanningStat: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tourPlanningStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  tourPlanningStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },
  tourProgressCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  tourProgressHeader: {
    gap: 4,
  },
  tourProgressTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  tourProgressSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  tourProgressGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tourProgressPill: {
    minWidth: 90,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tourProgressPillValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  tourProgressPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },
  nextStopCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 10,
  },
  nextStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextStopIndexBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStopIndexText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  nextStopContent: {
    flex: 1,
  },
  nextStopTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  nextStopName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  nextStopMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  nextStopActions: {
    flexDirection: 'row',
    gap: 8,
  },
  nextStopActionBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  nextStopActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tourHalfDayGrid: {
    gap: 10,
  },
  tourHalfDayCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tourHalfDayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3730A3',
    marginBottom: 6,
  },
  tourHalfDayText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  tourHeroPrimaryBtn: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  tourHeroPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tourHeroSecondaryBtn: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  tourHeroSecondaryBtnText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '700',
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    paddingBottom: 32,
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
  activityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  activityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    maxWidth: 200,
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
  badgeOutOfPlan: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeOutOfPlanText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  visiteDetails: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  visiteMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactModeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  contactModeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  phoneReliabilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  phoneReliabilityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nextActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nextActionText: {
    flex: 1,
    fontSize: 13,
    color: '#3730A3',
    fontWeight: '600',
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
  phoneReliabilityReason: {
    fontSize: 12,
    color: '#92400E',
    marginLeft: 26,
    marginTop: -2,
  },
  quickStatusRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  quickStatusBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  quickStatusBtnDone: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  quickStatusBtnRetry: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
  },
  quickStatusBtnNope: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  quickStatusBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickStatusBtnTextDone: {
    color: '#166534',
  },
  quickStatusBtnTextRetry: {
    color: '#9A3412',
  },
  quickStatusBtnTextNope: {
    color: '#991B1B',
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
  actionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  // Filter styles
  filtersContainer: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 80,
  },
  filterButtons: {
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterBtnPappers: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFB74D',
  },
  filterBtnPappersActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  filterBtnAutres: {
    backgroundColor: '#E8F5E9',
    borderColor: '#81C784',
  },
  filterBtnAutresActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterBtnTextActive: {
    color: '#FFF',
  },
  // Domain filter styles
  domainScrollView: {
    flex: 1,
  },
  domainScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  domainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8F8FA',
    borderWidth: 1.5,
    borderColor: '#E0E0E5',
  },
  domainBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  domainBtnTextActive: {
    color: '#FFF',
  },
  // Sort buttons styles
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F8F8FA',
    borderWidth: 1.5,
    borderColor: '#E0E0E5',
  },
  sortBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  sortBtnActiveBlue: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  sortBtnActiveGreen: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  sortBtnTextActive: {
    color: '#FFF',
  },
  // Location info styles
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginTop: 8,
  },
  locationInfoText: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  locationError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginTop: 8,
  },
  locationErrorText: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: '500',
  },
  tourPlannerCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  tourPlannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  tourPlannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  tourPlannerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  tourPlannerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  tourPlannerToggleActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  tourPlannerToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  tourPlannerToggleTextActive: {
    color: '#FFFFFF',
  },
  tourPlannerMetrics: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourMetricPill: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tourMetricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  tourMetricValue: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '800',
  },
  tourPlannerActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  tourPlannerNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  tourPlannerNoticeSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  tourPlannerNoticeWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  tourPlannerNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#92400E',
    fontWeight: '600',
  },
  tourActionText: {
    color: '#1D4ED8',
  },
  tourActionTextSuccess: {
    color: '#0F766E',
  },
  tourActionTextWarning: {
    color: '#B45309',
  },
  tourPreviewCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  tourPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  tourPreviewSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  tourPreviewList: {
    gap: 8,
  },
  tourPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tourPreviewIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  tourPreviewIndexText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tourPreviewContent: {
    flex: 1,
    gap: 2,
  },
  tourPreviewName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  tourPreviewMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  tourPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flex: 1,
    minWidth: 180,
  },
  tourPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  tourSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flex: 1,
    minWidth: 180,
  },
  tourSecondaryButtonText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },
  tourMapSection: {
    marginTop: 4,
    overflow: 'hidden',
    borderRadius: 18,
  },
  // Distance badge style
  badgeDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  badgeDistanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  badgeTourOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  badgeTourOrderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
});

