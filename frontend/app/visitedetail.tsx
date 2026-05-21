import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { API_URL } from '../utils/api';

// Statuts de visite
const VISITE_STATUTS = [
  { key: 'non_visite', label: 'Non visité', icon: 'time-outline', color: '#8E8E93' },
  { key: 'visite', label: 'Visité', icon: 'checkmark-circle', color: '#34C759' },
  { key: 'a_revisiter', label: 'À revisiter', icon: 'refresh', color: '#FF9500' },
  { key: 'interesse', label: 'Intéressé', icon: 'star', color: '#FFD700' },
  { key: 'pas_interesse', label: 'Pas intéressé', icon: 'close-circle', color: '#FF3B30' },
  { key: 'client', label: 'Converti client', icon: 'trophy', color: '#AF52DE' },
];

export default function VisiteDetailScreen() {
  const router = useRouter();
  const { businessId } = useLocalSearchParams();
  const [business, setBusiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [markingDomiciliation, setMarkingDomiciliation] = useState(false);
  const [token, setToken] = useState('');
  
  // Editable fields
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [visiteStatus, setVisiteStatus] = useState('non_visite');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadBusiness();
  }, []);

  const loadBusiness = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');
      
      const response = await axios.get(
        `${API_URL}/api/businesses/${businessId}`,
        { headers: { Authorization: `Bearer ${t}` } }
      );

      const data = response.data;
      setBusiness(data);
      setPhone(data.phone || '');
      setNote(data.note || '');
      setVisiteStatus(data.visite_status || 'non_visite');
    } catch (error) {
      console.error('Error loading business:', error);
      Alert.alert('Erreur', 'Impossible de charger les détails');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.patch(
        `${API_URL}/api/businesses/${businessId}/visite`,
        {
          phone: phone.trim(),
          note: note.trim(),
          visite_status: visiteStatus,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setBusiness(response.data.business);
        Alert.alert('✓ Sauvegardé', 'Les modifications ont été enregistrées');
      }
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenMaps = () => {
    if (business?.address) {
      const encodedAddress = encodeURIComponent(business.address);
      const mapsUrl = Platform.OS === 'ios'
        ? `maps://maps.apple.com/?q=${encodedAddress}`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      Linking.openURL(mapsUrl);
    }
  };

  const handleCall = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Error copying:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const handleDelete = async () => {
    const confirmDelete = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(`Supprimer "${business?.name}" de vos visites de prospection ?`));
        } else {
          Alert.alert(
            '🗑️ Supprimer cette visite ?',
            `"${business?.name}" sera définitivement supprimée de vos visites de prospection.`,
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
      await axios.delete(
        `${API_URL}/api/businesses/${businessId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (Platform.OS === 'web') {
        window.alert('✓ Visite supprimée');
      } else {
        Alert.alert('✓ Supprimé', 'La visite a été supprimée');
      }
      router.back();
    } catch (error) {
      console.error('Error deleting:', error);
      Alert.alert('Erreur', 'Impossible de supprimer');
    }
  };

  const handleToggleNotInterested = async () => {
    const newStatus = business.interest_status === 'not_interested' ? 'unknown' : 'not_interested';
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/status`,
        { interest_status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBusiness((prev: any) => ({ ...prev, interest_status: newStatus }));
    } catch (error) {
      console.error('Error updating interest status:', error);
    }
  };

  const handleToggleInCRM = async () => {
    const newStatus = business.crm_status === 'in_crm' ? 'not_in_crm' : 'in_crm';
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/status`,
        { crm_status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBusiness((prev: any) => ({ ...prev, crm_status: newStatus }));
    } catch (error) {
      console.error('Error updating CRM status:', error);
    }
  };

  const handleMarkDomiciliation = async () => {
    const confirmationMessage =
      `Marquer l'adresse de "${business?.name}" comme domiciliation ?\n\n` +
      `Cette adresse sera exclue des visites terrain futures.`;

    const confirmed = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        resolve(window.confirm(confirmationMessage));
        return;
      }

      Alert.alert(
        'Adresse de domiciliation',
        confirmationMessage,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Confirmer', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });

    if (!confirmed) return;

    setMarkingDomiciliation(true);
    try {
      const response = await axios.patch(
        `${API_URL}/api/businesses/${businessId}/mark-domiciliation`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setBusiness((prev: any) => ({
        ...prev,
        domiciliation_address: true,
        exclude_from_visites: true,
        visite_exclusion_reason: 'domiciliation_address',
        lead_type: prev?.lead_type === 'visite_terrain' ? 'standard' : prev?.lead_type,
        phone_unreachable: false,
        manual_visite_terrain: false,
      }));

      const updatedBusinesses = response.data?.updated_businesses ?? 1;
      Alert.alert(
        'Adresse marquée',
        `Adresse marquée comme domiciliation. ${updatedBusinesses} fiche(s) liée(s) ont été exclues des visites terrain.`
      );
      router.replace('/visites');
    } catch (error) {
      console.error('Error marking domiciliation:', error);
      Alert.alert('Erreur', 'Impossible de marquer cette adresse comme domiciliation');
    } finally {
      setMarkingDomiciliation(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/visites')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fiche visite</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>Entreprise non trouvée</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/visites')}>
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatus = VISITE_STATUTS.find(s => s.key === visiteStatus) || VISITE_STATUTS[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/visites')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fiche visite terrain</Text>
        <TouchableOpacity 
          style={[styles.saveHeaderBtn, saving && styles.saveHeaderBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="checkmark" size={22} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Business Info Card */}
          <View style={styles.infoCard}>
            <Text style={styles.businessName}>{business.name}</Text>

            {business.domiciliation_address && (
              <View style={styles.domiciliationBanner}>
                <Ionicons name="business" size={16} color="#B42318" />
                <Text style={styles.domiciliationBannerText}>
                  Adresse marquée comme domiciliation : exclue des visites terrain
                </Text>
              </View>
            )}
            
            {business.activite_naf && (
              <View style={styles.activityBadge}>
                <Text style={styles.activityText}>{business.activite_naf}</Text>
              </View>
            )}
            
            {business.date_creation && (
              <View style={styles.dateRow}>
                <Ionicons name="calendar" size={16} color="#FF9500" />
                <Text style={styles.dateText}>
                  Créée le {formatDate(business.date_creation)}
                </Text>
              </View>
            )}
          </View>

          {/* Statut de visite */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Statut de visite</Text>
            <View style={styles.statusGrid}>
              {VISITE_STATUTS.map((status) => (
                <TouchableOpacity
                  key={status.key}
                  style={[
                    styles.statusBtn,
                    visiteStatus === status.key && { 
                      backgroundColor: status.color,
                      borderColor: status.color 
                    }
                  ]}
                  onPress={() => setVisiteStatus(status.key)}
                >
                  <Ionicons 
                    name={status.icon as any} 
                    size={20} 
                    color={visiteStatus === status.key ? '#FFF' : status.color} 
                  />
                  <Text style={[
                    styles.statusBtnText,
                    visiteStatus === status.key && styles.statusBtnTextActive
                  ]}>
                    {status.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Statuts CRM */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏢 Statut CRM</Text>
            <View style={styles.crmStatusRow}>
              <TouchableOpacity
                style={[
                  styles.crmStatusBtn,
                  business.interest_status === 'not_interested' && styles.crmStatusBtnNotInterested
                ]}
                onPress={handleToggleNotInterested}
              >
                <Ionicons 
                  name={business.interest_status === 'not_interested' ? "close-circle" : "close-circle-outline"} 
                  size={20} 
                  color={business.interest_status === 'not_interested' ? "#FFF" : "#FF3B30"} 
                />
                <Text style={[
                  styles.crmStatusBtnText,
                  business.interest_status === 'not_interested' && styles.crmStatusBtnTextActive
                ]}>
                  Non intéressé
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.crmStatusBtn,
                  business.crm_status === 'in_crm' && styles.crmStatusBtnInCRM
                ]}
                onPress={handleToggleInCRM}
              >
                <Ionicons 
                  name={business.crm_status === 'in_crm' ? "cloud-done" : "cloud-outline"} 
                  size={20} 
                  color={business.crm_status === 'in_crm' ? "#FFF" : "#007AFF"} 
                />
                <Text style={[
                  styles.crmStatusBtnText,
                  business.crm_status === 'in_crm' && styles.crmStatusBtnTextActive
                ]}>
                  Déjà dans CRM
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Coordonnées */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Coordonnées</Text>
            
            {/* Adresse */}
            <TouchableOpacity style={styles.coordRow} onPress={handleOpenMaps}>
              <View style={styles.coordIcon}>
                <Ionicons name="location" size={20} color="#6366F1" />
              </View>
              <View style={styles.coordContent}>
                <Text style={styles.coordLabel}>Adresse</Text>
                <Text style={styles.coordValue}>{business.address || 'Non disponible'}</Text>
              </View>
              <Ionicons name="navigate" size={20} color="#6366F1" />
            </TouchableOpacity>

            {/* SIRET */}
            {business.siret && (
              <TouchableOpacity 
                style={styles.coordRow} 
                onPress={() => copyToClipboard(business.siret, 'siret')}
              >
                <View style={styles.coordIcon}>
                  <Ionicons name="document-text" size={20} color="#666" />
                </View>
                <View style={styles.coordContent}>
                  <Text style={styles.coordLabel}>SIRET</Text>
                  <Text style={styles.coordValue}>{business.siret}</Text>
                </View>
                <Ionicons 
                  name={copiedField === 'siret' ? 'checkmark' : 'copy-outline'} 
                  size={20} 
                  color={copiedField === 'siret' ? '#34C759' : '#999'} 
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Téléphone éditable */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📞 Téléphone</Text>
            <View style={styles.phoneInputContainer}>
              <TextInput
                style={styles.phoneInput}
                placeholder="Renseigner le téléphone..."
                placeholderTextColor="#999"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              {phone ? (
                <>
                  <TouchableOpacity 
                    style={styles.copyPhoneBtn} 
                    onPress={() => copyToClipboard(phone, 'phone')}
                  >
                    <Ionicons 
                      name={copiedField === 'phone' ? 'checkmark' : 'copy'} 
                      size={20} 
                      color={copiedField === 'phone' ? '#34C759' : '#6366F1'} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.callBtn} onPress={handleCall}>
                    <Ionicons name="call" size={20} color="#FFF" />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
            {copiedField === 'phone' && (
              <Text style={styles.copiedFeedback}>✓ Numéro copié !</Text>
            )}
            <Text style={styles.phoneHint}>
              💡 Récupérez le téléphone sur place ou via un autre annuaire
            </Text>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Notes de visite</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Ajouter des notes sur cette visite..."
              placeholderTextColor="#999"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* PagesJaunes Status */}
          <View style={styles.pjSection}>
            <View style={styles.pjRow}>
              <Text style={styles.sectionTitle}>📘 PagesJaunes</Text>
              <View style={[
                styles.pjBadge,
                { backgroundColor: business.has_pagesjaunes ? '#E5F3E5' : '#FFE5E5' }
              ]}>
                <Text style={[
                  styles.pjBadgeText,
                  { color: business.has_pagesjaunes ? '#34C759' : '#FF3B30' }
                ]}>
                  {business.has_pagesjaunes ? '🟢 Présent' : '🔴 Absent'}
                </Text>
              </View>
            </View>
            {!business.has_pagesjaunes && (
              <View style={styles.prospectAlert}>
                <Text style={styles.prospectAlertText}>🎯 PROSPECT PRIORITAIRE</Text>
                <Text style={styles.prospectAlertSubtext}>
                  Entreprise absente de PagesJaunes - Opportunité de prospection !
                </Text>
              </View>
            )}
          </View>

          {/* Save Button */}
          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#FFF" />
                <Text style={styles.saveBtnText}>Enregistrer les modifications</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleOpenMaps}>
              <Ionicons name="navigate" size={24} color="#2196F3" />
              <Text style={styles.quickActionText}>Itinéraire</Text>
            </TouchableOpacity>
            
            {phone ? (
              <TouchableOpacity style={styles.quickActionBtn} onPress={handleCall}>
                <Ionicons name="call" size={24} color="#34C759" />
                <Text style={styles.quickActionText}>Appeler</Text>
              </TouchableOpacity>
            ) : null}
            
            {/* Pappers Link */}
            {business.pappers_url || business.siren ? (
              <TouchableOpacity 
                style={styles.quickActionBtn} 
                onPress={() => {
                  const url = business.pappers_url || `https://www.pappers.fr/entreprise/${business.siren}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="document-text" size={24} color="#F59E0B" />
                <Text style={styles.quickActionText}>Pappers</Text>
              </TouchableOpacity>
            ) : null}
            
            <TouchableOpacity 
              style={styles.quickActionBtn} 
              onPress={() => {
                const info = `${business.name}\n${business.address || ''}\nSIRET: ${business.siret || 'N/A'}`;
                copyToClipboard(info, 'all');
              }}
            >
              <Ionicons 
                name={copiedField === 'all' ? 'checkmark-circle' : 'clipboard'} 
                size={24} 
                color={copiedField === 'all' ? '#34C759' : '#6366F1'} 
              />
              <Text style={styles.quickActionText}>
                {copiedField === 'all' ? 'Copié !' : 'Copier'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.domiciliationBtn, markingDomiciliation && styles.domiciliationBtnDisabled]}
            onPress={handleMarkDomiciliation}
            disabled={markingDomiciliation || business.domiciliation_address}
          >
            {markingDomiciliation ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="business-outline" size={20} color="#FFF" />
                <Text style={styles.domiciliationBtnText}>
                  {business.domiciliation_address
                    ? 'Adresse déjà marquée comme domiciliation'
                    : 'Marquer cette adresse comme domiciliation'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity 
            style={styles.deleteBtn}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteBtnText}>Supprimer cette visite</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    backgroundColor: '#F5F5F7',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    marginTop: 16,
  },
  backBtn: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '600',
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  saveHeaderBtn: {
    backgroundColor: '#34C759',
    padding: 8,
    borderRadius: 8,
  },
  saveHeaderBtnDisabled: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  businessName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  domiciliationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  domiciliationBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#B42318',
  },
  activityBadge: {
    backgroundColor: '#F3E5F5',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  activityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7B1FA2',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F5F7',
    borderWidth: 2,
    borderColor: '#E5E5EA',
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  statusBtnTextActive: {
    color: '#FFF',
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  coordIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  coordContent: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  coordValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#E5E5EA',
  },
  callBtn: {
    backgroundColor: '#34C759',
    padding: 14,
    borderRadius: 12,
  },
  phoneHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  noteInput: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    minHeight: 120,
    borderWidth: 2,
    borderColor: '#E5E5EA',
  },
  pjSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  pjRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pjBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pjBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  prospectAlert: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    alignItems: 'center',
  },
  prospectAlertText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  prospectAlertSubtext: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
  },
  quickActionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  domiciliationBtn: {
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#B42318',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  domiciliationBtnDisabled: {
    opacity: 0.7,
  },
  domiciliationBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  deleteBtnText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
});
