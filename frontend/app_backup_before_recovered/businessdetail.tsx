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
  Switch,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function BusinessDetailScreen() {
  const router = useRouter();
  const { businessId, scanId } = useLocalSearchParams();
  const [business, setBusiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  
  // PagesJaunes manual correction state
  const [showPJEditor, setShowPJEditor] = useState(false);
  const [pjPresent, setPjPresent] = useState(false);
  const [pjUrl, setPjUrl] = useState('');
  const [savingPJ, setSavingPJ] = useState(false);
  
  // Note state
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // EPG Modal state
  const [showEPGModal, setShowEPGModal] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadBusiness();
    markAsViewed();
  }, []);

  const loadBusiness = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      setToken(t || '');
      
      // Fetch individual business with shared_history
      const response = await axios.get(
        `${API_URL}/api/businesses/${businessId}`,
        { headers: { Authorization: `Bearer ${t}` } }
      );

      const foundBusiness = response.data;
      setBusiness(foundBusiness);
      
      if (foundBusiness) {
        setPjPresent(foundBusiness.has_pagesjaunes || false);
        setPjUrl(foundBusiness.pagesjaunes_url || '');
        setNote(foundBusiness.note || '');
      }
    } catch (error) {
      console.error('Error loading business:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsViewed = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/viewed`,
        {},
        { headers: { Authorization: `Bearer ${t}` } }
      );
    } catch (error) {
      console.log('Error marking as viewed:', error);
    }
  };

  const savePagesJaunesStatus = async () => {
    setSavingPJ(true);
    try {
      const response = await axios.patch(
        `${API_URL}/api/businesses/${businessId}/pagesjaunes`,
        {
          has_pagesjaunes: pjPresent,
          pagesjaunes_url: pjPresent ? pjUrl : null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBusiness((prev: any) => ({
        ...prev,
        has_pagesjaunes: response.data.has_pagesjaunes,
        pagesjaunes_url: response.data.pagesjaunes_url,
        pj_confidence: response.data.pj_confidence,
        pj_manually_set: true,
        score: response.data.score,
        score_reason: response.data.score_reason,
      }));
      
      setShowPJEditor(false);
      Alert.alert('✓ Sauvegardé', 'Statut PagesJaunes mis à jour');
    } catch (error) {
      console.error('Error saving PJ status:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    } finally {
      setSavingPJ(false);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/status`,
        { note },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBusiness((prev: any) => ({ ...prev, note }));
      Alert.alert('✓ Note sauvegardée');
    } catch (error) {
      console.error('Error saving note:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleContacted = async () => {
    const newStatus = business.contact_status_manual === 'contacted' ? 'not_contacted' : 'contacted';
    
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/status`,
        { contact_status_manual: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBusiness((prev: any) => ({ ...prev, contact_status_manual: newStatus }));
    } catch (error) {
      console.error('Error updating contact status:', error);
    }
  };

  const handleToggleClient = async () => {
    const newStatus = business.client_status === 'client' ? 'not_client' : 'client';
    
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/status`,
        { client_status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBusiness((prev: any) => ({ ...prev, client_status: newStatus }));
    } catch (error) {
      console.error('Error updating client status:', error);
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

  // EPG Copy functions
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
      console.error('Error copying to clipboard:', error);
    }
  };

  const copyAllEPGInfo = async () => {
    const epgText = `Nom: ${business.name || 'N/A'}
SIRET: ${business.siret || 'N/A'}
Adresse: ${business.address || 'N/A'}
Téléphone: ${business.phone || 'N/A'}`;
    
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(epgText);
      } else {
        await Clipboard.setStringAsync(epgText);
      }
      setCopiedField('all');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Error copying all to clipboard:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!business) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Établissement non trouvé</Text>
      </View>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 60) return '#34C759';
    if (score >= 30) return '#FF9500';
    return '#FF3B30';
  };

  const getPJBadge = () => {
    if (business.pj_manually_set) {
      if (business.has_pagesjaunes) {
        return { color: '#34C759', bg: '#E5F3E5', text: '🟢 PRÉSENT', subtext: 'Confirmé manuellement' };
      }
      return { color: '#FF3B30', bg: '#FFE5E5', text: '🔴 ABSENT', subtext: 'Confirmé manuellement' };
    }
    
    if (business.pj_confidence === 'confirmed') {
      if (business.has_pagesjaunes) {
        return { color: '#34C759', bg: '#E5F3E5', text: '🟢 PRÉSENT', subtext: 'Détection automatique' };
      }
      return { color: '#FF3B30', bg: '#FFE5E5', text: '🔴 ABSENT', subtext: 'Détection automatique' };
    }
    
    if (business.pj_confidence === 'not_found') {
      return { color: '#FF3B30', bg: '#FFE5E5', text: '🔴 ABSENT', subtext: 'Détection automatique' };
    }
    
    return { color: '#FF9500', bg: '#FFF3E5', text: '🟡 À CONFIRMER', subtext: 'Vérification requise' };
  };

  const pjBadge = getPJBadge();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fiche établissement</Text>
        <TouchableOpacity 
          style={styles.epgButton}
          onPress={() => setShowEPGModal(true)}
        >
          <Ionicons name="document-text" size={20} color="#FFF" />
          <Text style={styles.epgButtonText}>EPJ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Business Name & Score */}
        <View style={styles.heroCard}>
          <Text style={styles.businessName}>{business.name}</Text>
          
          <View style={styles.scoreRow}>
            <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(business.score) }]}>
              <Text style={styles.scoreText}>{business.score}</Text>
            </View>
            <Text style={styles.scoreLabel}>Score de prospection</Text>
          </View>
          
          {business.score_reason && (
            <View style={styles.scoreReasonBox}>
              <Text style={styles.scoreReasonText}>{business.score_reason}</Text>
            </View>
          )}
        </View>

        {/* Shared History Section - Moved up for visibility */}
        {business.shared_history && (
          <View style={styles.sharedHistoryCard}>
            <Text style={styles.sectionTitle}>👥 Historique partagé</Text>
            
            {/* Reference PL */}
            {business.pl_reference && (
              <View style={styles.plRefRow}>
                <Text style={styles.plRefLabel}>Référence:</Text>
                <View style={styles.plRefBadge}>
                  <Text style={styles.plRefText}>{business.pl_reference}</Text>
                </View>
              </View>
            )}
            
            {/* First detection */}
            <View style={styles.historyItem}>
              <Ionicons name="flag-outline" size={16} color="#6366F1" />
              <Text style={styles.historyText}>
                Détecté le {new Date(business.shared_history.first_detected_at).toLocaleDateString('fr-FR')} par {business.shared_history.first_detected_by}
              </Text>
            </View>
            
            {/* Detection count */}
            {business.shared_history.detection_count > 1 && (
              <View style={styles.historyItem}>
                <Ionicons name="people-outline" size={16} color="#FF9500" />
                <Text style={styles.historyText}>
                  Détecté par {business.shared_history.detection_count} utilisateur(s): {business.shared_history.detected_by_users?.slice(0, 3).join(', ')}{business.shared_history.detected_by_users?.length > 3 ? '...' : ''}
                </Text>
              </View>
            )}
            
            {/* View count */}
            <View style={styles.historyItem}>
              <Ionicons name="eye-outline" size={16} color="#34C759" />
              <Text style={styles.historyText}>
                {business.shared_history.total_views} consultation(s)
                {business.shared_history.last_viewed_by && ` - Dernière: ${business.shared_history.last_viewed_by}`}
              </Text>
            </View>
            
            {/* Shared statuses */}
            {(business.shared_history.is_contacted || business.shared_history.is_client || 
              business.shared_history.is_not_interested || business.shared_history.is_in_crm) && (
              <View style={styles.sharedStatusesRow}>
                {business.shared_history.is_contacted && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#34C759' }]}>
                    <Text style={styles.sharedStatusText}>✓ Contacté ({business.shared_history.contacted_by})</Text>
                  </View>
                )}
                {business.shared_history.is_client && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#FF9800' }]}>
                    <Text style={styles.sharedStatusText}>★ Client ({business.shared_history.marked_client_by})</Text>
                  </View>
                )}
                {business.shared_history.is_not_interested && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#FF3B30' }]}>
                    <Text style={styles.sharedStatusText}>✗ Non intéressé ({business.shared_history.not_interested_by})</Text>
                  </View>
                )}
                {business.shared_history.is_in_crm && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#007AFF' }]}>
                    <Text style={styles.sharedStatusText}>☁ Dans CRM ({business.shared_history.in_crm_by})</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Status Actions: Contacté + Client + Non intéressé + CRM */}
        <View style={styles.statusActionsCard}>
          <Text style={styles.sectionTitle}>📊 Statut prospection</Text>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Contacté</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.contact_status_manual === 'contacted' && styles.statusToggleActive
                ]}
                onPress={handleToggleContacted}
              >
                <Ionicons 
                  name={business.contact_status_manual === 'contacted' ? "call" : "call-outline"} 
                  size={20} 
                  color={business.contact_status_manual === 'contacted' ? "#FFF" : "#666"} 
                />
                <Text style={[
                  styles.statusToggleText,
                  business.contact_status_manual === 'contacted' && styles.statusToggleTextActive
                ]}>
                  {business.contact_status_manual === 'contacted' ? 'Oui' : 'Non'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Client</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.client_status === 'client' && styles.statusToggleClient
                ]}
                onPress={handleToggleClient}
              >
                <Ionicons 
                  name={business.client_status === 'client' ? "star" : "star-outline"} 
                  size={20} 
                  color={business.client_status === 'client' ? "#FFF" : "#666"} 
                />
                <Text style={[
                  styles.statusToggleText,
                  business.client_status === 'client' && styles.statusToggleTextActive
                ]}>
                  {business.client_status === 'client' ? 'Oui' : 'Non'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* New status row: Non intéressé + Déjà dans CRM */}
          <View style={[styles.statusRow, { marginTop: 16 }]}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Non intéressé</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.interest_status === 'not_interested' && styles.statusToggleNotInterested
                ]}
                onPress={handleToggleNotInterested}
              >
                <Ionicons 
                  name={business.interest_status === 'not_interested' ? "close-circle" : "close-circle-outline"} 
                  size={20} 
                  color={business.interest_status === 'not_interested' ? "#FFF" : "#666"} 
                />
                <Text style={[
                  styles.statusToggleText,
                  business.interest_status === 'not_interested' && styles.statusToggleTextActive
                ]}>
                  {business.interest_status === 'not_interested' ? 'Oui' : 'Non'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Déjà dans CRM</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.crm_status === 'in_crm' && styles.statusToggleInCRM
                ]}
                onPress={handleToggleInCRM}
              >
                <Ionicons 
                  name={business.crm_status === 'in_crm' ? "cloud-done" : "cloud-outline"} 
                  size={20} 
                  color={business.crm_status === 'in_crm' ? "#FFF" : "#666"} 
                />
                <Text style={[
                  styles.statusToggleText,
                  business.crm_status === 'in_crm' && styles.statusToggleTextActive
                ]}>
                  {business.crm_status === 'in_crm' ? 'Oui' : 'Non'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Note Section */}
        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>📝 Note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Ajouter une note sur cet établissement..."
            placeholderTextColor="#999"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
          />
          <TouchableOpacity
            style={[styles.saveNoteButton, savingNote && styles.saveNoteButtonDisabled]}
            onPress={saveNote}
            disabled={savingNote}
          >
            {savingNote ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFF" />
                <Text style={styles.saveNoteButtonText}>Enregistrer la note</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* PagesJaunes Status */}
        <View style={styles.pjSection}>
          <View style={styles.pjHeader}>
            <Text style={styles.sectionTitle}>📘 Statut PagesJaunes</Text>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => setShowPJEditor(!showPJEditor)}
            >
              <Ionicons name={showPJEditor ? "close" : "pencil"} size={18} color="#6366F1" />
              <Text style={styles.editButtonText}>{showPJEditor ? 'Annuler' : 'Modifier'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.pjBadgeContainer, { backgroundColor: pjBadge.bg }]}>
            <Text style={[styles.pjBadgeText, { color: pjBadge.color }]}>{pjBadge.text}</Text>
            <Text style={styles.pjBadgeSubtext}>{pjBadge.subtext}</Text>
          </View>

          {!business.has_pagesjaunes && (
            <View style={styles.prospectAlert}>
              <Text style={styles.prospectAlertText}>🎯 PROSPECT PRIORITAIRE</Text>
              <Text style={styles.prospectAlertSubtext}>
                Établissement présent sur Google mais absent de PagesJaunes
              </Text>
            </View>
          )}

          {business.has_pagesjaunes && business.pagesjaunes_url && (
            <TouchableOpacity 
              style={styles.pjLink}
              onPress={() => Linking.openURL(business.pagesjaunes_url)}
            >
              <Ionicons name="open-outline" size={20} color="#6366F1" />
              <Text style={styles.pjLinkText}>Voir la fiche PagesJaunes</Text>
            </TouchableOpacity>
          )}

          {showPJEditor && (
            <View style={styles.pjEditor}>
              <Text style={styles.pjEditorTitle}>Correction manuelle</Text>
              
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Présent sur PagesJaunes</Text>
                <Switch
                  value={pjPresent}
                  onValueChange={setPjPresent}
                  trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                />
              </View>

              {pjPresent && (
                <TextInput
                  style={styles.urlInput}
                  placeholder="URL de la fiche PagesJaunes (optionnel)"
                  placeholderTextColor="#999"
                  value={pjUrl}
                  onChangeText={setPjUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              )}

              <TouchableOpacity 
                style={[styles.saveButton, savingPJ && styles.saveButtonDisabled]}
                onPress={savePagesJaunesStatus}
                disabled={savingPJ}
              >
                {savingPJ ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                    <Text style={styles.saveButtonText}>Sauvegarder</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Coordonnées</Text>
          
          {business.address && (
            <TouchableOpacity 
              style={styles.contactRow}
              onPress={() => {
                const query = encodeURIComponent(business.address);
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
              }}
            >
              <Ionicons name="location-outline" size={24} color="#6366F1" />
              <View style={styles.contactContent}>
                <Text style={styles.contactLabel}>Adresse</Text>
                <Text style={styles.contactValue}>{business.address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          )}

          {business.phone && (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={24} color="#34C759" />
              <View style={styles.contactContent}>
                <Text style={styles.contactLabel}>Téléphone</Text>
                <Text style={styles.contactValue}>{business.phone}</Text>
              </View>
              <View style={styles.phoneActions}>
                <TouchableOpacity 
                  style={[
                    styles.phoneCopyBtn,
                    copiedField === 'phone_direct' && styles.phoneCopyBtnSuccess
                  ]}
                  onPress={() => copyToClipboard(business.phone, 'phone_direct')}
                >
                  <Ionicons 
                    name={copiedField === 'phone_direct' ? "checkmark" : "copy-outline"} 
                    size={18} 
                    color={copiedField === 'phone_direct' ? "#FFF" : "#6366F1"} 
                  />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.phoneCallBtn}
                  onPress={() => Linking.openURL(`tel:${business.phone}`)}
                >
                  <Ionicons name="call" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          {copiedField === 'phone_direct' && (
            <View style={styles.copiedFeedback}>
              <Text style={styles.copiedFeedbackText}>✓ Numéro copié !</Text>
            </View>
          )}

          {business.siret && (
            <View style={styles.contactRow}>
              <Ionicons name="document-text-outline" size={24} color="#666" />
              <View style={styles.contactContent}>
                <Text style={styles.contactLabel}>SIRET</Text>
                <Text style={styles.contactValue}>{business.siret}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Online Presence */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Présence en ligne</Text>

          {business.website_url ? (
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() => Linking.openURL(business.website_url)}
            >
              <View style={[styles.linkIcon, styles.linkIconWeb]}>
                <Ionicons name="globe" size={24} color="#FFF" />
              </View>
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>Site Web</Text>
                <Text style={styles.linkSubtitle} numberOfLines={1}>{business.website_url}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </TouchableOpacity>
          ) : (
            <View style={styles.linkCard}>
              <View style={[styles.linkIcon, styles.linkIconDisabled]}>
                <Ionicons name="globe-outline" size={24} color="#999" />
              </View>
              <View style={styles.linkContent}>
                <Text style={styles.linkTitleDisabled}>Pas de site web</Text>
              </View>
            </View>
          )}

          {business.google_place_id && (
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() => {
                const url = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${business.google_place_id}`;
                Linking.openURL(url);
              }}
            >
              <View style={[styles.linkIcon, styles.linkIconGoogle]}>
                <Ionicons name="logo-google" size={24} color="#FFF" />
              </View>
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>Fiche Google</Text>
                <Text style={styles.linkSubtitle}>
                  {business.google_rating ? `⭐ ${business.google_rating}` : 'Sans note'}
                  {business.google_reviews_count > 0 && ` • ${business.google_reviews_count} avis`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* EPG Modal */}
      <Modal
        visible={showEPGModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEPGModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.epgModalContent}>
            <View style={styles.epgModalHeader}>
              <Text style={styles.epgModalTitle}>📄 Création EPJ</Text>
              <TouchableOpacity onPress={() => setShowEPGModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.epgModalSubtitle}>
              Informations à copier pour la création de la fiche
            </Text>

            {/* Nom */}
            <View style={styles.epgFieldRow}>
              <View style={styles.epgFieldInfo}>
                <Text style={styles.epgFieldLabel}>Nom</Text>
                <Text style={styles.epgFieldValue}>{business.name || 'N/A'}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.epgCopyBtn, copiedField === 'name' && styles.epgCopyBtnSuccess]}
                onPress={() => copyToClipboard(business.name || '', 'name')}
              >
                <Ionicons 
                  name={copiedField === 'name' ? "checkmark" : "copy-outline"} 
                  size={18} 
                  color={copiedField === 'name' ? "#FFF" : "#6366F1"} 
                />
              </TouchableOpacity>
            </View>

            {/* SIRET */}
            <View style={styles.epgFieldRow}>
              <View style={styles.epgFieldInfo}>
                <Text style={styles.epgFieldLabel}>SIRET</Text>
                <Text style={styles.epgFieldValue}>{business.siret || 'Non disponible'}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.epgCopyBtn, copiedField === 'siret' && styles.epgCopyBtnSuccess]}
                onPress={() => copyToClipboard(business.siret || '', 'siret')}
                disabled={!business.siret}
              >
                <Ionicons 
                  name={copiedField === 'siret' ? "checkmark" : "copy-outline"} 
                  size={18} 
                  color={copiedField === 'siret' ? "#FFF" : business.siret ? "#6366F1" : "#CCC"} 
                />
              </TouchableOpacity>
            </View>

            {/* Adresse */}
            <View style={styles.epgFieldRow}>
              <View style={styles.epgFieldInfo}>
                <Text style={styles.epgFieldLabel}>Adresse</Text>
                <Text style={styles.epgFieldValue}>{business.address || 'Non disponible'}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.epgCopyBtn, copiedField === 'address' && styles.epgCopyBtnSuccess]}
                onPress={() => copyToClipboard(business.address || '', 'address')}
                disabled={!business.address}
              >
                <Ionicons 
                  name={copiedField === 'address' ? "checkmark" : "copy-outline"} 
                  size={18} 
                  color={copiedField === 'address' ? "#FFF" : business.address ? "#6366F1" : "#CCC"} 
                />
              </TouchableOpacity>
            </View>

            {/* Téléphone */}
            <View style={styles.epgFieldRow}>
              <View style={styles.epgFieldInfo}>
                <Text style={styles.epgFieldLabel}>Téléphone</Text>
                <Text style={styles.epgFieldValue}>{business.phone || 'Non disponible'}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.epgCopyBtn, copiedField === 'phone' && styles.epgCopyBtnSuccess]}
                onPress={() => copyToClipboard(business.phone || '', 'phone')}
                disabled={!business.phone}
              >
                <Ionicons 
                  name={copiedField === 'phone' ? "checkmark" : "copy-outline"} 
                  size={18} 
                  color={copiedField === 'phone' ? "#FFF" : business.phone ? "#6366F1" : "#CCC"} 
                />
              </TouchableOpacity>
            </View>

            {/* Copy All Button */}
            <TouchableOpacity 
              style={[styles.epgCopyAllBtn, copiedField === 'all' && styles.epgCopyAllBtnSuccess]}
              onPress={copyAllEPGInfo}
            >
              <Ionicons 
                name={copiedField === 'all' ? "checkmark-circle" : "clipboard-outline"} 
                size={20} 
                color="#FFF" 
              />
              <Text style={styles.epgCopyAllBtnText}>
                {copiedField === 'all' ? 'Copié !' : 'Copier tout'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  businessName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  scoreLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  scoreReasonBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
  },
  scoreReasonText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  statusActionsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  statusItem: {
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  statusToggleActive: {
    backgroundColor: '#34C759',
  },
  statusToggleClient: {
    backgroundColor: '#FF9800',
  },
  statusToggleNotInterested: {
    backgroundColor: '#FF3B30',
  },
  statusToggleInCRM: {
    backgroundColor: '#007AFF',
  },
  statusToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusToggleTextActive: {
    color: '#FFF',
  },
  noteCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  noteInput: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginTop: 12,
    marginBottom: 12,
  },
  saveNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    borderRadius: 8,
  },
  saveNoteButtonDisabled: {
    opacity: 0.6,
  },
  saveNoteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pjSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pjHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: '#F0F0FF',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  pjBadgeContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pjBadgeText: {
    fontSize: 20,
    fontWeight: '800',
  },
  pjBadgeSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
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
  pjLink: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F0F0FF',
    borderRadius: 8,
  },
  pjLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  pjEditor: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
  },
  pjEditorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  urlInput: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    padding: 12,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  contactContent: {
    flex: 1,
    marginLeft: 12,
  },
  contactLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  phoneActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneCopyBtn: {
    padding: 10,
    backgroundColor: '#F0F0FF',
    borderRadius: 8,
  },
  phoneCopyBtnSuccess: {
    backgroundColor: '#34C759',
  },
  phoneCallBtn: {
    padding: 10,
    backgroundColor: '#34C759',
    borderRadius: 8,
  },
  copiedFeedback: {
    backgroundColor: '#E5F3E5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 36,
    marginTop: -4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  copiedFeedbackText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '600',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    marginTop: 12,
  },
  linkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkIconWeb: {
    backgroundColor: '#007AFF',
  },
  linkIconGoogle: {
    backgroundColor: '#EA4335',
  },
  linkIconDisabled: {
    backgroundColor: '#E5E5EA',
  },
  linkContent: {
    flex: 1,
    marginLeft: 12,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  linkTitleDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  linkSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  // EPG Button styles
  epgButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  epgButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // EPG Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  epgModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
  },
  epgModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  epgModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  epgModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  epgFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  epgFieldInfo: {
    flex: 1,
  },
  epgFieldLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  epgFieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  epgCopyBtn: {
    padding: 10,
    backgroundColor: '#F0F0F5',
    borderRadius: 8,
    marginLeft: 12,
  },
  epgCopyBtnSuccess: {
    backgroundColor: '#34C759',
  },
  epgCopyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  epgCopyAllBtnSuccess: {
    backgroundColor: '#34C759',
  },
  epgCopyAllBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Shared History Styles
  sharedHistoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E8E8FF',
  },
  plRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  plRefLabel: {
    fontSize: 14,
    color: '#666',
  },
  plRefBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  plRefText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  historyText: {
    flex: 1,
    fontSize: 13,
    color: '#444',
  },
  sharedStatusesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  sharedStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sharedStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  sharedNotesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  sharedNotesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  sharedNoteItem: {
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  sharedNoteAuthor: {
    fontSize: 11,
    color: '#6366F1',
    fontWeight: '600',
    marginBottom: 2,
  },
  sharedNoteText: {
    fontSize: 13,
    color: '#333',
  },
});
