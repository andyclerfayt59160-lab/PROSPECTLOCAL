import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '../utils/api';

interface APIStats {
  api_type: string;
  monthly_budget: number;
  credits_used: number;
  credits_remaining: number;
  percentage_used: number;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
}

interface UsageResponse {
  month: string;
  days_remaining: number;
  stats: APIStats[];
}

interface DailyUsage {
  date: string;
  pappers: number;
  google: number;
  serper: number;
}

const API_CONFIG = {
  pappers: { label: 'Pappers', color: '#F59E0B', icon: 'business-outline' },
  google: { label: 'Google', color: '#4285F4', icon: 'logo-google' },
  serper: { label: 'Serper', color: '#10B981', icon: 'search' },
};

export default function APIUsagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [history, setHistory] = useState<DailyUsage[]>([]);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [selectedAPI, setSelectedAPI] = useState<string>('');
  const [newBudget, setNewBudget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/api/api-usage/stats`, { headers }),
        axios.get(`${API_URL}/api/api-usage/history?days=30`, { headers })
      ]);
      
      setData(statsRes.data);
      setHistory(historyRes.data);
    } catch (error) {
      console.error('Error fetching API usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const openBudgetModal = (apiType: string, currentBudget: number) => {
    setSelectedAPI(apiType);
    setNewBudget(currentBudget.toString());
    setShowBudgetModal(true);
  };

  const saveBudget = async () => {
    if (!newBudget || parseInt(newBudget) < 100) {
      if (typeof window !== 'undefined') window.alert('Budget minimum: 100 crédits');
      return;
    }
    
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/api-usage/budget?api_type=${selectedAPI}&monthly_budget=${newBudget}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setShowBudgetModal(false);
      fetchData();
    } catch (error) {
      console.error('Error saving budget:', error);
      if (typeof window !== 'undefined') window.alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return '#EF4444';
    if (percentage >= 70) return '#F59E0B';
    return '#10B981';
  };

  const getStatusLabel = (percentage: number) => {
    if (percentage >= 100) return 'Épuisé';
    if (percentage >= 90) return 'Critique';
    if (percentage >= 70) return 'Attention';
    return 'OK';
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
          <Text style={styles.headerTitle}>Crédits API</Text>
          <Text style={styles.headerSubtitle}>{data?.month} • {data?.days_remaining} jours restants</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Ionicons name="refresh" size={20} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#6366F1" />
          <Text style={styles.infoBannerText}>
            Suivez votre consommation API et configurez des alertes à 80%, 90% et 100% du budget.
          </Text>
        </View>

        {/* API Cards */}
        {data?.stats.map((stat) => {
          const config = API_CONFIG[stat.api_type as keyof typeof API_CONFIG] || { label: stat.api_type, color: '#6B7280', icon: 'cube' };
          const statusColor = getStatusColor(stat.percentage_used);
          const statusLabel = getStatusLabel(stat.percentage_used);
          
          return (
            <View key={stat.api_type} style={styles.apiCard}>
              <View style={styles.apiHeader}>
                <View style={[styles.apiIconWrapper, { backgroundColor: config.color + '20' }]}>
                  <Ionicons name={config.icon as any} size={24} color={config.color} />
                </View>
                <View style={styles.apiHeaderText}>
                  <Text style={styles.apiName}>{config.label}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.editBudgetBtn}
                  onPress={() => openBudgetModal(stat.api_type, stat.monthly_budget)}
                >
                  <Ionicons name="settings-outline" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        width: `${Math.min(stat.percentage_used, 100)}%`,
                        backgroundColor: statusColor 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{stat.percentage_used.toFixed(1)}%</Text>
              </View>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stat.credits_used.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Utilisés</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#10B981' }]}>{stat.credits_remaining.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Restants</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stat.monthly_budget.toLocaleString()}</Text>
                  <Text style={styles.statLabel}>Budget</Text>
                </View>
              </View>

              {/* Calls Stats */}
              <View style={styles.callsRow}>
                <View style={styles.callStat}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.callStatText}>{stat.successful_calls} réussies</Text>
                </View>
                <View style={styles.callStat}>
                  <Ionicons name="close-circle" size={14} color="#EF4444" />
                  <Text style={styles.callStatText}>{stat.failed_calls} échouées</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Usage History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Historique (30 derniers jours)</Text>
            <View style={styles.historyChart}>
              {history.slice(-14).map((day, index) => {
                const total = day.pappers + day.google + day.serper;
                const maxHeight = 60;
                const height = total > 0 ? Math.max(4, (total / 100) * maxHeight) : 2;
                
                return (
                  <View key={day.date} style={styles.chartBar}>
                    <View style={[styles.chartBarFill, { height }]}>
                      {day.pappers > 0 && (
                        <View style={[styles.chartSegment, { flex: day.pappers, backgroundColor: '#F59E0B' }]} />
                      )}
                      {day.google > 0 && (
                        <View style={[styles.chartSegment, { flex: day.google, backgroundColor: '#4285F4' }]} />
                      )}
                      {day.serper > 0 && (
                        <View style={[styles.chartSegment, { flex: day.serper, backgroundColor: '#10B981' }]} />
                      )}
                    </View>
                    <Text style={styles.chartLabel}>{day.date.slice(-2)}</Text>
                  </View>
                );
              })}
            </View>
            
            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.legendText}>Pappers</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4285F4' }]} />
                <Text style={styles.legendText}>Google</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.legendText}>Serper</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tips Section */}
        <View style={styles.tipsSection}>
          <Text style={styles.sectionTitle}>Conseils pour économiser</Text>
          <View style={styles.tipCard}>
            <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            <Text style={styles.tipText}>
              Réduisez la fréquence de vos surveillances à "Hebdomadaire" pour économiser jusqu'à 90% de crédits Pappers.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            <Text style={styles.tipText}>
              Utilisez les filtres de date plus courts (7 jours au lieu de 30) pour des résultats plus ciblés.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Budget Modal */}
      <Modal visible={showBudgetModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifier le budget</Text>
            <Text style={styles.modalSubtitle}>
              API {API_CONFIG[selectedAPI as keyof typeof API_CONFIG]?.label || selectedAPI}
            </Text>
            
            <TextInput
              style={styles.budgetInput}
              value={newBudget}
              onChangeText={setNewBudget}
              keyboardType="numeric"
              placeholder="Ex: 2000"
            />
            <Text style={styles.inputHint}>Minimum: 100 crédits</Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelBtn}
                onPress={() => setShowBudgetModal(false)}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saveBudget}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                )}
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
    flex: 1,
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
  refreshBtn: {
    padding: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#6366F1',
    lineHeight: 18,
  },
  apiCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  apiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  apiIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apiHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  apiName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  editBudgetBtn: {
    padding: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 50,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  callsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  callStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  callStatText: {
    fontSize: 12,
    color: '#6B7280',
  },
  historySection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  historyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
    marginBottom: 12,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: 16,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'column',
    backgroundColor: '#E5E7EB',
  },
  chartSegment: {
    width: '100%',
  },
  chartLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#6B7280',
  },
  tipsSection: {
    marginBottom: 20,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  budgetInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
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
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#6366F1',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
