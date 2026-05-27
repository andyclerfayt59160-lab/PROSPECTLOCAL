import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

import { API_URL } from '../utils/api';
import {
  AUDIT_PORTAL_HOME_ROUTE,
  getDefaultRouteForUser,
  getStoredUserProfile,
  handleAuthError,
  redirectToLogin,
} from '../utils/authHelpers';

// Informations sur les API avec les offres gratuites
const API_INFO = {
  google: {
    name: 'Google Places API',
    icon: 'logo-google',
    color: '#4285F4',
    description: 'Recherche des entreprises sur Google Maps',
    freeOffer: '200$ de crédit gratuit/mois (nouveaux comptes)',
    freeDetails: '~2 000 recherches gratuites par mois',
    link: 'https://console.cloud.google.com/apis/credentials',
    billingLink: 'https://console.cloud.google.com/billing',
    usageLink: 'https://console.cloud.google.com/apis/api/places-backend.googleapis.com/metrics',
    steps: [
      'Créez un compte Google Cloud (gratuit)',
      'Activez l\'API "Places API"',
      'Créez une clé API dans "Identifiants"',
      'Copiez la clé générée'
    ]
  },
  serper: {
    name: 'Serper.dev API',
    icon: 'search',
    color: '#10B981',
    description: 'Détection de présence sur PagesJaunes',
    freeOffer: '2 500 recherches gratuites',
    freeDetails: 'Offre de bienvenue sans carte bancaire',
    link: 'https://serper.dev/',
    billingLink: 'https://serper.dev/billing',
    usageLink: 'https://serper.dev/dashboard',
    steps: [
      'Inscrivez-vous sur serper.dev',
      'Récupérez votre clé API dans le dashboard',
      '2 500 requêtes offertes à l\'inscription',
      'Plans payants très abordables ensuite'
    ]
  },
  pappers: {
    name: 'Pappers.fr API',
    icon: 'document-text',
    color: '#F59E0B',
    description: 'Recherche des nouvelles créations d\'entreprises',
    freeOffer: '100 requêtes gratuites/mois',
    freeDetails: 'Offre gratuite suffisante pour débuter - Aucune CB requise',
    link: 'https://www.pappers.fr/api',
    billingLink: 'https://www.pappers.fr/mon-compte',
    usageLink: 'https://www.pappers.fr/api/monitoring',
    steps: [
      'Inscrivez-vous sur pappers.fr (gratuit)',
      'Activez l\'accès API dans votre compte',
      '100 requêtes/mois gratuites incluses',
      'Récupérez votre token API'
    ]
  }
};

