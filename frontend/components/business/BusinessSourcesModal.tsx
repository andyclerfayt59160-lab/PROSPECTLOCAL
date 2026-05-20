import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const getSourceColor = (source?: string) => (
  source === 'google' ? '#4285F4' :
  source === 'pappers' ? '#E67E22' :
  source === 'web' ? '#27AE60' :
  source === 'enrichment' ? '#F39C12' :
  '#8E44AD'
);

const getSourceIcon = (source?: string) => (
  source === 'google' ? 'logo-google' :
  source === 'pappers' ? 'document-text' :
  source === 'web' ? 'globe' :
  source === 'enrichment' ? 'sparkles' :
  'business'
);

const getFieldLabel = (field: string, sourceName?: string) => (
  field === 'name' ? "Nom de l'entreprise" :
  field === 'address' ? 'Adresse' :
      field === 'phone' ? 'Téléphone' :
  field === 'email' ? 'Email' :
  field === 'siret' ? 'SIRET' :
  field === 'siren' ? 'SIREN' :
      field === 'date_creation' ? 'Date de création' :
  field === 'website_url' ? (sourceName === 'Pappers.fr' ? 'Fiche Pappers' : 'Site web') :
  field === 'google_rating' ? 'Note Google' :
  field === 'city' ? 'Ville' :
  field === 'postal_code' ? 'Code postal' :
  field
);

type BusinessSourcesModalProps = {
  visible: boolean;
  business: any;
  styles: any;
  onClose: () => void;
  openExternalLink: (url: string) => void;
};

export default function BusinessSourcesModal({
  visible,
  business,
  styles,
  onClose,
  openExternalLink,
}: BusinessSourcesModalProps) {
  const dataSources = business?.data_sources || {};
  const sourceEntries = Object.entries(dataSources) as [string, any][];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.sourcesModalContent}>
          <View style={styles.sourcesModalHeader}>
            <Text style={styles.sourcesModalTitle}>Sources des donnees</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sourcesModalSubtitle}>
            Cliquez sur un élément pour vérifier la source
          </Text>

          <ScrollView style={styles.sourcesModalList}>
            {sourceEntries.map(([field, sourceInfo]) => (
              <TouchableOpacity
                key={field}
                style={styles.sourcesModalItem}
                onPress={() => {
                  if (sourceInfo?.url) {
                    openExternalLink(sourceInfo.url);
                  }
                }}
              >
                <View
                  style={[
                    styles.sourcesModalIcon,
                    { backgroundColor: getSourceColor(sourceInfo?.source) },
                  ]}
                >
                  <Ionicons
                    name={getSourceIcon(sourceInfo?.source) as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color="#FFF"
                  />
                </View>
                <View style={styles.sourcesModalItemInfo}>
                  <Text style={styles.sourcesModalFieldName}>
                    {getFieldLabel(field, sourceInfo?.source_name)}
                  </Text>
                  <Text style={styles.sourcesModalSourceName}>
                    {sourceInfo?.source_name || 'Source inconnue'}
                  </Text>
                </View>
                {sourceInfo?.url && (
                  <Ionicons name="open-outline" size={18} color="#6366F1" />
                )}
              </TouchableOpacity>
            ))}

            {sourceEntries.length === 0 && (
              <View style={styles.sourcesModalEmpty}>
                <Ionicons name="information-circle-outline" size={48} color="#CCC" />
                <Text style={styles.sourcesModalEmptyText}>Aucune source disponible</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.sourcesModalCloseBtn} onPress={onClose}>
            <Text style={styles.sourcesModalCloseBtnText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
