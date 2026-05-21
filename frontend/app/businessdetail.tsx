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
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import SourceIndicator from '../components/SourceIndicator';
import BusinessHeroCard from '../components/business/BusinessHeroCard';
import BusinessRelatedCluesCard from '../components/business/BusinessRelatedCluesCard';
import BusinessContactCard from '../components/business/BusinessContactCard';
import BusinessEpgModal from '../components/business/BusinessEpgModal';
import BusinessSourcesModal from '../components/business/BusinessSourcesModal';
import { analyzePhoneQuality, analyzeLeadFreshness, CONTACT_STATUSES, getContactStatusInfo } from '../utils/leadAnalysis';

import { API_URL } from '../utils/api';

const copyTextSafely = async (text: string): Promise<boolean> => {
  if (!text) return false;

  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {}

  if (Platform.OS === 'web') {
    try {
      if (navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        return true;
      }
    } catch {}
  }

  return false;
};

const CONTACT_CLUE_CONFIDENCE_META: Record<string, { label: string; color: string; bg: string }> = {
  haute: { label: 'Fiable', color: '#047857', bg: '#D1FAE5' },
  moyenne: { label: 'Probable', color: '#B45309', bg: '#FEF3C7' },
  basse: { label: 'Faible', color: '#B91C1C', bg: '#FEE2E2' },
  non_verifiee: { label: 'À vérifier', color: '#1D4ED8', bg: '#DBEAFE' },
  'a verifier': { label: 'À vérifier', color: '#1D4ED8', bg: '#DBEAFE' },
};

const PHONE_RELIABILITY_META: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  verified: { color: '#047857', bg: '#D1FAE5', icon: 'checkmark-circle-outline' },
  review: { color: '#B45309', bg: '#FEF3C7', icon: 'help-circle-outline' },
  rejected: { color: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle-outline' },
  missing: { color: '#6B7280', bg: '#F3F4F6', icon: 'remove-circle-outline' },
};

// Helper function to open external links safely
const openExternalLink = (url: string) => {
  if (!url) return;
  
  // Ensure URL has protocol
  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('tel:')) {
    finalUrl = 'https://' + url;
  }
  
  // Check if we're on web
  const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (isWeb) {
    try {
      const popup = window.open(finalUrl, '_blank', 'noopener,noreferrer');
      if (popup) {
        return;
      }
    } catch {}

    try {
      const link = document.createElement('a');
      link.href = finalUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
      }, 100);
      return;
    } catch {}

    Alert.alert('Lien externe', `Copie ce lien dans ton navigateur si besoin :\n${finalUrl}`);
  } else {
    // On native, use Linking
    Linking.openURL(finalUrl).catch(err => {
      console.error('Failed to open URL:', err);
      Alert.alert('Erreur', 'Impossible d\'ouvrir le lien');
    });
  }
};

// Helper component for external links that works on web
const ExternalLinkCard = ({ url, children, style }: { url: string; children: React.ReactNode; style: any }) => {
  const isWeb = Platform.OS === 'web';
  
  // Ensure URL has protocol
  let finalUrl = url;
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = 'https://' + url;
  }
  
  if (isWeb && url) {
    // On web, use a real anchor tag
    return (
      <a 
        href={finalUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'block', ...style }}
      >
        {children}
      </a>
    );
  }
  
  // On native or when no URL, use TouchableOpacity
  return (
    <TouchableOpacity
      style={style}
      onPress={() => {
        if (url) {
          Linking.openURL(finalUrl).catch(err => {
            console.error('Failed to open URL:', err);
            Alert.alert('Erreur', 'Impossible d\'ouvrir le lien');
          });
        }
      }}
      disabled={!url}
    >
      {children}
    </TouchableOpacity>
  );
};

const DIRECTORY_HOSTS = [
  'pappers.fr',
  'societe.com',
  'manageo.fr',
  'pagesjaunes.fr',
  '118712.fr',
  'infobel.com',
  'travaux.com',
  'mestravaux.com',
  'habitatpresto.com',
  'rdvartisans.fr',
  '123devis.com',
  'allovoisins.com',
  'starofservice.com',
  'houzz.fr',
];

const CONTACT_MODE_META: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  appel: { label: 'A appeler', color: '#047857', bg: '#D1FAE5', icon: 'call-outline' },
  visite: { label: 'A visiter', color: '#7C3AED', bg: '#EDE9FE', icon: 'walk-outline' },
  creuser: { label: 'A creuser', color: '#B45309', bg: '#FEF3C7', icon: 'search-outline' },
  verifier: { label: 'À vérifier', color: '#B91C1C', bg: '#FEE2E2', icon: 'alert-circle-outline' },
};

