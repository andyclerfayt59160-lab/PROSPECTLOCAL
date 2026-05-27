import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { API_URL } from '../utils/api';
import {
  AUDIT_PORTAL_LOGIN_ROUTE,
  clearStoredSession,
  getStoredUserProfile,
  handleAuthError,
  isExternalAuditOnlyUser,
} from '../utils/authHelpers';

interface ApiKeyStatusPayload {
  has_google_api_key?: boolean;
  has_serper_api_key?: boolean;
  has_pappers_api_key?: boolean;
  onboarding_completed?: boolean;
}

interface AuditSummary {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  location: string;
  radius_km: number;
  selected_domain_labels?: string[];
  created_at: string;
  result_count?: number;
  progress?: number;
}

function formatAuditDate(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PortailAuditSitesScreen() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [portalOnly, setPortalOnly] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiKeyStatusPayload>({
    has_google_api_key: false,
    has_serper_api_key: false,
    has_pappers_api_key: false,
    onboarding_completed: false,
  });
  const [recentAudits, setRecentAudits] = useState<AuditSummary[]>([]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const storedUser = await getStoredUserProfile();

        if (!token) {
          router.replace(AUDIT_PORTAL_LOGIN_ROUTE);
          return;
        }

        setPortalOnly(isExternalAuditOnlyUser(storedUser));
        setUserEmail(storedUser?.email || '');

        await loadPortalData(token);
      } finally {
        setBooting(false);
      }
    };

    bootstrap();
  }, [router]);

  const loadPortalData = async (providedToken?: string) => {
    setLoading(true);
    try {
      const token = providedToken || (await AsyncStorage.getItem('token'));
      if (!token) {
        router.replace(AUDIT_PORTAL_LOGIN_ROUTE);
        return;
      }

      const [keysResponse, auditsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/user/api-keys`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/external-site-audits?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setApiStatus(keysResponse.data || {});
      setRecentAudits(Array.isArray(auditsResponse.data) ? auditsResponse.data : []);
    } catch (error: any) {
      console.error('Portal home load error:', error);
      const wasAuthError = await handleAuthError(error, true, router);
      if (wasAuthError) {
        return;
      }
      Alert.alert('Erreur', "Impossible de charger le portail d'audit pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  const readiness = useMemo(() => {
    const googleReady = !!apiStatus.has_google_api_key;
    const serperReady = !!apiStatus.has_serper_api_key;
    const pappersReady = !!apiStatus.has_pappers_api_key;
    const onboardingReady = !!apiStatus.onboarding_completed;
    return {
      googleReady,
      serperReady,
      pappersReady,
      onboardingReady,
      auditReady: googleReady && serperReady,
    };
  }, [apiStatus]);

  const handleLogout = async () => {
    await clearStoredSession();
    router.replace(AUDIT_PORTAL_LOGIN_ROUTE);
  };

  if (booting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <ProspectLocalLogo size={44} variant="icon" />
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Portail Audit Sites</Text>
              <Text style={styles.headerSubtitle}>
                Espace dedie a l'identification des pros equipes d'un site concurrent.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#475569" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>{portalOnly ? 'Acces collegue' : 'Acces portail'}</Text>
          <Text style={styles.heroTitle}>Bonjour{userEmail ? ` ${userEmail}` : ''}</Text>
          <Text style={styles.heroText}>
            Ici, tu peux configurer tes propres API, lancer des audits de sites externes sur une zone donnee et exporter les resultats en Excel.
          </Text>
          <View style={styles.heroChecklist}>
            <View style={styles.heroChecklistItem}>
              <Ionicons name={readiness.googleReady ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={readiness.googleReady ? '#047857' : '#94A3B8'} />
              <Text style={styles.heroChecklistText}>Google Places {readiness.googleReady ? 'configure' : 'a configurer'}</Text>
            </View>
            <View style={styles.heroChecklistItem}>
              <Ionicons name={readiness.serperReady ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={readiness.serperReady ? '#047857' : '#94A3B8'} />
              <Text style={styles.heroChecklistText}>Serper {readiness.serperReady ? 'configure' : 'a configurer'}</Text>
            </View>
            <View style={styles.heroChecklistItem}>
              <Ionicons name={readiness.pappersReady ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={readiness.pappersReady ? '#047857' : '#94A3B8'} />
              <Text style={styles.heroChecklistText}>Pappers {readiness.pappersReady ? 'configuree' : 'optionnelle'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.primaryAction, !readiness.auditReady && styles.primaryActionMuted]}
            onPress={() => router.push('/audit-site-externe?portal=1')}
          >
            <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>
              {readiness.auditReady ? "Lancer un audit site externe" : 'Configurer les API avant de lancer un audit'}
            </Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => router.push('/settings?onboarding=1&portal=audit')}
            >
              <Ionicons name="key-outline" size={18} color="#4F46E5" />
              <Text style={styles.secondaryActionTitle}>Onboarding et API</Text>
              <Text style={styles.secondaryActionText}>Renseigner Google, Serper et Pappers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => router.push('/audit-site-externe?portal=1')}
            >
              <Ionicons name="document-text-outline" size={18} color="#4F46E5" />
              <Text style={styles.secondaryActionTitle}>Mes audits</Text>
              <Text style={styles.secondaryActionText}>Suivre la progression et exporter en Excel</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statusPanel}>
          <Text style={styles.panelTitle}>Etat du compte</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>{readiness.auditReady ? 'Pret' : 'A finir'}</Text>
              <Text style={styles.statusLabel}>Audit externe</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>{readiness.onboardingReady ? 'Fini' : 'En attente'}</Text>
              <Text style={styles.statusLabel}>Onboarding</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>{recentAudits.length}</Text>
              <Text style={styles.statusLabel}>Audits recents</Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Mode d'emploi rapide</Text>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepIndex}>1</Text>
            <Text style={styles.guideStepText}>Configure tes cles API dans l'onboarding.</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepIndex}>2</Text>
            <Text style={styles.guideStepText}>Lance un audit avec une ville, un rayon et un domaine d'activite.</Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideStepIndex}>3</Text>
            <Text style={styles.guideStepText}>Attends la fin du traitement puis exporte tous les resultats en Excel.</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Audits recents</Text>
          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color="#4F46E5" />
            </View>
          ) : recentAudits.length === 0 ? (
            <Text style={styles.emptyText}>Aucun audit lance pour le moment sur ce compte.</Text>
          ) : (
            recentAudits.map((audit) => (
              <TouchableOpacity
                key={audit.id}
                style={styles.auditRow}
                onPress={() => router.push(`/audit-site-externe?portal=1&auditId=${audit.id}`)}
              >
                <View style={styles.auditRowTop}>
                  <Text style={styles.auditRowTitle}>{audit.location} - {audit.radius_km} km</Text>
                  <Text style={styles.auditRowStatus}>{audit.status === 'done' ? 'Termine' : audit.status === 'failed' ? 'Interrompu' : `${audit.progress || 0}%`}</Text>
                </View>
                <Text style={styles.auditRowMeta}>
                  {audit.selected_domain_labels?.join(', ') || 'Tous les domaines'} - {audit.result_count || 0} site(s)
                </Text>
                <Text style={styles.auditRowMeta}>{formatAuditDate(audit.created_at)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 12,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#4F46E5',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
  heroChecklist: {
    gap: 8,
  },
  heroChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroChecklistText: {
    fontSize: 13,
    color: '#334155',
  },
  quickActions: {
    gap: 12,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  primaryActionMuted: {
    backgroundColor: '#6366F1',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryActions: {
    gap: 12,
  },
  secondaryAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  secondaryActionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  secondaryActionText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  statusPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  statusCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  statusValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  guideStepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '800',
    fontSize: 12,
  },
  guideStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
  },
  loadingBlock: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  auditRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  auditRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  auditRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  auditRowStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  auditRowMeta: {
    fontSize: 12,
    color: '#64748B',
  },
});
