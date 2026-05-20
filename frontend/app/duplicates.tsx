import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '../utils/api';

// Reason labels in French
const REASON_LABELS: Record<string, string> = {
  siret: 'Même SIRET',
  siren: 'Même SIREN',
  phone: 'Même téléphone',
  name_address: 'Nom et adresse similaires',
  name: 'Nom tres similaire',
};

// Reason colors
const REASON_COLORS: Record<string, string> = {
  siret: '#10B981',
  siren: '#10B981',
  phone: '#6366F1',
  name_address: '#F59E0B',
  name: '#F59E0B',
};

interface Business {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  siret?: string;
  siren?: string;
  city?: string;
  source?: string;
  status?: string;
  reference?: string;
}

interface DuplicateGroup {
  group_id: string;
  businesses: Business[];
  count: number;
  confidence: number;
  reasons: string[];
}

interface Stats {
  total_businesses: number;
  merged_duplicates: number;
  with_siret: number;
  without_siret: number;
}

interface PhoneConflictGroup {
  normalized_phone: string;
  display_phone: string;
  count: number;
  businesses: Business[];
}

interface CleanupTask {
  id: string;
  kind: 'shared_phone' | 'review_phone';
  severity: 'haute' | 'moyenne';
  title: string;
  subtitle: string;
  cta: string;
  businessId?: string;
  phoneGroup?: PhoneConflictGroup;
}

