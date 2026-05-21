import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SourceIndicator from '../SourceIndicator';

type Props = {
  business: any;
  styles: any;
  copiedField: string | null;
  shouldShowManualVisiteBadge: boolean;
  markingDomiciliation: boolean;
  openExternalLink: (url: string) => void;
  copyToClipboard: (text: string, fieldName: string) => void;
  onCallPhone: (phone: string) => void;
  onMoveToVisite: () => void;
  onMarkDomiciliation: () => void;
};

export default function BusinessContactCard({
  business,
  styles,
  copiedField,
  shouldShowManualVisiteBadge,
  markingDomiciliation,
  openExternalLink,
  copyToClipboard,
  onCallPhone,
  onMoveToVisite,
  onMarkDomiciliation,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Coordonnées</Text>

      {shouldShowManualVisiteBadge && (
        <View style={styles.visiteTerrainInfoBadge}>
          <Ionicons name="walk" size={20} color="#F59E0B" />
          <Text style={styles.visiteTerrainInfoText}>
          Fiche sans téléphone, classée automatiquement en visite terrain
          </Text>
        </View>
      )}

      {business.address && (
        <View style={styles.addressBlock}>
          <View style={styles.contactRow}>
            <Ionicons name="location-outline" size={24} color="#6366F1" />
            <View style={styles.contactContent}>
              <View style={styles.contactLabelRow}>
                <Text style={styles.contactLabel}>Adresse</Text>
                <SourceIndicator sourceInfo={business.data_sources?.address} />
              </View>
              <TouchableOpacity
                onPress={() => {
                  const query = encodeURIComponent(business.address);
                  openExternalLink(`https://www.google.com/maps/search/?api=1&query=${query}`);
                }}
              >
                <Text style={styles.contactValue}>{business.address}</Text>
              </TouchableOpacity>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </View>

          {business.domiciliation_address ? (
            <View style={styles.domiciliationInlineBadge}>
              <Ionicons name="business-outline" size={16} color="#B45309" />
              <Text style={styles.domiciliationInlineBadgeText}>
                Adresse taguée comme domiciliation : exclue des visites terrain futures
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.domiciliationInlineButton, markingDomiciliation && styles.domiciliationInlineButtonDisabled]}
              onPress={onMarkDomiciliation}
              disabled={markingDomiciliation}
            >
              {markingDomiciliation ? (
                <ActivityIndicator size="small" color="#B45309" />
              ) : (
                <>
                  <Ionicons name="business-outline" size={16} color="#B45309" />
                  <Text style={styles.domiciliationInlineButtonText}>
                    Taguer cette adresse en domiciliation
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {business.phone && (
        <View style={styles.contactRow}>
          <Ionicons name="call-outline" size={24} color="#34C759" />
          <View style={styles.contactContent}>
            <View style={styles.contactLabelRow}>
                <Text style={styles.contactLabel}>Téléphone</Text>
              {(business.phone_source || business.data_sources?.phone) && (
                <TouchableOpacity
                  activeOpacity={business.data_sources?.phone?.url ? 0.8 : 1}
                  onPress={() => {
                    if (business.data_sources?.phone?.url) {
                      openExternalLink(business.data_sources.phone.url);
                    }
                  }}
                  style={[
                    styles.phoneSourceBadge,
                    business.phone_confidence === 'basse' && {
                      backgroundColor: '#FEF3C7',
                      borderColor: '#D97706',
                    },
                  ]}
                >
                  <Ionicons
                    name={business.phone_confidence === 'basse' ? 'warning' : 'information-circle'}
                    size={12}
                    color={business.phone_confidence === 'basse' ? '#D97706' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.phoneSourceText,
                      business.phone_confidence === 'basse' && { color: '#D97706' },
                    ]}
                  >
                    {business.data_sources?.phone?.source_name ||
                      business.phone_source ||
                      business.data_sources?.phone?.source ||
                      'Source inconnue'}
                  </Text>
                  {business.data_sources?.phone?.url && (
                    <Ionicons
                      name="open-outline"
                      size={12}
                      color={business.phone_confidence === 'basse' ? '#D97706' : '#6B7280'}
                    />
                  )}
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.contactValue}>{business.phone}</Text>
            {business.data_sources?.phone?.url && (
              <TouchableOpacity onPress={() => openExternalLink(business.data_sources.phone.url)}>
                <Text style={styles.phoneSourceLink}>Voir la source du numéro</Text>
              </TouchableOpacity>
            )}
            {!!business.phone_reliability_reason && (
              <Text style={styles.phoneReliabilityReason}>{business.phone_reliability_reason}</Text>
            )}
            {(business.phone_confidence === 'basse' || business.phone_requires_review) && (
              <Text style={styles.phoneWarningText}>Données légales - peut être obsolète</Text>
            )}
          </View>
          <View style={styles.phoneActions}>
            <TouchableOpacity
              style={[
                styles.phoneCopyBtn,
                copiedField === 'phone_direct' && styles.phoneCopyBtnSuccess,
              ]}
              onPress={() => copyToClipboard(business.phone, 'phone_direct')}
            >
              <Ionicons
                name={copiedField === 'phone_direct' ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copiedField === 'phone_direct' ? '#FFF' : '#6366F1'}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.phoneCallBtn} onPress={() => onCallPhone(business.phone)}>
              <Ionicons name="call" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {business.phone && business.lead_type !== 'visite_terrain' && !business.domiciliation_address && (
        <TouchableOpacity
          style={styles.moveToVisiteBtn}
          onPress={onMoveToVisite}
          data-testid="move-to-visite-btn"
        >
          <Ionicons name="walk-outline" size={18} color="#F59E0B" />
          <Text style={styles.moveToVisiteBtnText}>Numéro injoignable → Visite terrain</Text>
        </TouchableOpacity>
      )}

      {(business.phone_unreachable || shouldShowManualVisiteBadge) && (
        <View style={styles.visiteTerrainBadge}>
          <Ionicons name="walk" size={16} color="#F59E0B" />
          <Text style={styles.visiteTerrainText}>
            {business.phone_unreachable
              ? 'Classée en visite terrain (numéro injoignable)'
              : business.phone
                    ? 'Visite terrain maintenue (coordonnées à vérifier)'
                : 'Fiche classée en visite terrain'}
          </Text>
        </View>
      )}

      {copiedField === 'phone_direct' && (
        <View style={styles.copiedFeedback}>
          <Text style={styles.copiedFeedbackText}>Numéro copié</Text>
        </View>
      )}

      {business.siret && (
        <View style={styles.contactRow}>
          <Ionicons name="document-text-outline" size={24} color="#666" />
          <View style={styles.contactContent}>
            <View style={styles.contactLabelRow}>
              <Text style={styles.contactLabel}>SIRET</Text>
              {business.data_sources?.siret && (
                <SourceIndicator fieldName="SIRET" sourceInfo={business.data_sources.siret} />
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
              <SourceIndicator fieldName="Email" sourceInfo={business.data_sources?.email} />
            </View>
            <Text style={styles.contactValue}>{business.email}</Text>
          </View>
          <TouchableOpacity
            style={styles.phoneCopyBtn}
            onPress={() => copyToClipboard(business.email, 'email')}
          >
            <Ionicons
              name={copiedField === 'email' ? 'checkmark' : 'copy-outline'}
              size={18}
              color={copiedField === 'email' ? '#FFF' : '#6366F1'}
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
                sourceInfo={business.data_sources?.date_creation}
              />
            </View>
            <Text style={styles.contactValue}>{business.date_creation}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
