import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  loadingRelatedClues: boolean;
  relatedClues: any;
  styles: any;
  copiedField: string | null;
  savingRelatedActionKey: string | null;
  openExternalLink: (url: string) => void;
  onOpenBusiness: (businessId: string, scanId?: string | null) => void;
  getContactClueConfidenceMeta: (value?: string | null) => { label: string; color: string; bg: string };
  copyToClipboard: (text: string, fieldName: string) => void;
  createRelatedClueInteraction: (item: any, interactionKey: string) => void;
};

export default function BusinessRelatedCluesCard({
  loadingRelatedClues,
  relatedClues,
  styles,
  copiedField,
  savingRelatedActionKey,
  openExternalLink,
  onOpenBusiness,
  getContactClueConfidenceMeta,
  copyToClipboard,
  createRelatedClueInteraction,
}: Props) {
  const hasContent =
    loadingRelatedClues ||
    relatedClues?.representatives?.length ||
    relatedClues?.commercial_names?.length ||
    relatedClues?.contact_clues?.length ||
    relatedClues?.quick_searches?.length ||
    relatedClues?.local_related_businesses?.length;

  if (!hasContent) {
    return null;
  }

  return (
    <View style={styles.relatedCluesCard}>
      <View style={styles.relatedHeader}>
        <Ionicons name="git-network-outline" size={20} color="#2563EB" />
        <Text style={styles.sectionTitle}>Pistes liees</Text>
      </View>
      <Text style={styles.relatedSubtitle}>
        Utilise le dirigeant, le nom commercial et les fiches proches pour retrouver des coordonnées pro vérifiables.
      </Text>

      {loadingRelatedClues ? (
        <View style={styles.relatedLoading}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.relatedLoadingText}>Chargement des pistes liees...</Text>
        </View>
      ) : (
        <>
          {relatedClues?.representatives?.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedSectionTitle}>Dirigeants détectés</Text>
              {relatedClues.representatives.map((rep: any) => (
                <View key={`${rep.name}-${rep.role}`} style={styles.relatedRow}>
                  <View style={styles.relatedRowText}>
                    <Text style={styles.relatedPrimary}>{rep.name}</Text>
                    <Text style={styles.relatedSecondary}>
                      {rep.role}
                      {rep.city ? ` - ${rep.city}` : ''}
                    </Text>
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

          {relatedClues?.commercial_names?.length ? (
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

          {relatedClues?.quick_searches?.length ? (
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
                    <Text style={styles.relatedSearchQuery} numberOfLines={1}>
                      {item.query}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {relatedClues?.executive_company_searches?.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedSectionTitle}>Explorer d'autres sociétés</Text>
              <Text style={styles.relatedSectionHint}>
                Ces recherches aident à retrouver d'éventuels autres mandats ou sociétés liées au dirigeant.
              </Text>
              {relatedClues.executive_company_searches.map((item: any) => (
                <TouchableOpacity
                  key={`${item.label}-${item.representative_name}-${item.query}`}
                  style={styles.relatedSearchBtn}
                  onPress={() => openExternalLink(item.url)}
                >
                  <Ionicons name="git-branch-outline" size={16} color="#2563EB" />
                  <View style={styles.relatedSearchText}>
                    <Text style={styles.relatedSearchLabel}>
                      {item.label}
                      {item.representative_name ? ` - ${item.representative_name}` : ''}
                    </Text>
                    <Text style={styles.relatedSearchQuery} numberOfLines={1}>
                      {item.query}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {relatedClues?.contact_clues?.length ? (
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
                          {item.pl_reference ? ` - ${item.pl_reference}` : ''}
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
                        name={
                          savingRelatedActionKey === interactionKey
                            ? 'hourglass-outline'
                            : 'document-text-outline'
                        }
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

          {relatedClues?.local_related_businesses?.length ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedSectionTitle}>Fiches proches déjà dans la base</Text>
              {relatedClues.local_related_businesses.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.relatedBusinessItem}
                  onPress={() => onOpenBusiness(item.id, item.scan_id)}
                >
                  <View style={styles.relatedRowText}>
                    <Text style={styles.relatedPrimary}>
                      {item.name}
                      {item.pl_reference ? ` - ${item.pl_reference}` : ''}
                    </Text>
                    <Text style={styles.relatedSecondary}>
                      {item.reason}
                      {item.city ? ` - ${item.city}` : ''}
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
  );
}
