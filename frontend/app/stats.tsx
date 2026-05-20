import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_URL } from '../utils/api';
const screenWidth = Dimensions.get('window').width;

interface Stats {
  total_leads: number;
  internet_leads: number;
  pappers_leads: number;
  leads_with_phone: number;
  leads_without_phone: number;
  enrichment_rate: number;
  web_enriched_count: number;
  phones_from_web: number;
  visites_terrain_pending: number;
  total_scans: number;
  internet_scans: number;
  pappers_scans: number;
  favorite_scans: number;
}

interface TrendData {
  daily: Array<{
    date: string;
    scans: number;
    leads: number;
    with_phone: number;
    verified: number;
  }>;
  weekly: Array<{
    week: string;
    scans: number;
    leads: number;
  }>;
  summary: {
    total_scans_30d: number;
    total_leads_30d: number;
    avg_leads_per_scan: number;
  };
}

export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const [statsRes, trendsRes] = await Promise.all([
        axios.get(`${API_URL}/api/stats/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/stats/trends`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: null }))
      ]);
      setStats(statsRes.data);
      if (trendsRes.data) setTrends(trendsRes.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  // Simple bar chart component
  const BarChart = ({ data, maxValue, color, label }: { data: number[]; maxValue: number; color: string; label: string }) => {
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartLabel}>{label}</Text>
        <View style={styles.barsContainer}>
          {data.map((value, index) => (
            <View key={index} style={styles.barWrapper}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    height: maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 2,
                    backgroundColor: color,
                    opacity: index === data.length - 1 ? 1 : 0.5 + (index / data.length) * 0.5
                  }
                ]} 
              />
              <Text style={styles.barLabel}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Donut chart component
  const DonutChart = ({ value, total, color, label }: { value: number; total: number; color: string; label: string }) => {
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    const circumference = 2 * Math.PI * 40;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    return (
      <View style={styles.donutContainer}>
        <View style={styles.donutWrapper}>
          <View style={[styles.donutBackground, { borderColor: color + '30' }]} />
          <View 
            style={[
              styles.donutProgress, 
              { 
                borderColor: color,
                borderTopColor: 'transparent',
                borderRightColor: percentage > 25 ? color : 'transparent',
                borderBottomColor: percentage > 50 ? color : 'transparent',
                borderLeftColor: percentage > 75 ? color : 'transparent',
                transform: [{ rotate: '-90deg' }]
              }
            ]} 
          />
          <View style={styles.donutCenter}>
            <Text style={[styles.donutValue, { color }]}>{percentage}%</Text>
          </View>
        </View>
        <Text style={styles.donutLabel}>{label}</Text>
        <Text style={styles.donutSubtext}>{value}/{total}</Text>
      </View>
    );
  };

  // Progress ring using simple View-based approach
  const ProgressRing = ({ percentage, color, size = 80 }: { percentage: number; color: string; size?: number }) => {
    const segments = 36;
    const filledSegments = Math.round((percentage / 100) * segments);
    
    return (
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <View style={styles.ringSegments}>
          {Array.from({ length: segments }).map((_, i) => {
            const angle = (i / segments) * 360;
            const filled = i < filledSegments;
            return (
              <View
                key={i}
                style={[
                  styles.ringSegment,
                  {
                    backgroundColor: filled ? color : color + '20',
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateY: -size / 2 + 4 }
                    ]
                  }
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.ringText, { color }]}>{percentage}%</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="stats-chart" size={48} color="#6366F1" />
        <Text style={styles.loadingText}>Chargement des statistiques...</Text>
      </View>
    );
  }

  const weeklyLeads = trends?.weekly?.map(w => w.leads) || [0, 0, 0, 0];
  const maxWeeklyLeads = Math.max(...weeklyLeads, 1);
  const phonePercentage = stats?.total_leads ? Math.round((stats.leads_with_phone / stats.total_leads) * 100) : 0;
  const verifiedPercentage = stats?.total_leads ? Math.round(((stats.internet_leads + stats.pappers_leads) / stats.total_leads) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/home')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="stats-chart" size={24} color="#6366F1" />
          <Text style={styles.headerText}>Statistiques</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#6366F1']} />}
      >
        {/* Key Metrics - Big Numbers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, styles.metricCardPrimary]}>
              <Ionicons name="people" size={28} color="#FFF" />
              <Text style={styles.metricValue}>{stats?.total_leads || 0}</Text>
              <Text style={styles.metricLabel}>Leads Total</Text>
            </View>
            <View style={[styles.metricCard, styles.metricCardSuccess]}>
              <Ionicons name="call" size={28} color="#FFF" />
              <Text style={styles.metricValue}>{stats?.leads_with_phone || 0}</Text>
              <Text style={styles.metricLabel}>Avec Téléphone</Text>
            </View>
            <View style={[styles.metricCard, styles.metricCardWarning]}>
              <Ionicons name="walk" size={28} color="#FFF" />
              <Text style={styles.metricValue}>{stats?.visites_terrain_pending || 0}</Text>
              <Text style={styles.metricLabel}>Visites Terrain</Text>
            </View>
          </View>
        </View>

        {/* Circular Progress Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Taux de conversion</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressCard}>
              <View style={styles.circularProgress}>
                <View style={styles.progressCircle}>
                  <View style={[styles.progressCircleFill, { 
                    borderColor: '#10B981',
                    borderTopColor: phonePercentage >= 25 ? '#10B981' : '#E5E7EB',
                    borderRightColor: phonePercentage >= 50 ? '#10B981' : '#E5E7EB',
                    borderBottomColor: phonePercentage >= 75 ? '#10B981' : '#E5E7EB',
                    borderLeftColor: phonePercentage >= 100 ? '#10B981' : '#E5E7EB',
                  }]} />
                  <Text style={[styles.circularValue, { color: '#10B981' }]}>{phonePercentage}%</Text>
                </View>
              </View>
              <Text style={styles.progressLabel}>Avec Téléphone</Text>
              <Text style={styles.progressSubtext}>{stats?.leads_with_phone}/{stats?.total_leads}</Text>
            </View>
            
            <View style={styles.progressCard}>
              <View style={styles.circularProgress}>
                <View style={styles.progressCircle}>
                  <View style={[styles.progressCircleFill, { 
                    borderColor: '#6366F1',
                    borderTopColor: (stats?.enrichment_rate || 0) >= 25 ? '#6366F1' : '#E5E7EB',
                    borderRightColor: (stats?.enrichment_rate || 0) >= 50 ? '#6366F1' : '#E5E7EB',
                    borderBottomColor: (stats?.enrichment_rate || 0) >= 75 ? '#6366F1' : '#E5E7EB',
                    borderLeftColor: (stats?.enrichment_rate || 0) >= 100 ? '#6366F1' : '#E5E7EB',
                  }]} />
                  <Text style={[styles.circularValue, { color: '#6366F1' }]}>{Math.round(stats?.enrichment_rate || 0)}%</Text>
                </View>
              </View>
              <Text style={styles.progressLabel}>Enrichissement Web</Text>
              <Text style={styles.progressSubtext}>{stats?.phones_from_web}/{stats?.web_enriched_count}</Text>
            </View>
          </View>
        </View>

        {/* Weekly Trend Chart */}
        {trends && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activité des 4 dernières semaines</Text>
            <View style={styles.trendCard}>
              <View style={styles.trendBars}>
                {trends.weekly.map((week, index) => (
                  <View key={index} style={styles.trendBarColumn}>
                    <View style={styles.trendBarWrapper}>
                      <View 
                        style={[
                          styles.trendBar,
                          { 
                            height: maxWeeklyLeads > 0 ? Math.max((week.leads / maxWeeklyLeads) * 120, 4) : 4,
                            backgroundColor: index === trends.weekly.length - 1 ? '#6366F1' : '#6366F170'
                          }
                        ]}
                      />
                    </View>
                    <Text style={styles.trendBarValue}>{week.leads}</Text>
                    <Text style={styles.trendBarLabel}>{week.week}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.trendSummary}>
                <View style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryValue}>{trends.summary.total_scans_30d}</Text>
                  <Text style={styles.trendSummaryLabel}>Scans (30j)</Text>
                </View>
                <View style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryValue}>{trends.summary.total_leads_30d}</Text>
                  <Text style={styles.trendSummaryLabel}>Leads (30j)</Text>
                </View>
                <View style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryValue}>{Math.round(trends.summary.avg_leads_per_scan)}</Text>
                  <Text style={styles.trendSummaryLabel}>Moy./scan</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Source Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Répartition par source</Text>
          <View style={styles.sourceCards}>
            <TouchableOpacity 
              style={[styles.sourceCard, { borderLeftColor: '#6366F1' }]}
              onPress={() => router.push('/scan-internet')}
            >
              <View style={styles.sourceHeader}>
                <View style={[styles.sourceIcon, { backgroundColor: '#6366F120' }]}>
                  <Ionicons name="globe" size={20} color="#6366F1" />
                </View>
                <View style={styles.sourceInfo}>
                  <Text style={styles.sourceTitle}>Scan Tout Internet</Text>
                  <Text style={styles.sourceScans}>{stats?.internet_scans || 0} scans</Text>
                </View>
              </View>
              <View style={styles.sourceStats}>
                <Text style={[styles.sourceValue, { color: '#6366F1' }]}>{stats?.internet_leads || 0}</Text>
                <Text style={styles.sourceLabel}>leads</Text>
              </View>
              <View style={[styles.sourceBar, { backgroundColor: '#6366F120' }]}>
                <View style={[
                  styles.sourceBarFill, 
                  { 
                    backgroundColor: '#6366F1',
                    width: stats?.total_leads ? `${(stats.internet_leads / stats.total_leads) * 100}%` : '0%'
                  }
                ]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.sourceCard, { borderLeftColor: '#F97316' }]}
              onPress={() => router.push('/scan-pappers')}
            >
              <View style={styles.sourceHeader}>
                <View style={[styles.sourceIcon, { backgroundColor: '#F9731620' }]}>
                  <Ionicons name="business" size={20} color="#F97316" />
                </View>
                <View style={styles.sourceInfo}>
                  <Text style={styles.sourceTitle}>Scan Pappers+</Text>
                  <Text style={styles.sourceScans}>{stats?.pappers_scans || 0} scans</Text>
                </View>
              </View>
              <View style={styles.sourceStats}>
                <Text style={[styles.sourceValue, { color: '#F97316' }]}>{stats?.pappers_leads || 0}</Text>
                <Text style={styles.sourceLabel}>leads</Text>
              </View>
              <View style={[styles.sourceBar, { backgroundColor: '#F9731620' }]}>
                <View style={[
                  styles.sourceBarFill, 
                  { 
                    backgroundColor: '#F97316',
                    width: stats?.total_leads ? `${(stats.pappers_leads / stats.total_leads) * 100}%` : '0%'
                  }
                ]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Métriques détaillées</Text>
          <View style={styles.quickStatsGrid}>
            <View style={styles.quickStatItem}>
              <Ionicons name="layers" size={20} color="#6366F1" />
              <Text style={styles.quickStatValue}>{stats?.total_scans || 0}</Text>
              <Text style={styles.quickStatLabel}>Scans total</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Ionicons name="star" size={20} color="#F59E0B" />
              <Text style={styles.quickStatValue}>{stats?.favorite_scans || 0}</Text>
              <Text style={styles.quickStatLabel}>Favoris</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Ionicons name="cloud-download" size={20} color="#10B981" />
              <Text style={styles.quickStatValue}>{stats?.web_enriched_count || 0}</Text>
              <Text style={styles.quickStatLabel}>Enrichis web</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Ionicons name="phone-portrait" size={20} color="#8B5CF6" />
              <Text style={styles.quickStatValue}>{stats?.phones_from_web || 0}</Text>
              <Text style={styles.quickStatLabel}>Tél. trouvés</Text>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={() => router.push('/home')}
          >
            <Ionicons name="add-circle" size={24} color="#FFF" />
            <Text style={styles.ctaText}>Lancer un nouveau scan</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#F0F4F8',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  refreshBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  // Metrics Row
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  metricCardPrimary: {
    backgroundColor: '#6366F1',
  },
  metricCardSuccess: {
    backgroundColor: '#10B981',
  },
  metricCardWarning: {
    backgroundColor: '#F59E0B',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF99',
    textAlign: 'center',
  },
  // Progress Cards
  progressRow: {
    flexDirection: 'row',
    gap: 12,
  },
  progressCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  circularProgress: {
    marginBottom: 12,
  },
  progressCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 8,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressCircleFill: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 8,
    transform: [{ rotate: '-45deg' }],
  },
  circularValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  progressSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  // Trend Card
  trendCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
  },
  trendBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
    marginBottom: 16,
  },
  trendBarColumn: {
    alignItems: 'center',
    flex: 1,
  },
  trendBarWrapper: {
    height: 120,
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  trendBar: {
    width: 32,
    borderRadius: 6,
    minHeight: 4,
  },
  trendBarValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 2,
  },
  trendBarLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  trendSummary: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  trendSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  trendSummaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  trendSummaryLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  // Source Cards
  sourceCards: {
    gap: 12,
  },
  sourceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sourceInfo: {
    flex: 1,
  },
  sourceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  sourceScans: {
    fontSize: 12,
    color: '#6B7280',
  },
  sourceStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 8,
  },
  sourceValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  sourceLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  sourceBar: {
    height: 6,
    borderRadius: 3,
  },
  sourceBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Quick Stats Grid
  quickStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickStatItem: {
    width: (screenWidth - 56) / 2,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  // CTA
  ctaSection: {
    marginTop: 8,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Legacy styles (kept for compatibility)
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chartLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  bar: {
    width: 20,
    borderRadius: 4,
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#6B7280',
  },
  donutContainer: {
    alignItems: 'center',
    padding: 16,
  },
  donutWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  donutBackground: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 10,
  },
  donutProgress: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 10,
  },
  donutCenter: {
    position: 'absolute',
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  donutLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  donutSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSegments: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  ringSegment: {
    position: 'absolute',
    width: 4,
    height: 8,
    borderRadius: 2,
    left: '50%',
    marginLeft: -2,
  },
  ringText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