export default function DuplicatesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [totalGroups, setTotalGroups] = useState(0);
  const [phoneConflicts, setPhoneConflicts] = useState<PhoneConflictGroup[]>([]);
  const [reviewRequired, setReviewRequired] = useState<Business[]>([]);
  const [conflictStats, setConflictStats] = useState({ shared_phone_groups: 0, review_required_count: 0 });
  const [processing, setProcessing] = useState<string | null>(null);
  
  // Detail modal
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch duplicates and stats in parallel
      const [duplicatesRes, statsRes, conflictsRes] = await Promise.all([
        axios.get(`${API_URL}/api/duplicates`, { headers }),
        axios.get(`${API_URL}/api/duplicates/stats`, { headers }),
        axios.get(`${API_URL}/api/duplicates/conflicts`, { headers })
      ]);
      
      setGroups(duplicatesRes.data.groups || []);
      setTotalGroups(duplicatesRes.data.total_groups || 0);
      setStats(statsRes.data);
      setPhoneConflicts(conflictsRes?.data?.phone_conflicts || []);
      setReviewRequired(conflictsRes?.data?.review_required || []);
      setConflictStats(conflictsRes?.data?.stats || { shared_phone_groups: 0, review_required_count: 0 });
    } catch (error) {
      console.error('Error fetching duplicates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (group: DuplicateGroup, primaryId: string) => {
    const duplicateIds = group.businesses
      .filter(b => b.id !== primaryId)
      .map(b => b.id);
    
    setProcessing(group.group_id);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(`${API_URL}/api/duplicates/merge`, {
        primary_id: primaryId,
        duplicate_ids: duplicateIds
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      Alert.alert('Succès', `${duplicateIds.length} doublon(s) fusionné(s)`);
      setShowDetailModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur lors de la fusion');
    } finally {
      setProcessing(null);
    }
  };

  const handleIgnore = async (group: DuplicateGroup) => {
    setProcessing(group.group_id);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(`${API_URL}/api/duplicates/ignore`, {
        business_ids: group.businesses.map(b => b.id)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Remove from local state
      setGroups(prev => prev.filter(g => g.group_id !== group.group_id));
      setShowDetailModal(false);
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Erreur');
    } finally {
      setProcessing(null);
    }
  };

  const openGroupDetail = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    setShowDetailModal(true);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return '#10B981';
    if (confidence >= 0.7) return '#F59E0B';
    return '#EF4444';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'Tres probable';
    if (confidence >= 0.7) return 'Probable';
    return 'Possible';
  };

  const cleanupTasks = useMemo<CleanupTask[]>(() => {
    const phoneTasks: CleanupTask[] = phoneConflicts.map((conflict) => ({
      id: `phone-${conflict.normalized_phone}`,
      kind: 'shared_phone',
      severity: conflict.count >= 3 ? 'haute' : 'moyenne',
      title: `${conflict.display_phone} partagé sur ${conflict.count} fiches`,
      subtitle: conflict.businesses
        .slice(0, 3)
        .map((business) => [business.name, business.city].filter(Boolean).join(' - '))
        .join(' | '),
      cta: 'Ouvrir les fiches',
      phoneGroup: conflict,
    }));

    const reviewTasks: CleanupTask[] = reviewRequired.map((business) => ({
      id: `review-${business.id}`,
      kind: 'review_phone',
      severity: business.phone ? 'haute' : 'moyenne',
      title: business.name,
      subtitle: [business.city, business.phone || 'Téléphone sans preuve fiable'].filter(Boolean).join(' - '),
      cta: 'Vérifier la fiche',
      businessId: business.id,
    }));

    return [...phoneTasks, ...reviewTasks].sort((left, right) => {
      const severityWeight = { haute: 0, moyenne: 1 };
      const severityDelta = severityWeight[left.severity] - severityWeight[right.severity];
      if (severityDelta !== 0) return severityDelta;
      if (left.kind !== right.kind) return left.kind === 'shared_phone' ? -1 : 1;
      return left.title.localeCompare(right.title, 'fr');
    });
  }, [phoneConflicts, reviewRequired]);

  const openCleanupTask = (task: CleanupTask) => {
    if (task.kind === 'shared_phone' && task.phoneGroup?.businesses?.length) {
      openBusiness(task.phoneGroup.businesses[0].id);
      return;
    }
    if (task.businessId) {
      openBusiness(task.businessId);
    }
  };

  const openBusiness = (businessId: string) => {
    router.push({ pathname: '/businessdetail', params: { businessId } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Analyse des doublons...</Text>
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
          <Text style={styles.headerTitle}>Détection de doublons</Text>
          <Text style={styles.headerSubtitle}>Nettoyez votre base de prospects</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Ionicons name="refresh" size={20} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Cards */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="business" size={24} color="#6366F1" />
              <Text style={styles.statValue}>{stats.total_businesses}</Text>
              <Text style={styles.statLabel}>Entreprises</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="git-merge" size={24} color="#10B981" />
              <Text style={styles.statValue}>{stats.merged_duplicates}</Text>
              <Text style={styles.statLabel}>Fusionnees</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="warning" size={24} color="#F59E0B" />
              <Text style={styles.statValue}>{totalGroups}</Text>
              <Text style={styles.statLabel}>Groupes</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="call" size={24} color="#7C3AED" />
              <Text style={styles.statValue}>{conflictStats.shared_phone_groups}</Text>
              <Text style={styles.statLabel}>Conflits tel.</Text>
            </View>
          </View>
        )}

        {(phoneConflicts.length > 0 || reviewRequired.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conflits de donnees</Text>

            {cleanupTasks.length > 0 && (
              <View style={styles.cleanupQueueCard}>
                <View style={styles.cleanupQueueHeader}>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#B45309" />
                  <View style={styles.cleanupQueueHeaderText}>
                    <Text style={styles.cleanupQueueTitle}>File prioritaire de nettoyage</Text>
                    <Text style={styles.cleanupQueueSubtitle}>
                      Commence par les téléphones partagés ou sans preuve fiable pour sécuriser tes appels.
                    </Text>
                  </View>
                </View>
                {cleanupTasks.slice(0, 6).map((task, index) => (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.cleanupTaskRow}
                    onPress={() => openCleanupTask(task)}
                  >
                    <View style={styles.cleanupTaskRank}>
                      <Text style={styles.cleanupTaskRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.cleanupTaskContent}>
                      <View style={styles.cleanupTaskTop}>
                        <Text style={styles.cleanupTaskTitle} numberOfLines={1}>{task.title}</Text>
                        <View
                          style={[
                            styles.cleanupSeverityBadge,
                            task.severity === 'haute' ? styles.cleanupSeverityHigh : styles.cleanupSeverityMedium,
                          ]}
                        >
                          <Text
                            style={[
                              styles.cleanupSeverityText,
                              task.severity === 'haute' ? styles.cleanupSeverityTextHigh : styles.cleanupSeverityTextMedium,
                            ]}
                          >
                            {task.severity === 'haute' ? 'Priorité haute' : 'Priorité moyenne'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.cleanupTaskSubtitle} numberOfLines={2}>{task.subtitle}</Text>
                    </View>
                    <View style={styles.cleanupTaskAction}>
                      <Text style={styles.cleanupTaskActionText}>{task.cta}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {phoneConflicts.length > 0 && (
              <View style={styles.conflictsCard}>
                <View style={styles.conflictsHeader}>
                  <Ionicons name="call-outline" size={22} color="#7C3AED" />
                  <View style={styles.conflictsHeaderText}>
                    <Text style={styles.conflictsTitle}>Numéro partagé sur plusieurs fiches</Text>
                    <Text style={styles.conflictsSubtitle}>
                      À vérifier avant appel pour éviter les homonymes ou regroupements incorrects.
                    </Text>
                  </View>
                </View>
                {phoneConflicts.slice(0, 5).map((conflict) => (
                  <View key={conflict.normalized_phone} style={styles.conflictItem}>
                    <View style={styles.conflictItemTop}>
                      <Text style={styles.conflictPhone}>{conflict.display_phone}</Text>
                      <View style={styles.conflictCountBadge}>
                        <Text style={styles.conflictCountBadgeText}>{conflict.count} fiches</Text>
                      </View>
                    </View>
                    {conflict.businesses.slice(0, 3).map((business) => (
                      <TouchableOpacity
                        key={business.id}
                        style={styles.conflictBusinessRow}
                        onPress={() => openBusiness(business.id)}
                      >
                        <Ionicons name="business-outline" size={14} color="#6B7280" />
                        <Text style={styles.conflictBusinessName} numberOfLines={1}>
                          {business.name}
                        </Text>
                        {business.city ? <Text style={styles.conflictBusinessMeta}>{business.city}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {reviewRequired.length > 0 && (
              <View style={styles.conflictsCard}>
                <View style={styles.conflictsHeader}>
                  <Ionicons name="alert-circle-outline" size={22} color="#DC2626" />
                  <View style={styles.conflictsHeaderText}>
                    <Text style={styles.conflictsTitle}>Téléphones à vérifier</Text>
                    <Text style={styles.conflictsSubtitle}>
                      Ces fiches ont un numéro présent mais sans traçabilité suffisamment fiable.
                    </Text>
                  </View>
                </View>
                {reviewRequired.slice(0, 5).map((business) => (
                  <TouchableOpacity
                    key={business.id}
                    style={styles.reviewBusinessRow}
                    onPress={() => openBusiness(business.id)}
                  >
                    <View style={styles.reviewBusinessLeft}>
                      <Text style={styles.reviewBusinessName} numberOfLines={1}>{business.name}</Text>
                      <Text style={styles.reviewBusinessMeta} numberOfLines={1}>
                        {[business.city, business.phone].filter(Boolean).join(' • ') || 'Téléphone à qualifier'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={28} color="#6366F1" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Comment ça marche ?</Text>
            <Text style={styles.infoText}>
              Les doublons sont détectés par SIRET, SIREN, téléphone ou similarité de nom/adresse.
              Choisissez l'entrée principale à conserver et fusionnez les autres.
            </Text>
          </View>
        </View>

        {/* Duplicates List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Doublons Potentiels ({groups.length})
          </Text>

          {groups.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              <Text style={styles.emptyTitle}>Aucun doublon détecté</Text>
              <Text style={styles.emptyText}>
                Votre base de données semble propre !
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <TouchableOpacity
                key={group.group_id}
                style={styles.groupCard}
                onPress={() => openGroupDetail(group)}
              >
                <View style={styles.groupHeader}>
                  <View style={styles.groupCount}>
                    <Text style={styles.groupCountText}>{group.count}</Text>
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName} numberOfLines={1}>
                      {group.businesses[0]?.name || 'Groupe de doublons'}
                    </Text>
                    <View style={styles.reasonsRow}>
                      {group.reasons.map((reason, idx) => (
                        <View 
                          key={idx} 
                          style={[styles.reasonBadge, { backgroundColor: (REASON_COLORS[reason] || '#6366F1') + '20' }]}
                        >
                          <Text style={[styles.reasonText, { color: REASON_COLORS[reason] || '#6366F1' }]}>
                            {REASON_LABELS[reason] || reason}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.confidenceContainer}>
                    <Text style={[styles.confidenceValue, { color: getConfidenceColor(group.confidence) }]}>
                      {Math.round(group.confidence * 100)}%
                    </Text>
                    <Text style={styles.confidenceLabel}>{getConfidenceLabel(group.confidence)}</Text>
                  </View>
                </View>
                
                <View style={styles.groupPreview}>
                  {group.businesses.slice(0, 3).map((b, idx) => (
                    <View key={b.id} style={styles.previewItem}>
                      <Ionicons name="business-outline" size={14} color="#666" />
                      <Text style={styles.previewName} numberOfLines={1}>{b.name}</Text>
                      {b.city && <Text style={styles.previewCity}>{b.city}</Text>}
                    </View>
                  ))}
                  {group.count > 3 && (
                    <Text style={styles.moreText}>+{group.count - 3} autre(s)</Text>
                  )}
                </View>
                
                <View style={styles.groupFooter}>
                  <Text style={styles.tapText}>Appuyez pour gérer</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gérer les doublons</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {selectedGroup && (
              <>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalInfoText}>
                    Sélectionnez l'entreprise à conserver. Les autres seront marquées comme doublons 
                    et leurs données seront fusionnées.
                  </Text>
                  <View style={styles.reasonsRow}>
                    {selectedGroup.reasons.map((reason, idx) => (
                      <View 
                        key={idx} 
                        style={[styles.reasonBadge, { backgroundColor: (REASON_COLORS[reason] || '#6366F1') + '20' }]}
                      >
                        <Ionicons 
                          name={reason === 'siret' || reason === 'siren' ? 'checkmark-circle' : 'alert-circle'} 
                          size={12} 
                          color={REASON_COLORS[reason] || '#6366F1'} 
                        />
                        <Text style={[styles.reasonText, { color: REASON_COLORS[reason] || '#6366F1' }]}>
                          {REASON_LABELS[reason] || reason}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <ScrollView style={styles.businessList}>
                  {selectedGroup.businesses.map((business, idx) => (
                    <View key={business.id} style={styles.businessCard}>
                      <View style={styles.businessHeader}>
                        <View style={styles.businessIndex}>
                          <Text style={styles.businessIndexText}>{idx + 1}</Text>
                        </View>
                        <View style={styles.businessInfo}>
                          <Text style={styles.businessName}>{business.name}</Text>
                          {business.reference && (
                            <Text style={styles.businessRef}>{business.reference}</Text>
                          )}
                        </View>
                      </View>
                      
                      <View style={styles.businessDetails}>
                        {business.address && (
                          <View style={styles.detailRow}>
                            <Ionicons name="location-outline" size={14} color="#666" />
                            <Text style={styles.detailText}>{business.address}</Text>
                          </View>
                        )}
                        {business.phone && (
                          <View style={styles.detailRow}>
                            <Ionicons name="call-outline" size={14} color="#666" />
                            <Text style={styles.detailText}>{business.phone}</Text>
                          </View>
                        )}
                        {business.siret && (
                          <View style={styles.detailRow}>
                            <Ionicons name="document-outline" size={14} color="#666" />
                            <Text style={styles.detailText}>SIRET: {business.siret}</Text>
                          </View>
                        )}
                        {business.source && (
                          <View style={[styles.sourceBadge, { backgroundColor: business.source === 'google' ? '#4285F420' : '#FF660020' }]}>
                            <Text style={[styles.sourceText, { color: business.source === 'google' ? '#4285F4' : '#FF6600' }]}>
                              {business.source}
                            </Text>
                          </View>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[styles.selectBtn, processing === selectedGroup.group_id && styles.selectBtnDisabled]}
                        onPress={() => handleMerge(selectedGroup, business.id)}
                        disabled={processing === selectedGroup.group_id}
                      >
                        {processing === selectedGroup.group_id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                            <Text style={styles.selectBtnText}>Conserver</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.ignoreBtn}
                    onPress={() => handleIgnore(selectedGroup)}
                    disabled={processing === selectedGroup.group_id}
                  >
                    <Ionicons name="eye-off" size={18} color="#666" />
                    <Text style={styles.ignoreBtnText}>Ignorer ce groupe</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
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
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  cleanupQueueCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  cleanupQueueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cleanupQueueHeaderText: {
    flex: 1,
  },
  cleanupQueueTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9A3412',
  },
  cleanupQueueSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#9A3412',
  },
  cleanupTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FFEDD5',
  },
  cleanupTaskRank: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#FDBA74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanupTaskRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
  },
  cleanupTaskContent: {
    flex: 1,
    gap: 4,
  },
  cleanupTaskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cleanupTaskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  cleanupTaskSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
  },
  cleanupSeverityBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cleanupSeverityHigh: {
    backgroundColor: '#FEE2E2',
  },
  cleanupSeverityMedium: {
    backgroundColor: '#FEF3C7',
  },
  cleanupSeverityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cleanupSeverityTextHigh: {
    color: '#B91C1C',
  },
  cleanupSeverityTextMedium: {
    color: '#92400E',
  },
  cleanupTaskAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cleanupTaskActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  conflictsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  conflictsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  conflictsHeaderText: {
    flex: 1,
  },
  conflictsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  conflictsSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
  },
  conflictItem: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    gap: 8,
  },
  conflictItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  conflictPhone: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  conflictCountBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  conflictCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  conflictBusinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conflictBusinessName: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
  },
  conflictBusinessMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  reviewBusinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  reviewBusinessLeft: {
    flex: 1,
  },
  reviewBusinessName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  reviewBusinessMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#6B7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  groupCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupCount: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F59E0B20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupCountText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  reasonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  reasonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confidenceContainer: {
    alignItems: 'flex-end',
  },
  confidenceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  confidenceLabel: {
    fontSize: 11,
    color: '#666',
  },
  groupPreview: {
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 12,
    gap: 8,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewName: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  previewCity: {
    fontSize: 12,
    color: '#999',
  },
  moreText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 4,
  },
  tapText: {
    fontSize: 12,
    color: '#999',
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
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalInfo: {
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  modalInfoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  businessList: {
    padding: 16,
    maxHeight: 400,
  },
  businessCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  businessIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  businessIndexText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  businessRef: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  businessDetails: {
    marginLeft: 38,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  selectBtnDisabled: {
    opacity: 0.6,
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  ignoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    gap: 8,
  },
  ignoreBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
});