export default function SettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string; portal?: string }>();
  const onboardingMode = params.onboarding === '1';
  const portalMode = params.portal === 'audit';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    google_api_key: '',
    serper_api_key: '',
    pappers_api_key: '',
  });
  const [keyStatus, setKeyStatus] = useState({
    has_google_api_key: false,
    has_serper_api_key: false,
    has_pappers_api_key: false,
  });
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    api_alerts: true,
    scan_complete: true,
    weekly_summary: false,
    surveillance_alerts: true,
  });
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [savingNotifs, setSavingNotifs] = useState(false);
  
  // API Usage Stats
  interface UsageStat {
    api_type: string;
    monthly_budget: number;
    credits_used: number;
    credits_remaining: number;
    percentage_used: number;
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
  }
  
  interface UsageStats {
    month: string;
    days_remaining: number;
    stats: UsageStat[];
  }

  interface RuntimeStatus {
    emailDeliveryReady: boolean;
    emailDeliveryMode: string;
    emailDeliveryLabel: string;
    emailDeliveryDescription: string;
    senderEmail: string;
    databaseMode: string;
    databaseLabel: string;
    databaseDescription: string;
    databaseTarget: string;
    databaseName: string;
  }
  
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    emailDeliveryReady: false,
    emailDeliveryMode: 'queue',
    emailDeliveryLabel: 'File d\'attente',
    emailDeliveryDescription: 'Aucun fournisseur email configuré.',
    senderEmail: '',
    databaseMode: 'local',
    databaseLabel: 'Base locale',
    databaseDescription: '',
    databaseTarget: '',
    databaseName: '',
  });
  const requiredKeysReady = portalMode
    ? keyStatus.has_google_api_key
    : keyStatus.has_google_api_key && keyStatus.has_serper_api_key;

  useEffect(() => {
    loadApiKeys();
    loadNotificationPreferences();
    loadUsageStats();
  }, []);

  const getTokenOrRedirect = async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      await clearStoredSession();
      redirectToLogin(router);
      return null;
    }
    return token;
  };
  
  const loadUsageStats = async () => {
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/api/api-usage/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setUsageStats(response.data);
    } catch (error) {
      console.error('Error loading usage stats:', error);
      await handleAuthError(error, true, router);
    } finally {
      setLoadingUsage(false);
    }
  };
  
  const loadNotificationPreferences = async () => {
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/api/user/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setNotifPrefs(response.data.preferences || {
        api_alerts: true,
        scan_complete: true,
        weekly_summary: false,
        surveillance_alerts: true,
      });
      setEmailConfigured(!!response.data.email_delivery_ready);
      setUserEmail(response.data.email || '');
      setRuntimeStatus({
        emailDeliveryReady: !!response.data.email_delivery_ready,
        emailDeliveryMode: response.data.email_delivery_mode || 'queue',
        emailDeliveryLabel: response.data.email_delivery_label || 'File d\'attente',
        emailDeliveryDescription: response.data.email_delivery_description || '',
        senderEmail: response.data.sender_email || '',
        databaseMode: response.data.database_mode || 'local',
        databaseLabel: response.data.database_label || 'Base locale',
        databaseDescription: response.data.database_description || '',
        databaseTarget: response.data.database_target || '',
        databaseName: response.data.database_name || '',
      });
    } catch (error) {
      console.error('Error loading notification preferences:', error);
      await handleAuthError(error, true, router);
    }
  };
  
  const saveNotificationPreferences = async (newPrefs: typeof notifPrefs) => {
    setSavingNotifs(true);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      await axios.put(
        `${API_URL}/api/user/notification-preferences`,
        newPrefs,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifPrefs(newPrefs);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      await handleAuthError(error, true, router);
    } finally {
      setSavingNotifs(false);
    }
  };
  
  const toggleNotifPref = (key: keyof typeof notifPrefs) => {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    saveNotificationPreferences(newPrefs);
  };

  const loadApiKeys = async () => {
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      
      const response = await axios.get(`${API_URL}/api/user/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setKeyStatus({
        has_google_api_key: response.data.has_google_api_key,
        has_serper_api_key: response.data.has_serper_api_key,
        has_pappers_api_key: response.data.has_pappers_api_key,
      });
      console.log('API keys status loaded:', response.data);
    } catch (error: any) {
      console.error('Error loading API keys:', error);
      await handleAuthError(error, true, router);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Vérifier qu'au moins une clé est renseignée
    const hasNewKey = apiKeys.google_api_key || apiKeys.serper_api_key || apiKeys.pappers_api_key;
    if (!hasNewKey) {
      if (Platform.OS === 'web') {
        window.alert('Veuillez renseigner au moins une clé API');
      } else {
        Alert.alert('Info', 'Veuillez renseigner au moins une clé API');
      }
      return;
    }

    setSaving(true);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      await axios.put(
        `${API_URL}/api/user/api-keys`,
        apiKeys,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (Platform.OS === 'web') {
        window.alert('✅ Clés API enregistrées avec succès !');
      } else {
        Alert.alert('Succès', 'Clés API enregistrées avec succès !');
      }

      // Reload status
      loadApiKeys();
      
      // Clear input fields
      setApiKeys({
        google_api_key: '',
        serper_api_key: '',
        pappers_api_key: '',
      });
    } catch (error: any) {
      const wasAuthError = await handleAuthError(error, true, router);
      if (wasAuthError) {
        return;
      }
      const message = error.response?.data?.detail || 'Erreur lors de la sauvegarde';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm('Supprimer cette clé API ?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Supprimer cette clé ?',
            'Vous devrez en renseigner une nouvelle pour utiliser cette fonctionnalité.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmDelete) return;

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      await axios.delete(
        `${API_URL}/api/user/api-keys/${keyName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadApiKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
      await handleAuthError(error, true, router);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!requiredKeysReady) {
      const message = portalMode
        ? "Google Places est requis avant de terminer l'activation du portail audit. Serper reste recommandee, mais non obligatoire."
        : 'Google Places et Serper.dev sont requis avant de terminer la configuration.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Configuration incomplète', message);
      }
      return;
    }

    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      await axios.post(
        `${API_URL}/api/user/complete-onboarding`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const storedUser = await getStoredUserProfile();
      router.replace(portalMode ? AUDIT_PORTAL_HOME_ROUTE : getDefaultRouteForUser(storedUser));
    } catch (error) {
      console.error('Error completing onboarding:', error);
      const wasAuthError = await handleAuthError(error, true, router);
      if (wasAuthError) {
        return;
      }
      if (Platform.OS === 'web') {
        window.alert('Impossible de finaliser l’activation pour le moment.');
      } else {
        Alert.alert('Erreur', 'Impossible de finaliser l’activation pour le moment.');
      }
    }
  };

  const renderApiSection = (
    apiType: 'google' | 'serper' | 'pappers',
    keyName: 'google_api_key' | 'serper_api_key' | 'pappers_api_key',
    hasKey: boolean
  ) => {
    const info = API_INFO[apiType];
    const isExpanded = expandedSection === apiType;

    return (
      <View style={styles.apiSection} key={apiType}>
        <TouchableOpacity
          style={styles.apiHeader}
          onPress={() => setExpandedSection(isExpanded ? null : apiType)}
        >
          <View style={styles.apiHeaderLeft}>
            <View style={[styles.apiIcon, { backgroundColor: info.color + '20' }]}>
              <Ionicons name={info.icon as any} size={24} color={info.color} />
            </View>
            <View style={styles.apiHeaderInfo}>
              <Text style={styles.apiName}>{info.name}</Text>
              <Text style={styles.apiDesc}>{info.description}</Text>
            </View>
          </View>
          <View style={styles.apiHeaderRight}>
            {hasKey ? (
              <View style={styles.statusBadgeOk}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.statusTextOk}>Configurée</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeNo}>
                <Ionicons name="alert-circle" size={16} color="#FF9500" />
                <Text style={styles.statusTextNo}>Non configurée</Text>
              </View>
            )}
            <Ionicons 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color="#666" 
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.apiDetails}>
            {/* Free Offer Banner */}
            <View style={[styles.freeOfferBanner, { borderLeftColor: info.color }]}>
              <Text style={styles.freeOfferTitle}>🎁 {info.freeOffer}</Text>
              <Text style={styles.freeOfferText}>{info.freeDetails}</Text>
            </View>

            {/* Steps */}
            <View style={styles.stepsContainer}>
              <Text style={styles.stepsTitle}>📋 Comment obtenir la clé :</Text>
              {info.steps.map((step, index) => (
                <View key={index} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              {/* Get API Key Button */}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: info.color }]}
                onPress={() => Linking.openURL(info.link)}
              >
                <Ionicons name="key" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>Obtenir la clé</Text>
              </TouchableOpacity>

              {/* Usage/Dashboard Button */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonOutline, { borderColor: info.color }]}
                onPress={() => Linking.openURL(info.usageLink)}
              >
                <Ionicons name="stats-chart" size={16} color={info.color} />
                <Text style={[styles.actionButtonText, { color: info.color }]}>Consommation</Text>
              </TouchableOpacity>

              {/* Billing Button */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonOutline, { borderColor: info.color }]}
                onPress={() => Linking.openURL(info.billingLink)}
              >
                <Ionicons name="card" size={16} color={info.color} />
                <Text style={[styles.actionButtonText, { color: info.color }]}>Facturation</Text>
              </TouchableOpacity>
            </View>

            {/* Input Field */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={hasKey ? '••••••••••••••••' : 'Coller votre clé API ici...'}
                placeholderTextColor="#999"
                value={apiKeys[keyName]}
                onChangeText={(text) => setApiKeys(prev => ({ ...prev, [keyName]: text }))}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {hasKey && (
                <TouchableOpacity
                  style={styles.deleteKeyBtn}
                  onPress={() => handleDeleteKey(keyName)}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={async () => {
            const storedUser = await getStoredUserProfile();
            router.replace(portalMode ? AUDIT_PORTAL_HOME_ROUTE : getDefaultRouteForUser(storedUser));
          }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <ProspectLocalLogo size={36} variant="icon" />
        <Text style={styles.headerTitle}>{portalMode ? 'Onboarding audit sites' : 'Paramètres'}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {onboardingMode && (
          <View style={styles.onboardingHero}>
            <View style={styles.onboardingHeroHeader}>
              <Ionicons name="shield-checkmark" size={24} color="#4F46E5" />
              <Text style={styles.onboardingHeroTitle}>
                {portalMode ? 'Première activation du portail audit' : 'Première configuration sécurisée'}
              </Text>
            </View>
            <Text style={styles.onboardingHeroText}>
              {portalMode
                ? "Chaque collègue configure ici ses propres clés API pour lancer des audits de sites externes sans accéder au reste de l'application. Pour ce portail, seule la clé Google est obligatoire."
                : 'Chaque compte doit renseigner ses propres cles API. Aucune cle personnelle n est partagee avec les autres utilisateurs.'}
            </Text>
            <View style={styles.onboardingSteps}>
              <Text style={styles.onboardingStep}>1. Ouvre Google Places et recupere ta cle Google.</Text>
              <Text style={styles.onboardingStep}>
                2. {portalMode ? 'Serper.dev est recommandee pour elargir la couverture, mais elle n est pas obligatoire.' : 'Ouvre Serper.dev et recupere ta cle Serper.'}
              </Text>
              <Text style={styles.onboardingStep}>
                3. {portalMode ? 'Pappers n est pas demandee pour ce portail audit sites.' : 'Pappers est optionnelle, utile pour le scan Pappers.'}
              </Text>
              <Text style={styles.onboardingStep}>
                4. {portalMode ? "Enregistre tes clés puis termine l'activation du portail." : 'Enregistre les clés puis termine l’activation.'}
              </Text>
            </View>
            <View style={styles.onboardingQuickLinks}>
              <TouchableOpacity
                style={styles.onboardingQuickBtn}
                onPress={() => Linking.openURL(API_INFO.google.link)}
              >
                <Ionicons name="logo-google" size={16} color="#4F46E5" />
                <Text style={styles.onboardingQuickBtnText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.onboardingQuickBtn}
                onPress={() => Linking.openURL(API_INFO.serper.link)}
              >
                <Ionicons name="search" size={16} color="#4F46E5" />
                <Text style={styles.onboardingQuickBtnText}>Serper</Text>
              </TouchableOpacity>
              {!portalMode && (
                <TouchableOpacity
                  style={styles.onboardingQuickBtn}
                  onPress={() => Linking.openURL(API_INFO.pappers.link)}
                >
                  <Ionicons name="document-text" size={16} color="#4F46E5" />
                  <Text style={styles.onboardingQuickBtnText}>Pappers</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.onboardingFinishBtn,
                !requiredKeysReady && styles.onboardingFinishBtnDisabled,
              ]}
              onPress={handleCompleteOnboarding}
              disabled={!requiredKeysReady}
            >
              <Ionicons
                name={requiredKeysReady ? 'checkmark-circle' : 'lock-closed'}
                size={18}
                color="#FFF"
              />
              <Text style={styles.onboardingFinishBtnText}>
                {requiredKeysReady ? 'Terminer l’activation' : portalMode ? 'Google requis' : 'Google + Serper requis'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color="#6366F1" />
          <View style={styles.infoBannerText}>
            <Text style={styles.infoBannerTitle}>🔑 Vos clés API personnelles</Text>
            <Text style={styles.infoBannerDesc}>
              {portalMode
                ? 'Pour ce portail, seule la clé Google est obligatoire. Serper reste recommandee pour élargir les résultats. Pappers n est pas necessaire ici.'
                : 'Configurez vos propres clés pour utiliser vos crédits API. Chaque service propose une offre gratuite généreuse !'}
            </Text>
          </View>
        </View>

        {/* API Sections */}
        <View style={styles.sectionsContainer}>
          {renderApiSection('google', 'google_api_key', keyStatus.has_google_api_key)}
          {renderApiSection('serper', 'serper_api_key', keyStatus.has_serper_api_key)}
          {!portalMode && renderApiSection('pappers', 'pappers_api_key', keyStatus.has_pappers_api_key)}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="save" size={20} color="#FFF" />
              <Text style={styles.saveButtonText}>Enregistrer les clés</Text>
            </>
          )}
        </TouchableOpacity>

        {/* API Usage Dashboard */}
        <View style={styles.usageDashboard}>
          <View style={styles.usageDashboardHeader}>
            <Ionicons name="analytics" size={24} color="#6366F1" />
            <Text style={styles.usageDashboardTitle}>Consommation API du mois</Text>
            {usageStats && (
              <Text style={styles.usageDaysRemaining}>
                {usageStats.days_remaining} jours restants
              </Text>
            )}
          </View>
          
          {loadingUsage ? (
            <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 20 }} />
          ) : usageStats ? (
            <View style={styles.usageCardsContainer}>
              {usageStats.stats.map((stat) => {
                const apiInfo = API_INFO[stat.api_type as keyof typeof API_INFO];
                const isWarning = stat.percentage_used >= 80;
                const isDanger = stat.percentage_used >= 95;
                
                return (
                  <View 
                    key={stat.api_type} 
                    style={[
                      styles.usageCard,
                      isDanger && styles.usageCardDanger,
                      isWarning && !isDanger && styles.usageCardWarning
                    ]}
                  >
                    <View style={styles.usageCardHeader}>
                      <Ionicons 
                        name={apiInfo?.icon as any || 'cloud'} 
                        size={20} 
                        color={apiInfo?.color || '#6366F1'} 
                      />
                      <Text style={styles.usageCardTitle}>
                        {stat.api_type.charAt(0).toUpperCase() + stat.api_type.slice(1)}
                      </Text>
                    </View>
                    
                    {/* Progress Bar */}
                    <View style={styles.usageProgressContainer}>
                      <View style={styles.usageProgressBg}>
                        <View 
                          style={[
                            styles.usageProgressFill,
                            { 
                              width: `${Math.min(stat.percentage_used, 100)}%`,
                              backgroundColor: isDanger ? '#EF4444' : isWarning ? '#F59E0B' : (apiInfo?.color || '#6366F1')
                            }
                          ]} 
                        />
                      </View>
                      <Text style={[
                        styles.usagePercentage,
                        isDanger && { color: '#EF4444' },
                        isWarning && !isDanger && { color: '#F59E0B' }
                      ]}>
                        {stat.percentage_used}%
                      </Text>
                    </View>
                    
                    {/* Stats */}
                    <View style={styles.usageStatsRow}>
                      <Text style={styles.usageStatLabel}>
                        {stat.credits_used.toLocaleString()} / {stat.monthly_budget.toLocaleString()} crédits
                      </Text>
                      <Text style={styles.usageStatValue}>
                        {stat.total_calls} appels
                      </Text>
                    </View>
                    
                    {/* Warning Message */}
                    {isWarning && (
                      <View style={styles.usageWarningBanner}>
                        <Ionicons 
                          name={isDanger ? 'warning' : 'alert-circle'} 
                          size={14} 
                          color={isDanger ? '#EF4444' : '#F59E0B'} 
                        />
                        <Text style={[
                          styles.usageWarningText,
                          isDanger && { color: '#EF4444' }
                        ]}>
                          {isDanger ? 'Budget presque épuisé !' : 'Attention : 80% du budget utilisé'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.usageNoData}>Aucune donnée de consommation disponible</Text>
          )}
          
          {/* Refresh Button */}
          <TouchableOpacity 
            style={styles.usageRefreshBtn}
            onPress={loadUsageStats}
          >
            <Ionicons name="refresh" size={16} color="#6366F1" />
            <Text style={styles.usageRefreshText}>Actualiser</Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        {/* Notification Preferences Section */}
        <View style={styles.runtimeSection}>
          <View style={styles.runtimeHeader}>
            <Ionicons name="hardware-chip" size={24} color="#6366F1" />
            <Text style={styles.runtimeTitle}>Mode d'exploitation</Text>
          </View>

          <View style={styles.runtimeCards}>
            <View style={styles.runtimeCard}>
              <View style={styles.runtimeCardHeader}>
                <Ionicons
                  name={runtimeStatus.emailDeliveryReady ? 'mail-open' : 'mail'}
                  size={18}
                  color={runtimeStatus.emailDeliveryReady ? '#10B981' : '#F59E0B'}
                />
                <Text style={styles.runtimeCardTitle}>Emails</Text>
              </View>
              <Text style={styles.runtimeCardValue}>{runtimeStatus.emailDeliveryLabel}</Text>
              <Text style={styles.runtimeCardDesc}>{runtimeStatus.emailDeliveryDescription}</Text>
              {!!runtimeStatus.senderEmail && (
                <Text style={styles.runtimeCardMeta}>
                  Expediteur : {runtimeStatus.senderEmail}
                </Text>
              )}
            </View>

            <View style={styles.runtimeCard}>
              <View style={styles.runtimeCardHeader}>
                <Ionicons
                  name={runtimeStatus.databaseMode === 'shared' ? 'cloud' : 'server'}
                  size={18}
                  color={runtimeStatus.databaseMode === 'shared' ? '#3B82F6' : '#6366F1'}
                />
                <Text style={styles.runtimeCardTitle}>Base de donnees</Text>
              </View>
              <Text style={styles.runtimeCardValue}>{runtimeStatus.databaseLabel}</Text>
              <Text style={styles.runtimeCardDesc}>{runtimeStatus.databaseDescription}</Text>
              {!!runtimeStatus.databaseTarget && (
                <Text style={styles.runtimeCardMeta}>
                  Cible : {runtimeStatus.databaseTarget}
                  {runtimeStatus.databaseName ? ` / ${runtimeStatus.databaseName}` : ''}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.notificationSection}>
          <View style={styles.notificationHeader}>
            <Ionicons name="notifications" size={24} color="#3B82F6" />
            <Text style={styles.notificationTitle}>Préférences de notifications</Text>
          </View>
          
          {!emailConfigured && (
            <View style={styles.emailWarning}>
              <Ionicons name="information-circle" size={20} color="#F59E0B" />
              <Text style={styles.emailWarningText}>
                Les emails sont actuellement en file d'attente. Configurez RESEND_API_KEY pour activer l'envoi.
              </Text>
            </View>
          )}
          
          <View style={styles.notificationList}>
            <TouchableOpacity
              style={styles.notificationItem}
              onPress={() => toggleNotifPref('api_alerts')}
              data-testid="toggle-api-alerts"
            >
              <View style={styles.notificationItemLeft}>
                <Ionicons name="pulse" size={22} color="#EF4444" />
                <View style={styles.notificationItemInfo}>
                  <Text style={styles.notificationItemTitle}>Alertes API</Text>
                  <Text style={styles.notificationItemDesc}>Quand une API devient indisponible</Text>
                </View>
              </View>
              <View style={[
                styles.toggleSwitch,
                notifPrefs.api_alerts && styles.toggleSwitchActive
              ]}>
                <View style={[
                  styles.toggleKnob,
                  notifPrefs.api_alerts && styles.toggleKnobActive
                ]} />
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.notificationItem}
              onPress={() => toggleNotifPref('scan_complete')}
              data-testid="toggle-scan-complete"
            >
              <View style={styles.notificationItemLeft}>
                <Ionicons name="checkmark-done" size={22} color="#10B981" />
                <View style={styles.notificationItemInfo}>
                  <Text style={styles.notificationItemTitle}>Scan terminé</Text>
                  <Text style={styles.notificationItemDesc}>Quand un scan est complété</Text>
                </View>
              </View>
              <View style={[
                styles.toggleSwitch,
                notifPrefs.scan_complete && styles.toggleSwitchActive
              ]}>
                <View style={[
                  styles.toggleKnob,
                  notifPrefs.scan_complete && styles.toggleKnobActive
                ]} />
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.notificationItem}
              onPress={() => toggleNotifPref('surveillance_alerts')}
              data-testid="toggle-surveillance-alerts"
            >
              <View style={styles.notificationItemLeft}>
                <Ionicons name="eye" size={22} color="#8B5CF6" />
                <View style={styles.notificationItemInfo}>
                  <Text style={styles.notificationItemTitle}>Alertes surveillance</Text>
                  <Text style={styles.notificationItemDesc}>Nouvelles entreprises dans vos zones</Text>
                </View>
              </View>
              <View style={[
                styles.toggleSwitch,
                notifPrefs.surveillance_alerts && styles.toggleSwitchActive
              ]}>
                <View style={[
                  styles.toggleKnob,
                  notifPrefs.surveillance_alerts && styles.toggleKnobActive
                ]} />
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.notificationItem, styles.notificationItemLast]}
              onPress={() => toggleNotifPref('weekly_summary')}
              data-testid="toggle-weekly-summary"
            >
              <View style={styles.notificationItemLeft}>
                <Ionicons name="calendar" size={22} color="#3B82F6" />
                <View style={styles.notificationItemInfo}>
                  <Text style={styles.notificationItemTitle}>Résumé hebdomadaire</Text>
                  <Text style={styles.notificationItemDesc}>Récapitulatif de vos leads chaque semaine</Text>
                </View>
              </View>
              <View style={[
                styles.toggleSwitch,
                notifPrefs.weekly_summary && styles.toggleSwitchActive
              ]}>
                <View style={[
                  styles.toggleKnob,
                  notifPrefs.weekly_summary && styles.toggleKnobActive
                ]} />
              </View>
            </TouchableOpacity>
          </View>
          
          {userEmail && (
            <Text style={styles.emailInfo}>
              Les notifications seront envoyées à : {userEmail}
            </Text>
          )}
        </View>

        {/* Summary Section */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>📊 Résumé de configuration</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Google Places</Text>
            <Text style={keyStatus.has_google_api_key ? styles.summaryValueOk : styles.summaryValueNo}>
              {keyStatus.has_google_api_key ? '✅ Configurée' : '⚠️ Non configurée'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Serper (PagesJaunes)</Text>
            <Text style={keyStatus.has_serper_api_key ? styles.summaryValueOk : styles.summaryValueNo}>
              {keyStatus.has_serper_api_key ? '✅ Configurée' : '⚠️ Non configurée'}
            </Text>
          </View>
          {!portalMode && (
            <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pappers (optionnel)</Text>
            <Text style={keyStatus.has_pappers_api_key ? styles.summaryValueOk : styles.summaryValueNo}>
              {keyStatus.has_pappers_api_key ? '✅ Configurée' : '➖ Non configurée'}
            </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Mode email</Text>
            <Text style={runtimeStatus.emailDeliveryReady ? styles.summaryValueOk : styles.summaryValueNo}>
              {runtimeStatus.emailDeliveryLabel}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Base active</Text>
            <Text style={runtimeStatus.databaseMode === 'shared' ? styles.summaryValueOk : styles.summaryValueNo}>
              {runtimeStatus.databaseLabel}
            </Text>
          </View>
        </View>
      </ScrollView>
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  infoBannerDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  sectionsContainer: {
    gap: 12,
  },
  apiSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  apiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  apiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  apiIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  apiHeaderInfo: {
    flex: 1,
  },
  apiName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  apiDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  apiHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadgeOk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusTextOk: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34C759',
  },
  statusBadgeNo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusTextNo: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF9500',
  },
  apiDetails: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  freeOfferBanner: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  freeOfferTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  freeOfferText: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
  },
  stepsContainer: {
    marginBottom: 16,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    flex: 1,
    minWidth: 100,
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  linkButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  deleteKeyBtn: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  runtimeSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 20,
    padding: 16,
    gap: 14,
  },
  runtimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  runtimeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  runtimeCards: {
    gap: 12,
  },
  runtimeCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  runtimeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  runtimeCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  runtimeCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  runtimeCardDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
  },
  runtimeCardMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  summary: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValueOk: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
  },
  summaryValueNo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500',
  },
  // Notification styles
  notificationSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  emailWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  emailWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
  },
  notificationList: {
    padding: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  notificationItemLast: {
    borderBottomWidth: 0,
  },
  notificationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  notificationItemInfo: {
    flex: 1,
  },
  notificationItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  notificationItemDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E5E5EA',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#34C759',
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  emailInfo: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  // API Usage Dashboard Styles
  usageDashboard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginTop: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  usageDashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  usageDashboardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  usageDaysRemaining: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  usageCardsContainer: {
    gap: 12,
  },
  usageCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  usageCardWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  usageCardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  usageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  usageCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  usageProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  usageProgressBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  usageProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  usagePercentage: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    minWidth: 40,
    textAlign: 'right',
  },
  usageStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  usageStatLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  usageStatValue: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  usageWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FCD34D',
  },
  usageWarningText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B45309',
  },
  usageRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  usageRefreshText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6366F1',
  },
  usageNoData: {
    textAlign: 'center',
    color: '#9CA3AF',
    paddingVertical: 20,
  },
  onboardingHero: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  onboardingHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onboardingHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#312E81',
  },
  onboardingHeroText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#4338CA',
  },
  onboardingSteps: {
    gap: 6,
  },
  onboardingStep: {
    fontSize: 13,
    color: '#3730A3',
  },
  onboardingQuickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  onboardingQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  onboardingQuickBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  onboardingFinishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
  },
  onboardingFinishBtnDisabled: {
    backgroundColor: '#A5B4FC',
  },
  onboardingFinishBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
});
