import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '../utils/api';

interface APIHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error' | 'not_configured';
  message: string;
  latency_ms: number | null;
  has_key: boolean;
  is_public?: boolean;
  credits_remaining?: number | null;
}

interface HealthResponse {
  timestamp: string;
  overall_status: 'healthy' | 'warning' | 'degraded';
  apis: APIHealth[];
  error_rates_24h: Record<string, number>;
}

const STATUS_CONFIG = {
  healthy: { color: '#10B981', icon: 'checkmark-circle', label: 'Opérationnel' },
  warning: { color: '#F59E0B', icon: 'warning', label: 'Attention' },
  error: { color: '#EF4444', icon: 'close-circle', label: 'Erreur' },
  not_configured: { color: '#6B7280', icon: 'remove-circle', label: 'Non configuré' },
  degraded: { color: '#F59E0B', icon: 'warning', label: 'Dégradé' },
};

const API_ICONS: Record<string, string> = {
  'Google Places': 'logo-google',
  'Serper (Web Search)': 'search',
  'Pappers': 'business',
  'API Géo Gouv': 'map',
  'API Entreprises (SIRENE)': 'document-text',
};

export default function SystemHealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  const fetchHealth = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('No token found');
        return;
      }
      
      // Fetch health with alerts (creates alerts if APIs are down)
      const response = await axios.get(`${API_URL}/api/system/health/check-alerts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data.health);
      setLastRefresh(new Date());
      
      // Fetch alert history
      const historyResponse = await axios.get(`${API_URL}/api/system/health/history?hours=24`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlertHistory(historyResponse.data.alerts || []);
      
    } catch (error) {
      console.error('Error fetching system health:', error);
      // Set error state to show user feedback
      setData({
        timestamp: new Date().toISOString(),
        overall_status: 'degraded',
        apis: [],
        error_rates_24h: {}
      } as HealthResponse);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchHealth();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const getOverallStatusConfig = () => {
    if (!data) return STATUS_CONFIG.healthy;
    return STATUS_CONFIG[data.overall_status] || STATUS_CONFIG.healthy;
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return '#6B7280';
    if (ms < 500) return '#10B981';
    if (ms < 1500) return '#F59E0B';
    return '#EF4444';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Vérification des services...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const overallConfig = getOverallStatusConfig();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          data-testid="back-button"
        >
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Santé Système</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => fetchHealth(true)}
          data-testid="refresh-button"
        >
          <Ionicons 
            name="refresh" 
            size={22} 
            color={refreshing ? '#94A3B8' : '#3B82F6'} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchHealth(true)}
            colors={['#3B82F6']}
          />
        }
      >
        {/* Overall Status Card */}
        <View style={[styles.overallCard, { borderColor: overallConfig.color }]}>
          <View style={styles.overallIconContainer}>
            <View style={[styles.overallIconBg, { backgroundColor: `${overallConfig.color}20` }]}>
              <Ionicons name={overallConfig.icon as any} size={40} color={overallConfig.color} />
            </View>
          </View>
          <View style={styles.overallInfo}>
            <Text style={styles.overallLabel}>État Global</Text>
            <Text style={[styles.overallStatus, { color: overallConfig.color }]}>
              {overallConfig.label}
            </Text>
            {lastRefresh && (
              <Text style={styles.lastRefresh}>
                Dernière vérif. : {lastRefresh.toLocaleTimeString()}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.autoRefreshToggle, autoRefresh && styles.autoRefreshActive]}
            onPress={() => setAutoRefresh(!autoRefresh)}
            data-testid="auto-refresh-toggle"
          >
            <Ionicons 
              name={autoRefresh ? 'sync' : 'sync-outline'} 
              size={18} 
              color={autoRefresh ? '#fff' : '#64748B'} 
            />
            <Text style={[styles.autoRefreshText, autoRefresh && styles.autoRefreshTextActive]}>
              Auto
            </Text>
          </TouchableOpacity>
        </View>

        {/* APIs Section */}
        <Text style={styles.sectionTitle}>
          <Ionicons name="server-outline" size={18} color="#64748B" /> Services API
        </Text>

        {data?.apis.map((api, index) => {
          const statusConfig = STATUS_CONFIG[api.status] || STATUS_CONFIG.healthy;
          const iconName = API_ICONS[api.name] || 'cloud';
          
          return (
            <View 
              key={index} 
              style={[styles.apiCard, { borderLeftColor: statusConfig.color }]}
              data-testid={`api-card-${api.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <View style={styles.apiHeader}>
                <View style={styles.apiIconContainer}>
                  <Ionicons name={iconName as any} size={24} color="#475569" />
                </View>
                <View style={styles.apiInfo}>
                  <Text style={styles.apiName}>{api.name}</Text>
                  <View style={styles.apiTags}>
                    {api.is_public && (
                      <View style={styles.publicTag}>
                        <Text style={styles.publicTagText}>Public</Text>
                      </View>
                    )}
                    {!api.has_key && !api.is_public && (
                      <View style={styles.noKeyTag}>
                        <Text style={styles.noKeyTagText}>Clé manquante</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}15` }]}>
                  <Ionicons name={statusConfig.icon as any} size={16} color={statusConfig.color} />
                  <Text style={[styles.statusText, { color: statusConfig.color }]}>
                    {statusConfig.label}
                  </Text>
                </View>
              </View>

              <View style={styles.apiDetails}>
                <Text style={styles.apiMessage}>{api.message}</Text>
                
                <View style={styles.apiMetrics}>
                  <View style={styles.metricItem}>
                    <Ionicons name="speedometer-outline" size={16} color={getLatencyColor(api.latency_ms)} />
                    <Text style={[styles.metricValue, { color: getLatencyColor(api.latency_ms) }]}>
                      {formatLatency(api.latency_ms)}
                    </Text>
                    <Text style={styles.metricLabel}>Latence</Text>
                  </View>
                  
                  {api.credits_remaining !== undefined && api.credits_remaining !== null && (
                    <View style={styles.metricItem}>
                      <Ionicons name="wallet-outline" size={16} color="#6366F1" />
                      <Text style={[styles.metricValue, { color: '#6366F1' }]}>
                        {api.credits_remaining.toLocaleString()}
                      </Text>
                      <Text style={styles.metricLabel}>Crédits</Text>
                    </View>
                  )}

                  {data.error_rates_24h[api.name.toLowerCase().split(' ')[0]] !== undefined && (
                    <View style={styles.metricItem}>
                      <Ionicons 
                        name="alert-circle-outline" 
                        size={16} 
                        color={data.error_rates_24h[api.name.toLowerCase().split(' ')[0]] > 5 ? '#EF4444' : '#10B981'} 
                      />
                      <Text style={[
                        styles.metricValue, 
                        { color: data.error_rates_24h[api.name.toLowerCase().split(' ')[0]] > 5 ? '#EF4444' : '#10B981' }
                      ]}>
                        {data.error_rates_24h[api.name.toLowerCase().split(' ')[0]]}%
                      </Text>
                      <Text style={styles.metricLabel}>Erreurs 24h</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Actions Section */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/credits')}
            data-testid="view-credits-button"
          >
            <Ionicons name="analytics-outline" size={20} color="#3B82F6" />
            <Text style={styles.actionButtonText}>Voir les crédits API</Text>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/settings')}
            data-testid="configure-keys-button"
          >
            <Ionicons name="key-outline" size={20} color="#F59E0B" />
            <Text style={styles.actionButtonText}>Configurer les clés API</Text>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Alert History Section */}
        <TouchableOpacity
          style={styles.alertHistoryHeader}
          onPress={() => setShowAlertHistory(!showAlertHistory)}
          data-testid="alert-history-toggle"
        >
          <View style={styles.alertHistoryTitleRow}>
            <Ionicons name="notifications-outline" size={18} color="#64748B" />
            <Text style={styles.alertHistoryTitle}>Historique des alertes (24h)</Text>
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alertHistory.length}</Text>
            </View>
          </View>
          <Ionicons 
            name={showAlertHistory ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#94A3B8" 
          />
        </TouchableOpacity>

        {showAlertHistory && (
          <View style={styles.alertHistoryContent}>
            {alertHistory.length === 0 ? (
              <View style={styles.noAlertsContainer}>
                <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                <Text style={styles.noAlertsText}>Aucune alerte ces dernières 24h</Text>
              </View>
            ) : (
              alertHistory.map((alert, index) => (
                <View key={index} style={styles.alertItem}>
                  <Ionicons 
                    name={alert.alert_type === 'down' ? 'alert-circle' : 'checkmark-circle'} 
                    size={20} 
                    color={alert.alert_type === 'down' ? '#EF4444' : '#10B981'} 
                  />
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertApiName}>{alert.api_name}</Text>
                    <Text style={styles.alertMessage}>
                      {alert.alert_type === 'down' ? 'Indisponible' : 'Rétabli'}
                    </Text>
                  </View>
                  <Text style={styles.alertTime}>
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Légende</Text>
          <View style={styles.legendItems}>
            {Object.entries(STATUS_CONFIG).slice(0, 4).map(([key, config]) => (
              <View key={key} style={styles.legendItem}>
                <Ionicons name={config.icon as any} size={14} color={config.color} />
                <Text style={styles.legendText}>{config.label}</Text>
              </View>
            ))}
          </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  refreshButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  overallCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  overallIconContainer: {
    marginRight: 16,
  },
  overallIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overallInfo: {
    flex: 1,
  },
  overallLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  overallStatus: {
    fontSize: 24,
    fontWeight: '700',
  },
  lastRefresh: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  autoRefreshToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  autoRefreshActive: {
    backgroundColor: '#3B82F6',
  },
  autoRefreshText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  autoRefreshTextActive: {
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  apiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  apiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  apiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  apiInfo: {
    flex: 1,
  },
  apiName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  apiTags: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 6,
  },
  publicTag: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  publicTagText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '500',
  },
  noKeyTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noKeyTagText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  apiDetails: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  apiMessage: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  apiMetrics: {
    flexDirection: 'row',
    gap: 24,
  },
  metricItem: {
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  metricLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  legend: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 10,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#64748B',
  },
  // Alert History Styles
  alertHistoryHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertHistoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertHistoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  alertBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  alertBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  alertHistoryContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noAlertsContainer: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  noAlertsText: {
    fontSize: 14,
    color: '#64748B',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  alertInfo: {
    flex: 1,
  },
  alertApiName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  alertMessage: {
    fontSize: 12,
    color: '#64748B',
  },
  alertTime: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
