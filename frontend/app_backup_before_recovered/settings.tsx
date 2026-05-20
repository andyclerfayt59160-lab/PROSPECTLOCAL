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
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No token found, retrying...');
        setTimeout(loadApiKeys, 500);
        return;
      }
      
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
      // Retry on 401 error
      if (error.response?.status === 401) {
        setTimeout(loadApiKeys, 1000);
      }
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
      const token = await AsyncStorage.getItem('token');
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
      const token = await AsyncStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/user/api-keys/${keyName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      loadApiKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <ProspectLocalLogo size={36} variant="icon" />
        <Text style={styles.headerTitle}>Paramètres</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color="#6366F1" />
          <View style={styles.infoBannerText}>
            <Text style={styles.infoBannerTitle}>🔑 Vos clés API personnelles</Text>
            <Text style={styles.infoBannerDesc}>
              Configurez vos propres clés pour utiliser vos crédits API. 
              Chaque service propose une offre gratuite généreuse !
            </Text>
          </View>
        </View>

        {/* API Sections */}
        <View style={styles.sectionsContainer}>
          {renderApiSection('google', 'google_api_key', keyStatus.has_google_api_key)}
          {renderApiSection('serper', 'serper_api_key', keyStatus.has_serper_api_key)}
          {renderApiSection('pappers', 'pappers_api_key', keyStatus.has_pappers_api_key)}
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

        {/* Summary */}
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
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pappers (optionnel)</Text>
            <Text style={keyStatus.has_pappers_api_key ? styles.summaryValueOk : styles.summaryValueNo}>
              {keyStatus.has_pappers_api_key ? '✅ Configurée' : '➖ Non configurée'}
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
});