const isDirectoryListingUrl = (url: string | null) => {
  if (!url) return false;
  try {
    const normalized = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const host = new URL(normalized).hostname.toLowerCase();
    const normalizedHost = host.startsWith('www.') ? host.slice(4) : host;
    return DIRECTORY_HOSTS.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

const getContactClueConfidenceMeta = (value: string | null) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return CONTACT_CLUE_CONFIDENCE_META[normalized] || CONTACT_CLUE_CONFIDENCE_META['a verifier'];
};

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
  
  // Linked businesses state
  const [linkedBusinesses, setLinkedBusinesses] = useState<any[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [relatedClues, setRelatedClues] = useState<any | null>(null);
  const [loadingRelatedClues, setLoadingRelatedClues] = useState(false);
  const [savingRelatedActionKey, setSavingRelatedActionKey] = useState<string | null>(null);
  
  // SIRET enrichment state
  const [enrichingSiret, setEnrichingSiret] = useState(false);
  
  // Full enrichment state
  const [enrichingFull, setEnrichingFull] = useState(false);
  const [auditingVisibility, setAuditingVisibility] = useState(false);
  
  // Inexploitable state
  const [markingInexploitable, setMarkingInexploitable] = useState(false);
  
  // Sources modal state
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  
  // Move to visite terrain state
  const [movingToVisite, setMovingToVisite] = useState(false);
  const [markingDomiciliation, setMarkingDomiciliation] = useState(false);
  const contactModeMeta = business?.recommended_contact_mode ?
    CONTACT_MODE_META[business.recommended_contact_mode]
    : null;
  const phoneReliabilityMeta = business?.phone_reliability_status ?
    PHONE_RELIABILITY_META[business.phone_reliability_status]
    : null;

  useEffect(() => {
    loadBusiness();
    markAsViewed();
    loadLinkedBusinesses();
    loadRelatedClues();
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
      console.log('Business loaded with data_sources:', foundBusiness.data_sources);
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
  
  const loadLinkedBusinesses = async () => {
    try {
      setLoadingLinked(true);
      const t = await AsyncStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/businesses/${businessId}/linked`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      setLinkedBusinesses(response.data.linked_businesses || []);
    } catch (error) {
      console.error('Error loading linked businesses:', error);
    } finally {
      setLoadingLinked(false);
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
      Alert.alert('Sauvegarde', 'Statut PagesJaunes mis a jour');
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
      Alert.alert('Note sauvegardee');
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

  // Mark as inexploitable function
  const handleMarkInexploitable = async () => {
    const confirmMsg = business.is_inexploitable ?
       'Voulez-vous remettre cet établissement comme exploitable ?'
      : 'Voulez-vous marquer cet établissement comme INEXPLOITABLE définitivement ?\n\nIl ne sera plus affiché dans les résultats.';


    
    Alert.alert(
      business.is_inexploitable ? 'Rendre exploitable' : 'Marquer inexploitable',
      confirmMsg,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => executeMarkInexploitable() }
      ]
    );
  };

  const executeMarkInexploitable = async () => {
    setMarkingInexploitable(true);
    try {
      const endpoint = business.is_inexploitable ?
         `${API_URL}/api/businesses/${businessId}/unmark-inexploitable`
        : `${API_URL}/api/businesses/${businessId}/mark-inexploitable?reason=manuel`;
      
      await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      
      setBusiness((prev: any) => ({ 
        ...prev, 
        is_inexploitable: !prev.is_inexploitable,
        inexploitable_reason: prev.is_inexploitable ? null : 'manuel'
      }));
      
      if (!business.is_inexploitable) {
        Alert.alert('Information', 'Établissement marqué comme inexploitable. Il ne sera plus affiché.');
        router.back();
      }
    } catch (error) {
      console.error('Error marking inexploitable:', error);
      Alert.alert('Erreur', 'Erreur lors de la modification du statut');
    } finally {
      setMarkingInexploitable(false);
    }
  };

  const loadRelatedClues = async () => {
    try {
      setLoadingRelatedClues(true);
      const t = await AsyncStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/businesses/${businessId}/related-clues`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      setRelatedClues(response.data || null);
    } catch (error) {
      console.error('Error loading related clues:', error);
    } finally {
      setLoadingRelatedClues(false);
    }
  };

  // EPG Copy functions
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      const copied = await copyTextSafely(text);
      if (!copied) {
        throw new Error('clipboard_unavailable');
      }
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Copie impossible', "Le presse-papier n'a pas répondu. Réessaie ou copie le texte manuellement.");
    }
  };

  const createRelatedClueInteraction = async (item: any, interactionKey: string) => {
    try {
      setSavingRelatedActionKey(interactionKey);
      const clueTypeLabel =
        item.type === 'phone'
          ? 'Téléphone indirect'
          : item.type === 'email'
            ? 'Email indirect'
            : 'Site indirect';

      const contentLines = [
        `Piste liée détectée : ${clueTypeLabel}`,
        `Valeur: ${item.value}`,
        item.reason ? `Contexte : ${item.reason}` : null,
        item.business_name ? `Société liée : ${item.business_name}` : null,
        item.pl_reference ? `Référence liée : ${item.pl_reference}` : null,
        item.source_label ? `Source : ${item.source_label}` : null,
        item.source_url ? `Preuve : ${item.source_url}` : null,
        item.confidence ? `Confiance : ${item.confidence}` : null,
      ].filter(Boolean);

      await axios.post(
        `${API_URL}/api/crm/interactions`,
        {
          business_id: businessId,
          interaction_type: 'note',
          title: `Piste liée - ${clueTypeLabel}`,
          content: contentLines.join('\n'),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Piste enregistrée', "La piste liée a été ajoutée à l'historique CRM de cette fiche.");
    } catch (error) {
      console.error('Error creating related clue interaction:', error);
      Alert.alert('Erreur', "Impossible d'enregistrer cette piste dans le CRM.");
    } finally {
      setSavingRelatedActionKey(null);
    }
  };

  // Move to visite terrain
  const handleMoveToVisite = async () => {
    const confirmationMessage = 'Déplacer cette fiche en "Visite terrain"\n\nLe numéro sera marqué comme injoignable.';
    const confirmMove = await new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        resolve(window.confirm(confirmationMessage));
        return;
      }

      Alert.alert(
        'Visite terrain',
        confirmationMessage,
        [
          { text: 'Annuler', onPress: () => resolve(false), style: 'cancel' },
          { text: 'Confirmer', onPress: () => resolve(true) }
        ]
      );
    });

    if (!confirmMove) return;
    
    setMovingToVisite(true);
    try {
      await axios.patch(
        `${API_URL}/api/businesses/${businessId}/move-to-visite`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setBusiness((prev: any) => ({
        ...prev,
        lead_type: 'visite_terrain',
        phone_unreachable: true,
        manual_visite_terrain: true
      }));
      
      Alert.alert('Succès', 'Fiche déplacée en visite terrain');
    } catch (error) {
      console.error('Error moving to visite:', error);
      Alert.alert('Erreur', 'Impossible de déplacer la fiche');
    } finally {
      setMovingToVisite(false);
    }
  };

  const handleAuditDigitalVisibility = async () => {
    setAuditingVisibility(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/businesses/${businessId}/digital-visibility-audit`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data?.success && response.data?.business) {
        setBusiness((prev: any) => ({ ...prev, ...response.data.business }));
        Alert.alert(
          'Audit termine',
          response.data.summary || 'La presence Google et PagesJaunes a ete re-verifiee.'
        );
      }
    } catch (error: any) {
      console.error('Error auditing digital visibility:', error);
      Alert.alert(
        'Erreur',
        error?.response?.data?.detail || "Impossible de lancer l'audit de presence digitale"
      );
    } finally {
      setAuditingVisibility(false);
    }
  };

  const handleMarkDomiciliation = async () => {
    const confirmationMessage =
      `Taguer l'adresse de "${business?.name}" comme domiciliation ?\n\n` +
      `Les fiches rattachées à cette adresse resteront dans l'application, mais elles ne seront plus proposées dans les visites terrain futures.`;

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
        'Adresse taguée',
        `Adresse marquée comme domiciliation. ${updatedBusinesses} fiche(s) liée(s) seront retirées des visites terrain futures.`
      );
    } catch (error) {
      console.error('Error marking domiciliation:', error);
      Alert.alert('Erreur', 'Impossible de marquer cette adresse comme domiciliation');
    } finally {
      setMarkingDomiciliation(false);
    }
  };

  const copyAllEPGInfo = async () => {
    // Build complete address
    const fullAddress = [
      business.address,
      business.postal_code,
      business.city
    ].filter(Boolean).join(' ');
    
    const epgText = `Nom: ${business.name || 'N/A'}
SIRET: ${business.siret || 'N/A'}
SIREN: ${business.siren || 'N/A'}
Adresse complete: ${fullAddress || 'N/A'}
Rue: ${business.address || 'N/A'}
Code postal: ${business.postal_code || 'N/A'}
Ville: ${business.city || 'N/A'}
Téléphone: ${business.phone || 'N/A'}
Email: ${business.email || 'N/A'}
Site web: ${business.website_url || 'N/A'}
Activité NAF: ${business.activite_naf || business.libelle_naf || 'N/A'}`;
    
    try {
      const copied = await copyTextSafely(epgText);
      if (!copied) {
        throw new Error('clipboard_unavailable');
      }
      setCopiedField('all');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Error copying all to clipboard:', error);
      Alert.alert('Copie impossible', "Le presse-papier n'a pas répondu. Réessaie ou copie le texte manuellement.");
    }
  };

  // SIRET enrichment function
  const handleEnrichSiret = async () => {
    setEnrichingSiret(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/businesses/${businessId}/enrich-siret`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        // Update business state with new SIRET data
        setBusiness((prev: any) => ({
          ...prev,
          siret: response.data.siret,
          siren: response.data.siren,
          nom_sirene: response.data.nom_sirene,
          activite_naf: response.data.naf_code,
          libelle_naf: response.data.naf_label,
          siret_match_score: response.data.match_score,
          siret_verification_status: response.data.verification_status,
          siret_verification_message: response.data.verification_message,
        }));
        Alert.alert('Succès', `SIRET trouvé : ${response.data.siret}`);
      } else {
        Alert.alert('Info', response.data.message || 'Aucun SIRET trouvé');
      }
    } catch (error: any) {
      console.error('Error enriching SIRET:', error);
      Alert.alert('Erreur', 'Impossible de rechercher le SIRET');
    } finally {
      setEnrichingSiret(false);
    }
  };

  // Full enrichment function
  const handleEnrichFull = async () => {
    setEnrichingFull(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/businesses/${businessId}/enrich-full`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        // Update business state
        const updates: any = {};
        
        if (response.data.emails_found.length > 0) {
          updates.email = response.data.emails_found[0];
          updates.emails_all = response.data.emails_found;
        }
        
        if (response.data.phones_found.length > 0 && !business.phone) {
          updates.phone = response.data.phones_found[0];
        }
        
        if (response.data.social_links) {
          updates.social_links = response.data.social_links;
        }
        
        if (response.data.has_procedure_collective) {
          updates.has_procedure_collective = true;
        }
        
        setBusiness((prev: any) => ({ ...prev, ...updates }));
        
        let message = `Enrichissement terminé.\n`;
        message += `Emails trouvés : ${response.data.emails_found.length || 0}\n`;
        message += `Téléphones trouvés : ${response.data.phones_found.length || 0}\n`;
        message += `Sources: ${response.data.sources_used.join(', ') || 'Aucune'}`;
        
        if (response.data.has_procedure_collective) {
          message += `\nAttention : procédure collective détectée !`;
        }
        
        Alert.alert('Enrichissement', message);
      }
    } catch (error: any) {
      console.error('Error full enrichment:', error);
      Alert.alert('Erreur', 'Impossible de lancer l\'enrichissement');
    } finally {
      setEnrichingFull(false);
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

  const publicWebsiteUrl = business.website_url && !isDirectoryListingUrl(business.website_url) ? business.website_url : '';
  const pappersProfileUrl =
    business.pappers_url ||
    (business.website_url && business.website_url.includes('pappers.fr') ? business.website_url : '');
  const shouldShowManualVisiteBadge = business.lead_type === 'visite_terrain' && !business.phone && !business.phone_unreachable;

  const getScoreColor = (score: number) => {
    if (score >= 60) return '#34C759';
    if (score >= 30) return '#FF9500';
    return '#FF3B30';
  };

  const getPJBadge = () => {
    if (business.pj_manually_set) {
      if (business.has_pagesjaunes) {
        return { color: '#34C759', bg: '#E5F3E5', text: 'PRESENT', subtext: 'Confirme manuellement' };
      }
      return { color: '#FF3B30', bg: '#FFE5E5', text: 'ABSENT', subtext: 'Confirme manuellement' };
    }
    
    if (business.pj_confidence === 'confirmed') {
      if (business.has_pagesjaunes) {
        return { color: '#34C759', bg: '#E5F3E5', text: 'PRESENT', subtext: 'Détection automatique' };
      }
      return { color: '#FF3B30', bg: '#FFE5E5', text: 'ABSENT', subtext: 'Détection automatique' };
    }
    
    if (business.pj_confidence === 'not_found') {
      return { color: '#FF3B30', bg: '#FFE5E5', text: 'ABSENT', subtext: 'Détection automatique' };
    }
    
    return { color: '#FF9500', bg: '#FFF3E5', text: 'A CONFIRMER', subtext: 'Verification requise' };
  };

  const pjBadge = getPJBadge();
  const creationAnalysis = business.date_creation ? analyzeLeadFreshness(business.date_creation) : null;
  const highlightedCity =
    business.city ||
    business.address.match(/\b\d{5}\s+([\p{L}' -]+)$/u)?.[1]?.trim() ||
    'Ville non renseignee';
  const highlightedCreationDate = business.date_creation ?
    new Date(business.date_creation).toLocaleDateString('fr-FR')
    : 'Date non renseignee';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            // Try to go back, fallback to dashboard
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.replace('/home');
            }
          }} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fiche établissement</Text>
        
        {/* Salesforce Buttons in Header */}
        <View style={styles.headerButtonsRow}>
          {/* Search in Salesforce */}
          <TouchableOpacity 
            style={styles.sfSearchButton}
            onPress={() => {
              const searchTerm = encodeURIComponent(business.name || '');
              const sfUrl = `https://solocal.lightning.force.com/lightning/o/Global/homequeryScope=EverythingSearch&str=${searchTerm}`;
              openExternalLink(sfUrl);
            }}
          >
            <Ionicons name="search" size={18} color="#0176D3" />
          </TouchableOpacity>
          
          {/* Open EPJ Modal - Old behavior restored */}
          <TouchableOpacity 
            style={styles.epgButton}
            onPress={() => setShowEPGModal(true)}
            data-testid="creation-epj-btn"
          >
            <Ionicons name="document-text" size={18} color="#FFF" />
            <Text style={styles.epgButtonText}>Création EPJ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <BusinessHeroCard
          business={business}
          getScoreColor={getScoreColor}
          contactModeMeta={contactModeMeta}
          phoneReliabilityMeta={phoneReliabilityMeta}
          highlightedCreationDate={highlightedCreationDate}
          creationAnalysis={creationAnalysis}
          highlightedCity={highlightedCity}
        />

        {false && (
        <>
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

          {(business.solocal_priority_label || business.solocal_priority_reason || contactModeMeta) && (
            <View style={styles.solocalPriorityCard}>
              <View style={styles.solocalPriorityHeader}>
                <View style={styles.solocalPriorityScoreBubble}>
                  <Text style={styles.solocalPriorityScoreText}>{business.solocal_priority_score || 0}</Text>
                </View>
                <View style={styles.solocalPriorityHeaderText}>
                  <Text style={styles.solocalPriorityTitle}>
                    {business.solocal_priority_label || 'Priorité Solocal'}
                  </Text>
                  {!!business.solocal_priority_reason && (
                    <Text style={styles.solocalPriorityReason}>{business.solocal_priority_reason}</Text>
                  )}
                  {!!business.digital_visibility_label && (
                    <View style={styles.digitalVisibilityBadge}>
                      <Ionicons name="globe-outline" size={12} color="#1D4ED8" />
                      <Text style={styles.digitalVisibilityBadgeText}>
                        {business.digital_visibility_label}
                      </Text>
                    </View>
                  )}
                  {!!business.legal_presence_label && (
                    <View style={styles.legalPresenceBadge}>
                      <Ionicons name="shield-checkmark-outline" size={12} color="#065F46" />
                      <Text style={styles.legalPresenceBadgeText}>
                        {business.legal_presence_label}
                      </Text>
                    </View>
                  )}
                  {!!business.digital_visibility_summary && (
                    <Text style={styles.digitalVisibilitySummary}>{business.digital_visibility_summary}</Text>
                  )}
                  {!!business.sales_pitch_hint && (
                    <Text style={styles.digitalVisibilityPitch}>{business.sales_pitch_hint}</Text>
                  )}
                  {phoneReliabilityMeta && business.phone_reliability_label && (
                    <View style={[styles.phoneReliabilityBadge, { backgroundColor: phoneReliabilityMeta.bg }]}>
                      <Ionicons name={phoneReliabilityMeta.icon} size={12} color={phoneReliabilityMeta.color} />
                      <Text style={[styles.phoneReliabilityBadgeText, { color: phoneReliabilityMeta.color }]}>
                        {business.phone_reliability_label}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {contactModeMeta && (
                <View style={[styles.solocalContactModeBadge, { backgroundColor: contactModeMeta.bg }]}>
                  <Ionicons name={contactModeMeta.icon} size={14} color={contactModeMeta.color} />
                  <Text style={[styles.solocalContactModeBadgeText, { color: contactModeMeta.color }]}>
                    {contactModeMeta.label}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.digitalAuditButton, auditingVisibility && styles.digitalAuditButtonDisabled]}
                onPress={handleAuditDigitalVisibility}
                disabled={auditingVisibility}
              >
                {auditingVisibility ? (
                  <ActivityIndicator size="small" color="#1D4ED8" />
                ) : (
                  <Ionicons name="scan-outline" size={16} color="#1D4ED8" />
                )}
                <Text style={styles.digitalAuditButtonText}>
                  {auditingVisibility ? 'Audit en cours...' : 'Auditer Google + PagesJaunes + legal'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.heroHighlightsRow}>
            <View style={styles.heroHighlightCard}>
              <View style={styles.heroHighlightHeader}>
                <Ionicons name="calendar-outline" size={16} color="#4F46E5" />
                <Text style={styles.heroHighlightLabel}>Date de création</Text>
              </View>
              <Text style={styles.heroHighlightValue}>{highlightedCreationDate}</Text>
              {creationAnalysis && creationAnalysis.freshness !== 'unknown' && (
                <View style={[styles.heroHighlightBadge, { backgroundColor: creationAnalysis.bgColor }]}>
                  <Text style={[styles.heroHighlightBadgeText, { color: creationAnalysis.color }]}>
                    {creationAnalysis.label}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.heroHighlightCard}>
              <View style={styles.heroHighlightHeader}>
                <Ionicons name="location-outline" size={16} color="#EA580C" />
                <Text style={styles.heroHighlightLabel}>Ville</Text>
              </View>
              <Text style={styles.heroHighlightValue}>{highlightedCity}</Text>
              {business.postal_code && (
                <Text style={styles.heroHighlightMeta}>{business.postal_code}</Text>
              )}
            </View>
          </View>
        </View>
        </>
        )}

        {/* Shared History Section - Moved up for visibility */}
        {business.shared_history && (
          <View style={styles.sharedHistoryCard}>
            <Text style={styles.sectionTitle}>Historique partagé</Text>
            
            {/* Reference PL */}
            {business.pl_reference && (
              <View style={styles.plRefRow}>
                  <Text style={styles.plRefLabel}>Référence :</Text>
                <View style={styles.plRefBadge}>
                  <Text style={styles.plRefText}>{business.pl_reference}</Text>
                </View>
              </View>
            )}
            
            {/* Sources button */}
            <TouchableOpacity 
              style={styles.sourcesButton}
              onPress={() => setShowSourcesModal(true)}
            >
              <Ionicons name="information-circle-outline" size={18} color="#E67E22" />
              <Text style={styles.sourcesButtonText}>Voir les sources des donnees</Text>
              <Ionicons name="chevron-forward" size={16} color="#E67E22" />
            </TouchableOpacity>
            
            {/* Lead Quality Badges */}
            <View style={styles.qualityBadgesContainer}>
              {/* Phone Quality Badge */}
              {(() => {
                const phoneAnalysis = analyzePhoneQuality(
                  business.phone, 
                  business.phone_source,
                  business.phone_confidence
                );
                const alertMessage = `${phoneAnalysis.label}\n\n${phoneAnalysis.description}${
                  phoneAnalysis.source ? `

Source : ${phoneAnalysis.source}` : ""
                }${
                  phoneAnalysis.warning ? `

${phoneAnalysis.warning}` : ""
                }`;
                return (
                  <TouchableOpacity 
                    style={[styles.qualityBadge, { backgroundColor: phoneAnalysis.bgColor, borderColor: phoneAnalysis.color }]}
                    onPress={() => Alert.alert('Qualité du téléphone', alertMessage)}
                  >
                    <Ionicons name={phoneAnalysis.icon as any} size={14} color={phoneAnalysis.color} />
                    <Text style={[styles.qualityBadgeText, { color: phoneAnalysis.color }]}>
                      {phoneAnalysis.label}
                    </Text>
                    {phoneAnalysis.warning && (
                      <Ionicons name="warning" size={12} color="#D97706" style={{ marginLeft: 2 }} />
                    )}
                  </TouchableOpacity>
                );
              })()}
              
              {/* Freshness Badge */}
              {(() => {
                const freshnessAnalysis = analyzeLeadFreshness(business.date_creation);
                if (freshnessAnalysis.freshness === 'unknown') return null;
                return (
                  <TouchableOpacity 
                    style={[styles.qualityBadge, { backgroundColor: freshnessAnalysis.bgColor, borderColor: freshnessAnalysis.color }]}
                    onPress={() => alert(`${freshnessAnalysis.label}\n\n${freshnessAnalysis.description}`)}
                  >
                    <Ionicons name={freshnessAnalysis.icon as any} size={14} color={freshnessAnalysis.color} />
                    <Text style={[styles.qualityBadgeText, { color: freshnessAnalysis.color }]}>
                      {freshnessAnalysis.label}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
              
              {/* Website Badge */}
              {!!publicWebsiteUrl && (
                <View style={[styles.qualityBadge, { backgroundColor: '#D1FAE5', borderColor: '#059669' }]}>
                  <Ionicons name="globe" size={14} color="#059669" />
                  <Text style={[styles.qualityBadgeText, { color: '#059669' }]}>Site web</Text>
                </View>
              )}
              
              {/* Google Rating Badge */}
              {business.google_rating && business.google_rating >= 4 && (
                <View style={[styles.qualityBadge, { backgroundColor: '#FEF3C7', borderColor: '#D97706' }]}>
                  <Ionicons name="star" size={14} color="#D97706" />
                  <Text style={[styles.qualityBadgeText, { color: '#D97706' }]}>
                    {business.google_rating}*
                  </Text>
                </View>
              )}
              
              {/* Activity NAF Badge - Prominent display */}
              {(business.libelle_naf || business.activite_naf || business.activity) && (
                <TouchableOpacity 
                  style={[styles.qualityBadge, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED', maxWidth: 200 }]}
                  onPress={() => Alert.alert(
                    'Activité', 
                    `${business.libelle_naf || business.activity || 'Non définie'}\n\nCode NAF : ${business.activite_naf || business.naf_code || 'N/A'}`
                  )}
                >
                  <Ionicons name="briefcase" size={14} color="#7C3AED" />
                  <Text 
                    style={[styles.qualityBadgeText, { color: '#7C3AED' }]} 
                    numberOfLines={1}
                  >
                    {business.libelle_naf || business.activity || business.activite_naf || 'Activité'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
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
                  Détecté par {business.shared_history.detection_count} utilisateur(s) : {business.shared_history.detected_by_users.slice(0, 3).join(', ')}{business.shared_history.detected_by_users.length > 3 ? "..." : ""}
                </Text>
              </View>
            )}
            
            {/* View count */}
            <View style={styles.historyItem}>
              <Ionicons name="eye-outline" size={16} color="#34C759" />
              <Text style={styles.historyText}>
                {business.shared_history.total_views} consultation(s)
                {business.shared_history.last_viewed_by && ` - Derniere: ${business.shared_history.last_viewed_by}`}
              </Text>
            </View>
            
            {/* Shared statuses */}
            {(business.shared_history.is_contacted || business.shared_history.is_client || 
              business.shared_history.is_not_interested || business.shared_history.is_in_crm) && (
              <View style={styles.sharedStatusesRow}>
                {business.shared_history.is_contacted && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#34C759' }]}>
                    <Text style={styles.sharedStatusText}>Contacte ({business.shared_history.contacted_by})</Text>
                  </View>
                )}
                {business.shared_history.is_client && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#FF9800' }]}>
                    <Text style={styles.sharedStatusText}>Client ({business.shared_history.marked_client_by})</Text>
                  </View>
                )}
                {business.shared_history.is_not_interested && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#FF3B30' }]}>
                    <Text style={styles.sharedStatusText}>Non interesse ({business.shared_history.not_interested_by})</Text>
                  </View>
                )}
                {business.shared_history.is_in_crm && (
                  <View style={[styles.sharedStatusBadge, { backgroundColor: '#007AFF' }]}>
                    <Text style={styles.sharedStatusText}>Dans CRM ({business.shared_history.in_crm_by})</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Linked Businesses Section (same phone number) */}
        {linkedBusinesses.length > 0 && (
          <View style={styles.linkedBusinessesCard}>
            <View style={styles.linkedHeader}>
              <Ionicons name="link" size={20} color="#FF9500" />
              <Text style={styles.sectionTitle}>Fiches liées ({linkedBusinesses.length})</Text>
            </View>
            <Text style={styles.linkedSubtitle}>
              Mêmes coordonnées téléphoniques détectées dans d'autres scans
            </Text>
            
            {linkedBusinesses.map((linked, index) => (
              <TouchableOpacity
                key={linked.id}
                style={styles.linkedItem}
                onPress={() => router.push({
                  pathname: '/businessdetail',
                  params: { businessId: linked.id, scanId: linked.scan_id }
                })}
              >
                <View style={styles.linkedItemContent}>
                  <Text style={styles.linkedName}>{linked.name}</Text>
                  <Text style={styles.linkedMeta}>
                    {linked.scan_activity} - {linked.city}
                  </Text>
                  {linked.phone && (
                    <Text style={styles.linkedPhone}>{linked.phone}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Status Actions: Contacte + Client + Non interesse + CRM */}
        <BusinessRelatedCluesCard
          loadingRelatedClues={loadingRelatedClues}
          relatedClues={relatedClues}
          styles={styles}
          copiedField={copiedField}
          savingRelatedActionKey={savingRelatedActionKey}
          openExternalLink={openExternalLink}
          onOpenBusiness={(id, targetScanId) =>
            router.push({
              pathname: '/businessdetail',
              params: { businessId: id, scanId: targetScanId || scanId }
            })
          }
          getContactClueConfidenceMeta={getContactClueConfidenceMeta}
          copyToClipboard={copyToClipboard}
          createRelatedClueInteraction={createRelatedClueInteraction}
        />

        {false && ((loadingRelatedClues ||
          relatedClues.representatives.length ||
          relatedClues.commercial_names.length ||
          relatedClues.contact_clues.length ||
          relatedClues.quick_searches.length ||
          relatedClues.local_related_businesses.length) ? (
          <View style={styles.relatedCluesCard}>
            <View style={styles.relatedHeader}>
              <Ionicons name="git-network-outline" size={20} color="#2563EB" />
              <Text style={styles.sectionTitle}>Pistes liées</Text>
            </View>
            <Text style={styles.relatedSubtitle}>
              Utilise le dirigeant, le nom commercial et les fiches proches pour retrouver des coordonnées pro vérifiables.
            </Text>

            {loadingRelatedClues ? (
              <View style={styles.relatedLoading}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.relatedLoadingText}>Chargement des pistes liées...</Text>
              </View>
            ) : (
              <>
                {relatedClues.representatives.length ? (
                  <View style={styles.relatedSection}>
                    <Text style={styles.relatedSectionTitle}>Dirigeants détectés</Text>
                    {relatedClues.representatives.map((rep: any) => (
                      <View key={`${rep.name}-${rep.role}`} style={styles.relatedRow}>
                        <View style={styles.relatedRowText}>
                          <Text style={styles.relatedPrimary}>{rep.name}</Text>
                          <Text style={styles.relatedSecondary}>{rep.role}{rep.city ? ` - ${rep.city}` : ""}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.relatedAction}
                          onPress={() => openExternalLink(rep.search_url)}
                        >
                          <Ionicons name="search-outline" size={16} color="#2563EB" />
                          <Text style={styles.relatedActionText}>Chercher</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}

                {relatedClues.commercial_names.length ? (
                  <View style={styles.relatedSection}>
                    <Text style={styles.relatedSectionTitle}>Nom commercial</Text>
                    <View style={styles.relatedChipRow}>
                      {relatedClues.commercial_names.map((name: string) => (
                        <View key={name} style={styles.relatedChip}>
                          <Ionicons name="pricetag-outline" size={14} color="#1D4ED8" />
                          <Text style={styles.relatedChipText}>{name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {relatedClues.quick_searches.length ? (
                  <View style={styles.relatedSection}>
                    <Text style={styles.relatedSectionTitle}>Recherches rapides</Text>
                    {relatedClues.quick_searches.map((item: any) => (
                      <TouchableOpacity
                        key={`${item.label}-${item.query}`}
                        style={styles.relatedSearchBtn}
                        onPress={() => openExternalLink(item.url)}
                      >
                        <Ionicons name="open-outline" size={16} color="#2563EB" />
                        <View style={styles.relatedSearchText}>
                          <Text style={styles.relatedSearchLabel}>{item.label}</Text>
                          <Text style={styles.relatedSearchQuery} numberOfLines={1}>{item.query}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {relatedClues.contact_clues.length ? (
                  <View style={styles.relatedSection}>
                    <Text style={styles.relatedSectionTitle}>Coordonnées indirectes à vérifier</Text>
                    {relatedClues.contact_clues.map((item: any) => {
                      const confidenceMeta = getContactClueConfidenceMeta(item.confidence);
                      const copyKey = `piste-${item.type}-${item.business_id}`;
                      const interactionKey = `interaction-${item.type}-${item.business_id}`;
                      return (
                        <View
                          key={`${item.type}-${item.value}-${item.business_id}`}
                          style={styles.relatedContactItem}
                        >
                          <TouchableOpacity
                            style={styles.relatedContactMain}
                            onPress={() => openExternalLink(item.source_url)}
                          >
                            <View style={styles.relatedContactIcon}>
                              <Ionicons
                                name={
                                  item.type === 'phone'
                                    ? 'call-outline'
                                    : item.type === 'email'
                                      ? 'mail-outline'
                                      : 'globe-outline'
                                }
                                size={16}
                                color="#2563EB"
                              />
                            </View>
                            <View style={styles.relatedRowText}>
                              <Text style={styles.relatedPrimary}>{item.value}</Text>
                              <Text style={styles.relatedSecondary}>
                                {item.reason}
                                {item.pl_reference ? ` - ${item.pl_reference}` : ""}
                              </Text>
                              <View style={styles.relatedMetaRow}>
                                <View style={[styles.relatedConfidenceBadge, { backgroundColor: confidenceMeta.bg }]}>
                                  <Text style={[styles.relatedConfidenceText, { color: confidenceMeta.color }]}>
                                    {confidenceMeta.label}
                                  </Text>
                                </View>
                                <Text style={styles.relatedTertiary}>{item.source_label}</Text>
                              </View>
                            </View>
                            <Ionicons name="open-outline" size={18} color="#2563EB" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.relatedCopyBtn}
                            onPress={() => copyToClipboard(item.value, copyKey)}
                          >
                            <Ionicons
                              name={copiedField === copyKey ? 'checkmark-outline' : 'copy-outline'}
                              size={16}
                              color={copiedField === copyKey ? '#059669' : '#2563EB'}
                            />
                            <Text
                              style={[
                                styles.relatedCopyText,
                                copiedField === copyKey && styles.relatedCopyTextActive,
                              ]}
                            >
                              {copiedField === copyKey ? 'Copie' : 'Copier'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.relatedLogBtn}
                            onPress={() => createRelatedClueInteraction(item, interactionKey)}
                            disabled={savingRelatedActionKey === interactionKey}
                          >
                            <Ionicons
                              name={savingRelatedActionKey === interactionKey ? 'hourglass-outline' : 'document-text-outline'}
                              size={16}
                              color="#92400E"
                            />
                            <Text style={styles.relatedLogText}>
                              {savingRelatedActionKey === interactionKey ? 'En cours' : 'Noter CRM'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {relatedClues.local_related_businesses.length ? (
                  <View style={styles.relatedSection}>
                    <Text style={styles.relatedSectionTitle}>Fiches proches déjà dans la base</Text>
                    {relatedClues.local_related_businesses.map((item: any) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.relatedBusinessItem}
                        onPress={() => router.push({
                          pathname: '/businessdetail',
                          params: { businessId: item.id, scanId: item.scan_id }
                        })}
                      >
                        <View style={styles.relatedRowText}>
                          <Text style={styles.relatedPrimary}>
                            {item.name}{item.pl_reference ? ` - ${item.pl_reference}` : ""}
                          </Text>
                          <Text style={styles.relatedSecondary}>
                            {item.reason}{item.city ? ` - ${item.city}` : ""}
                          </Text>
                          <Text style={styles.relatedTertiary}>
                            {item.scan_query} - {item.scan_location}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null)}

        <View style={styles.statusActionsCard}>
          <Text style={styles.sectionTitle}>Statut prospection</Text>
          
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Contacte</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.contact_status_manual === 'contacted' && styles.statusToggleActive
                ]}
                onPress={handleToggleContacted}
              >
                <Ionicons 
                  name={business.contact_status_manual === "contacted" ? "call" : "call-outline"}
                  size={20} 
                  color={business.contact_status_manual === "contacted" ? "#FFF" : "#666"}
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
                  name={business.client_status === "client" ? "star" : "star-outline"} 
                  size={20} 
                  color={business.client_status === "client" ? "#FFF" : "#666"} 
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

          {/* New status row: Non interesse + Deja dans CRM */}
          <View style={[styles.statusRow, { marginTop: 16 }]}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Non interesse</Text>
              <TouchableOpacity
                style={[
                  styles.statusToggle,
                  business.interest_status === 'not_interested' && styles.statusToggleNotInterested
                ]}
                onPress={handleToggleNotInterested}
              >
                <Ionicons 
                  name={business.interest_status === "not_interested" ? "close-circle" : "close-circle-outline"} 
                  size={20} 
                  color={business.interest_status === "not_interested" ? "#FFF" : "#666"} 
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
                  name={business.crm_status === "in_crm" ? "cloud-done" : "cloud-outline"} 
                  size={20} 
                  color={business.crm_status === "in_crm" ? "#FFF" : "#666"} 
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

          {/* Inexploitable Button */}
          <View style={[styles.statusRow, { marginTop: 16 }]}>
            <TouchableOpacity
              style={[
                styles.inexploitableButton,
                business.is_inexploitable && styles.inexploitableButtonActive,
                markingInexploitable && styles.inexploitableButtonDisabled
              ]}
              onPress={handleMarkInexploitable}
              disabled={markingInexploitable}
            >
              {markingInexploitable ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons 
                    name={business.is_inexploitable ? "close-circle" : "ban-outline"} 
                    size={20} 
                    color={business.is_inexploitable ? "#FFF" : "#DC2626"} 
                  />
                  <Text style={[
                    styles.inexploitableButtonText,
                    business.is_inexploitable && styles.inexploitableButtonTextActive
                  ]}>
                    {business.is_inexploitable ?
                       `Inexploitable (${business.inexploitable_reason || "manuel"})` 
                      : "Marquer Inexploitable"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Show warning if company is closed/radiated from SIRET check */}
          {business.etat_administratif === 'F' && (
            <View style={styles.radiatedWarning}>
              <Ionicons name="warning" size={18} color="#DC2626" />
              <Text style={styles.radiatedWarningText}>
                Cette entreprise est radiee/fermee selon le registre SIRENE
              </Text>
            </View>
          )}
        </View>

        {/* Salesforce Integration Section */}
        <View style={styles.salesforceCard}>
          <View style={styles.salesforceHeader}>
            <View style={styles.salesforceTitleRow}>
              <View style={styles.salesforceIcon}>
                <Text style={styles.salesforceIconText}>SF</Text>
              </View>
              <Text style={styles.sectionTitle}>Salesforce</Text>
            </View>
            <Text style={styles.salesforceSubtitle}>Integration CRM SoLocal</Text>
          </View>
          
          <View style={styles.salesforceButtons}>
            {/* CREATE EPJ - Primary action */}
            <TouchableOpacity
              style={styles.salesforceCreateEpjBtn}
              onPress={() => {
                // Extract postal code from address if not available directly
                const postalCode = business.postal_code || 
                  (business.address.match(/\b\d{5}\b/)?.[0]) || 
                  '';
                
                // Build URL with query parameters (may or may not work depending on SF config)
                const params = new URLSearchParams({
                  raison_sociale: business.name || '',
                  code_postal: postalCode,
                  activite: business.libelle_naf || business.activity || '',
                  siret: business.siret || '',
                  voie: business.address || '',
                  telephone: business.phone || '',
                });
                
                const sfEpjUrl = `https://solocal.lightning.force.com/lightning/n/Creation_EPJ${params.toString()}`;
                openExternalLink(sfEpjUrl);
                
                // Also copy structured info to clipboard as backup
                const epjInfo = `=== CRÉATION EPJ ===

COLONNE GAUCHE:
- Raison sociale: ${business.name || 'N/A'}
- Code postal: ${postalCode || 'N/A'}
- Activité: ${business.libelle_naf || business.activity || 'N/A'}

COLONNE DROITE:
- SIRET: ${business.siret || 'N/A'}
- Voie: ${business.address || 'N/A'}
- Téléphone: ${business.phone || 'N/A'}`;
                
                copyTextSafely(epjInfo);
                Alert.alert(
                  'Prêt pour création EPJ !',
                  'Le formulaire Salesforce va s\'ouvrir.\n\nLes 6 champs ont été copiés dans le presse-papier au cas où le préremplissage ne fonctionne pas.',
                  [{ text: 'OK' }]
                );
              }}
            >
              <Ionicons name="add-circle" size={20} color="#FFF" />
              <View style={styles.salesforceCreateEpjBtnContent}>
                <Text style={styles.salesforceCreateEpjBtnText}>Créer EPJ dans Salesforce</Text>
                <Text style={styles.salesforceCreateEpjBtnSubtext}>6 champs pre-remplis</Text>
              </View>
            </TouchableOpacity>

            {/* Search in Salesforce by company name */}
            <TouchableOpacity
              style={styles.salesforceSearchBtn}
              onPress={() => {
                const searchTerm = encodeURIComponent(business.name || '');
                const sfUrl = `https://solocal.lightning.force.com/lightning/o/Global/homequeryScope=EverythingSearch&str=${searchTerm}`;
                openExternalLink(sfUrl);
              }}
            >
              <Ionicons name="search" size={18} color="#0176D3" />
              <Text style={styles.salesforceSearchBtnText}>Chercher "{business.name.substring(0, 15)}..." dans Salesforce</Text>
            </TouchableOpacity>
            
            {/* Search by phone number if available */}
            {business.phone && (
              <TouchableOpacity
                style={styles.salesforceSearchBtn}
                onPress={() => {
                  const phoneClean = business.phone.replace(/\s/g, '');
                  const sfUrl = `https://solocal.lightning.force.com/lightning/o/Global/homequeryScope=EverythingSearch&str=${encodeURIComponent(phoneClean)}`;
                  openExternalLink(sfUrl);
                }}
              >
                <Ionicons name="call" size={18} color="#0176D3" />
                <Text style={styles.salesforceSearchBtnText}>Chercher par téléphone ({business.phone})</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.salesforceNote}>
            Le bouton "Créer EPJ" copie automatiquement les 6 champs requis.
          </Text>
        </View>

        {/* Note Section */}
        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>Note</Text>
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
            <Text style={styles.sectionTitle}>Statut PagesJaunes</Text>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => setShowPJEditor(!showPJEditor)}
            >
              <Ionicons name={showPJEditor ? "close" : "pencil"} size={18} color="#6366F1" />
              <Text style={styles.editButtonText}>{showPJEditor ? "Annuler" : "Modifier"}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.pjBadgeContainer, { backgroundColor: pjBadge.bg }]}>
            <Text style={[styles.pjBadgeText, { color: pjBadge.color }]}>{pjBadge.text}</Text>
            <Text style={styles.pjBadgeSubtext}>{pjBadge.subtext}</Text>
          </View>

          {!business.has_pagesjaunes && (
            <View style={styles.prospectAlert}>
              <Text style={styles.prospectAlertText}>PROSPECT PRIORITAIRE</Text>
              <Text style={styles.prospectAlertSubtext}>
                Établissement présent sur Google mais absent de PagesJaunes
              </Text>
            </View>
          )}

          {business.has_pagesjaunes && business.pagesjaunes_url && (
            <TouchableOpacity 
              style={styles.pjLink}
              onPress={() => openExternalLink(business.pagesjaunes_url)}
            >
              <Ionicons name="open-outline" size={20} color="#6366F1" />
              <Text style={styles.pjLinkText}>Voir la fiche PagesJaunes</Text>
            </TouchableOpacity>
          )}

          {showPJEditor && (
            <View style={styles.pjEditor}>
              <Text style={styles.pjEditorTitle}>Correction manuelle</Text>
              
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Present sur PagesJaunes</Text>
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
        <BusinessContactCard
          business={business}
          styles={styles}
          copiedField={copiedField}
          shouldShowManualVisiteBadge={shouldShowManualVisiteBadge}
          markingDomiciliation={markingDomiciliation}
          openExternalLink={openExternalLink}
          copyToClipboard={copyToClipboard}
          onCallPhone={(phone) => Linking.openURL(`tel:${phone}`)}
          onMoveToVisite={handleMoveToVisite}
          onMarkDomiciliation={handleMarkDomiciliation}
        />

        {false && (<View style={styles.section}>
                <Text style={styles.sectionTitle}>[LOC] Coordonnées</Text>
          
          {/* Badge si deja en visite terrain */}
          {shouldShowManualVisiteBadge && (
            <View style={styles.visiteTerrainInfoBadge}>
              <Ionicons name="walk" size={20} color="#F59E0B" />
              <Text style={styles.visiteTerrainInfoText}>
                Fiche sans téléphone, classée automatiquement en visite terrain
              </Text>
            </View>
          )}
          
          {business.address && (
            <View style={styles.contactRow}>
              <Ionicons name="location-outline" size={24} color="#6366F1" />
              <View style={styles.contactContent}>
                <View style={styles.contactLabelRow}>
                  <Text style={styles.contactLabel}>Adresse</Text>
                  <SourceIndicator sourceInfo={business.data_sources.address} />
                </View>
                <TouchableOpacity 
                  onPress={() => {
                    const query = encodeURIComponent(business.address);
                    openExternalLink(`https://www.google.com/maps/search/api=1&query=${query}`);
                  }}
                >
                  <Text style={styles.contactValue}>{business.address}</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          )}

          {business.phone && (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={24} color="#34C759" />
              <View style={styles.contactContent}>
                <View style={styles.contactLabelRow}>
                  <Text style={styles.contactLabel}>Téléphone</Text>
                  {(business.phone_source || business.data_sources.phone) && (
                    <TouchableOpacity
                      activeOpacity={business.data_sources?.phone?.url ? 0.8 : 1}
                      onPress={() => {
                        if (business.data_sources.phone.url) {
                          openExternalLink(business.data_sources.phone.url);
                        }
                      }}
                      style={[
                      styles.phoneSourceBadge,
                      business.phone_confidence === 'basse' && { backgroundColor: '#FEF3C7', borderColor: '#D97706' }
                    ]}>
                      <Ionicons 
                        name={business.phone_confidence === "basse" ? "warning" : "information-circle"}
                        size={12} 
                        color={business.phone_confidence === "basse" ? "#D97706" : "#6B7280"}
                      />
                      <Text style={[
                        styles.phoneSourceText,
                        business.phone_confidence === 'basse' && { color: '#D97706' }
                      ]}>
                        {business.data_sources.phone.source_name || business.phone_source || business.data_sources.phone.source || 'Source inconnue'}
                      </Text>
                      {business.data_sources.phone.url && (
                        <Ionicons
                          name="open-outline"
                          size={12}
                        color={business.phone_confidence === "basse" ? "#D97706" : "#6B7280"}
                        />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.contactValue}>{business.phone}</Text>
                {business.data_sources.phone.url && (
                  <TouchableOpacity onPress={() => openExternalLink(business.data_sources.phone.url)}>
                    <Text style={styles.phoneSourceLink}>Voir la source du numéro</Text>
                  </TouchableOpacity>
                )}
                {!!business.phone_reliability_reason && (
                  <Text style={styles.phoneReliabilityReason}>{business.phone_reliability_reason}</Text>
                )}
                {(business.phone_confidence === 'basse' || business.phone_requires_review) && (
                  <Text style={styles.phoneWarningText}>
                    [WARN] Donnees legales - peut etre obsolete
                  </Text>
                )}
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
                    name={copiedField === "phone_direct" ? "checkmark" : "copy-outline"}
                    size={18} 
                    color={copiedField === "phone_direct" ? "#FFF" : "#6366F1"}
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
          
          {/* Bouton Numero injoignable */}
          {business.phone && (business.lead_type !== 'visite_terrain') && (
            <TouchableOpacity 
              style={styles.moveToVisiteBtn}
              onPress={handleMoveToVisite}
              data-testid="move-to-visite-btn"
            >
              <Ionicons name="walk-outline" size={18} color="#F59E0B" />
              <Text style={styles.moveToVisiteBtnText}>Numéro injoignable → Visite terrain</Text>
            </TouchableOpacity>
          )}
          
          {/* Badge si deja en visite terrain */}
          {(business.phone_unreachable || shouldShowManualVisiteBadge) && (
            <View style={styles.visiteTerrainBadge}>
              <Ionicons name="walk" size={16} color="#F59E0B" />
              <Text style={styles.visiteTerrainText}>
                {business.phone_unreachable ?
                   "Classée en visite terrain (numéro injoignable)"
                  : business.phone ?
                     "Visite terrain maintenue (coordonnées à vérifier)"
                    : "Fiche classee en visite terrain"}
              </Text>
            </View>
          )}
          {copiedField === 'phone_direct' && (
            <View style={styles.copiedFeedback}>
              <Text style={styles.copiedFeedbackText}>OK numéro copié !</Text>
            </View>
          )}

          {business.siret && (
            <View style={styles.contactRow}>
              <Ionicons name="document-text-outline" size={24} color="#666" />
              <View style={styles.contactContent}>
                <View style={styles.contactLabelRow}>
                  <Text style={styles.contactLabel}>SIRET</Text>
                  {business.data_sources.siret && (
                    <SourceIndicator 
                      fieldName="SIRET"
                      sourceInfo={business.data_sources.siret}
                    />
                  )}
                </View>
                <Text style={styles.contactValue}>{business.siret}</Text>
              </View>
            </View>
          )}
          
          {business.email && (
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={24} color="#E91E63" />
              <View style={styles.contactContent}>
                <View style={styles.contactLabelRow}>
                  <Text style={styles.contactLabel}>Email</Text>
                  <SourceIndicator 
                    fieldName="Email"
                    sourceInfo={business.data_sources.email}
                  />
                </View>
                <Text style={styles.contactValue}>{business.email}</Text>
              </View>
              <TouchableOpacity 
                style={styles.phoneCopyBtn}
                onPress={() => copyToClipboard(business.email, 'email')}
              >
                <Ionicons 
                    name={copiedField === "email" ? "checkmark" : "copy-outline"}
                  size={18} 
                    color={copiedField === "email" ? "#FFF" : "#6366F1"}
                />
              </TouchableOpacity>
            </View>
          )}
          
          {business.date_creation && (
            <View style={styles.contactRow}>
              <Ionicons name="calendar-outline" size={24} color="#FF9800" />
              <View style={styles.contactContent}>
                <View style={styles.contactLabelRow}>
                  <Text style={styles.contactLabel}>Date de création</Text>
                  <SourceIndicator 
                    fieldName="Date de création"
                    sourceInfo={business.data_sources.date_creation}
                  />
                </View>
                <Text style={styles.contactValue}>{business.date_creation}</Text>
              </View>
            </View>
          )}
        </View>)}

        {/* Online Presence */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Presence en ligne</Text>
          </View>

          {publicWebsiteUrl ? (
            <ExternalLinkCard url={publicWebsiteUrl} style={styles.linkCard}>
              <View style={styles.linkCardInner}>
                <View style={[styles.linkIcon, styles.linkIconWeb]}>
                  <Ionicons name="globe" size={24} color="#FFF" />
                </View>
                <View style={styles.linkContent}>
                  <View style={styles.linkTitleRow}>
                    <Text style={styles.linkTitle}>Site Web</Text>
                    <SourceIndicator 
                      fieldName="Site Web"
                      sourceInfo={business.data_sources.website_url}
                    />
                  </View>
                  <Text style={styles.linkSubtitle} numberOfLines={1}>{publicWebsiteUrl}</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </View>
            </ExternalLinkCard>
          ) : pappersProfileUrl ? (
            <ExternalLinkCard url={pappersProfileUrl} style={styles.linkCard}>
              <View style={styles.linkCardInner}>
                <View style={[styles.linkIcon, styles.linkIconDisabled]}>
                  <Ionicons name="document-text" size={24} color="#999" />
                </View>
                <View style={styles.linkContent}>
                  <View style={styles.linkTitleRow}>
                    <Text style={styles.linkTitle}>Fiche Pappers</Text>
                    <SourceIndicator 
                      fieldName="Fiche Pappers"
                      sourceInfo={business.data_sources.website_url}
                    />
                  </View>
                  <Text style={styles.linkSubtitle} numberOfLines={1}>{pappersProfileUrl}</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </View>
            </ExternalLinkCard>
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
            <ExternalLinkCard 
              url={`https://www.google.com/maps/search/api=1&query=${encodeURIComponent(business.name || '')}&query_place_id=${business.google_place_id}`}
              style={styles.linkCard}
            >
              <View style={styles.linkCardInner}>
                <View style={[styles.linkIcon, styles.linkIconGoogle]}>
                  <Ionicons name="logo-google" size={24} color="#FFF" />
                </View>
                <View style={styles.linkContent}>
                  <View style={styles.linkTitleRow}>
                    <Text style={styles.linkTitle}>Fiche Google</Text>
                    <SourceIndicator 
                      fieldName="Note Google"
                      sourceInfo={business.data_sources.google_rating}
                    />
                  </View>
                  <Text style={styles.linkSubtitle}>
                    {business.google_rating ? `${business.google_rating} / 5` : "Sans note"}
                    {business.google_reviews_count > 0 && ` - ${business.google_reviews_count} avis`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </View>
            </ExternalLinkCard>
          )}
        </View>

        {/* Enrichment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enrichissement</Text>
          
          {/* Alert for procedure collective */}
          {business.has_procedure_collective && (
            <View style={styles.alertBanner}>
              <Ionicons name="warning" size={24} color="#DC2626" />
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>Attention : Procédure collective détectée</Text>
                <Text style={styles.alertSubtitle}>Cette entreprise fait l'objet d'une procedure (liquidation, redressement...)</Text>
              </View>
            </View>
          )}
          
          {/* Enrichment button */}
          <TouchableOpacity
            style={[styles.enrichButton, enrichingFull && styles.enrichButtonDisabled]}
            onPress={handleEnrichFull}
            disabled={enrichingFull}
          >
            {enrichingFull ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#FFF" />
                <Text style={styles.enrichButtonText}>Enrichir (Web, BODACC, Email)</Text>
              </>
            )}
          </TouchableOpacity>
          
          {/* Display enrichment sources if available */}
          {business.enrichment_sources && business.enrichment_sources.length > 0 && (
            <View style={styles.enrichmentInfo}>
              <Text style={styles.enrichmentLabel}>
                Sources utilisees: {business.enrichment_sources.join(', ')}
              </Text>
            </View>
          )}
          
          {/* Additional emails if found */}
          {business.emails_all && business.emails_all.length > 1 && (
            <View style={styles.additionalEmails}>
              <Text style={styles.additionalLabel}>Emails trouvés :</Text>
              {business.emails_all.map((email: string, idx: number) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.additionalItem}
                  onPress={() => copyToClipboard(email, `email_${idx}`)}
                >
                  <Text style={styles.additionalValue}>{email}</Text>
                  <Ionicons 
                    name={copiedField === `email_${idx}` ? "checkmark" : "copy-outline"}
                    size={16} 
                    color={copiedField === `email_${idx}` ? "#34C759" : "#6366F1"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Social links */}
          {business.social_links && Object.keys(business.social_links).length > 0 && (
            <View style={styles.socialLinks}>
                <Text style={styles.additionalLabel}>Réseaux sociaux :</Text>
              {business.social_links.facebook && (
                <TouchableOpacity 
                  style={styles.socialLink}
                  onPress={() => openExternalLink(business.social_links.facebook)}
                >
                  <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                  <Text style={styles.socialLinkText}>Facebook</Text>
                </TouchableOpacity>
              )}
              {business.social_links.linkedin && (
                <TouchableOpacity 
                  style={styles.socialLink}
                  onPress={() => openExternalLink(business.social_links.linkedin)}
                >
                  <Ionicons name="logo-linkedin" size={20} color="#0A66C2" />
                  <Text style={styles.socialLinkText}>LinkedIn</Text>
                </TouchableOpacity>
              )}
              {business.social_links.instagram && (
                <TouchableOpacity 
                  style={styles.socialLink}
                  onPress={() => openExternalLink(business.social_links.instagram)}
                >
                  <Ionicons name="logo-instagram" size={20} color="#E4405F" />
                  <Text style={styles.socialLinkText}>Instagram</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <BusinessEpgModal
        visible={showEPGModal}
        business={business}
        styles={styles}
        copiedField={copiedField}
        enrichingSiret={enrichingSiret}
        onClose={() => setShowEPGModal(false)}
        onCopy={copyToClipboard}
        onCopyAll={copyAllEPGInfo}
        onEnrichSiret={handleEnrichSiret}
        openExternalLink={openExternalLink}
      />

      <BusinessSourcesModal
        visible={showSourcesModal}
        business={business}
        styles={styles}
        onClose={() => setShowSourcesModal(false)}
        openExternalLink={openExternalLink}
      />
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
  solocalPriorityCard: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  solocalPriorityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  solocalPriorityScoreBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solocalPriorityScoreText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4338CA',
  },
  solocalPriorityHeaderText: {
    flex: 1,
  },
  solocalPriorityTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  solocalPriorityReason: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
  },
  digitalVisibilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  digitalVisibilityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  legalPresenceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  legalPresenceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  digitalVisibilitySummary: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },
  digitalVisibilityPitch: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  solocalContactModeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  solocalContactModeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  digitalAuditButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  digitalAuditButtonDisabled: {
    opacity: 0.7,
  },
  digitalAuditButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  heroHighlightsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  heroHighlightCard: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 220,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
  },
  heroHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  heroHighlightLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroHighlightValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  heroHighlightMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  heroHighlightBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroHighlightBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
  inexploitableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: '#FFF',
  },
  inexploitableButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  inexploitableButtonDisabled: {
    opacity: 0.6,
  },
  inexploitableButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  inexploitableButtonTextActive: {
    color: '#FFF',
  },
  radiatedWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  radiatedWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
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
  addressBlock: {
    gap: 8,
    marginBottom: 4,
  },
  contactContent: {
    flex: 1,
    marginLeft: 12,
  },
  contactLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sourceIcon: {
    marginLeft: 6,
    padding: 2,
  },
  sourceInfoBtn: {
    padding: 8,
    marginRight: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 20,
    flexShrink: 0,
  },
  contactLabel: {
    fontSize: 12,
    color: '#999',
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  domiciliationInlineButton: {
    marginLeft: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  domiciliationInlineButtonDisabled: {
    opacity: 0.7,
  },
  domiciliationInlineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  domiciliationInlineBadge: {
    marginLeft: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  domiciliationInlineBadgeText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
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
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    marginTop: 12,
  },
  linkCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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
  linkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  // EPG Button styles
  epgButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B00',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  epgButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sfSearchButton: {
    backgroundColor: '#E5F1FB',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0176D3',
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
  epgSalesforceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E5F1FB',
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#0176D3',
  },
  epgSalesforceBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#0176D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epgSalesforceBtnIconText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  epgSalesforceBtnText: {
    flex: 1,
    fontSize: 14,
    color: '#0176D3',
    fontWeight: '600',
  },
  epgSalesforceNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
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
  sourcesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  sourcesButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E67E22',
  },
  // Quality badges styles
  qualityBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    borderWidth: 1,
  },
  qualityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  // Linked businesses styles
  linkedBusinessesCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 2,
    borderColor: '#FF950020',
  },
  linkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  linkedSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
    paddingLeft: 28,
  },
  relatedCluesCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  relatedSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    paddingLeft: 28,
    lineHeight: 18,
  },
  relatedLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  relatedLoadingText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  relatedSection: {
    marginTop: 8,
    gap: 8,
  },
  relatedSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  relatedSectionHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 6,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  relatedRowText: {
    flex: 1,
    gap: 2,
  },
  relatedPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  relatedSecondary: {
    fontSize: 12,
    color: '#475569',
  },
  relatedTertiary: {
    fontSize: 11,
    color: '#94A3B8',
  },
  relatedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  relatedActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  relatedChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  relatedChipText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  relatedSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  relatedSearchText: {
    flex: 1,
    gap: 2,
  },
  relatedSearchLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  relatedSearchQuery: {
    fontSize: 12,
    color: '#475569',
  },
  relatedBusinessItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  relatedContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  relatedContactMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  relatedContactIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  relatedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  relatedConfidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  relatedConfidenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  relatedCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  relatedLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  relatedCopyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  relatedCopyTextActive: {
    color: '#059669',
  },
  relatedLogText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  linkedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9F0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FF950030',
  },
  linkedItemContent: {
    flex: 1,
  },
  linkedName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  linkedMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  linkedPhone: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '500',
  },
  // SIRET enrichment styles
  siretSearchBtn: {
    backgroundColor: '#6366F1',
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
    minHeight: 36,
  },
  siretWarningBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  siretWarningText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  epgFieldSubLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  // Enrichment section styles
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#991B1B',
  },
  enrichButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  enrichButtonDisabled: {
    opacity: 0.6,
  },
  enrichButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  enrichmentInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  enrichmentLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  additionalEmails: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  additionalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  additionalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E7FF',
  },
  additionalValue: {
    fontSize: 13,
    color: '#1F2937',
  },
  socialLinks: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  socialLinkText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  // Sources section styles
  sourcesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  sourcesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  sourcesSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  sourcesList: {
    gap: 8,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  sourceIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceInfo: {
    flex: 1,
  },
  sourceField: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  sourceProvider: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Sources Modal styles
  sourcesModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  sourcesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourcesModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  sourcesModalSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  sourcesModalList: {
    maxHeight: 400,
  },
  sourcesModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
  },
  sourcesModalIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourcesModalItemInfo: {
    flex: 1,
  },
  sourcesModalFieldName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  sourcesModalSourceName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  sourcesModalEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  sourcesModalEmptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  sourcesModalCloseBtn: {
    backgroundColor: '#F3F4F6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  sourcesModalCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  // Phone source badge
  phoneSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  phoneSourceText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  phoneReliabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  phoneReliabilityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  phoneSourceLink: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
    marginTop: 4,
  },
  phoneReliabilityReason: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
    marginTop: 4,
  },
  phoneWarningText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '500',
    marginTop: 4,
  },
  // Move to visite terrain button
  moveToVisiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
  },
  moveToVisiteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  // Visite terrain badge
  visiteTerrainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
  },
  visiteTerrainText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  // Quick action button - tres visible
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 2,
  },
  visiteTerrainInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  visiteTerrainInfoText: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '600',
  },
  // Salesforce Integration Styles
  salesforceCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5F1FB',
  },
  salesforceHeader: {
    marginBottom: 16,
  },
  salesforceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  salesforceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0176D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  salesforceIconText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  salesforceSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginLeft: 42,
  },
  salesforceButtons: {
    gap: 10,
  },
  salesforceSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E5F1FB',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0176D3',
  },
  salesforceSearchBtnText: {
    fontSize: 14,
    color: '#0176D3',
    fontWeight: '600',
    flex: 1,
  },
  salesforceCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0176D3',
    padding: 14,
    borderRadius: 10,
  },
  salesforceCreateBtnText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
  },
  salesforceCreateEpjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FF6B00',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  salesforceCreateEpjBtnContent: {
    flex: 1,
  },
  salesforceCreateEpjBtnText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '700',
  },
  salesforceCreateEpjBtnSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  salesforceNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
