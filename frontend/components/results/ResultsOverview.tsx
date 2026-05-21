import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  listFocusMode: boolean;
  total: number;
  totalVerified: number;
  totalUnverified: number;
  totalVisiteTerrain: number;
  opportunityMax: number;
  legalConfirmed: number;
  legalMissing: number;
  auditedVisibility: number;
  offerPackVisibility: number;
  offerGoogleBusiness: number;
  offerWebsite: number;
  offerGoogleReviews: number;
  currentViewLabel: string;
  currentViewCount: number;
};

export default function ResultsOverview({
  listFocusMode,
  total,
  totalVerified,
  totalUnverified,
  totalVisiteTerrain,
  opportunityMax,
  legalConfirmed,
  legalMissing,
  auditedVisibility,
  offerPackVisibility,
  offerGoogleBusiness,
  offerWebsite,
  offerGoogleReviews,
  currentViewLabel,
  currentViewCount,
}: Props) {
  if (listFocusMode) {
    return (
      <View style={styles.listFocusBanner}>
        <Text style={styles.listFocusBannerTitle}>Vue liste plein ecran</Text>
        <Text style={styles.listFocusBannerText}>
          {currentViewLabel} • {currentViewCount} fiche(s)
        </Text>
      </View>
    );
  }

  const showAuditDetails = auditedVisibility > 0 || legalConfirmed > 0 || legalMissing > 0;
  const showOfferDetails =
    offerPackVisibility > 0 || offerGoogleBusiness > 0 || offerWebsite > 0 || offerGoogleReviews > 0;

  return (
    <View style={styles.statsBar}>
      <Text style={styles.statsTotal}>{total} etablissements au total</Text>
      <View style={styles.statsBreakdown}>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsVerified}>{totalVerified}</Text> verifies
        </Text>
        <Text style={styles.statsBreakdownSep}>•</Text>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsUnverified}>{totalUnverified}</Text> a verifier
        </Text>
        <Text style={styles.statsBreakdownSep}>•</Text>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsVisiteTerrain}>{totalVisiteTerrain}</Text> visite terrain
        </Text>
      </View>
      {opportunityMax > 0 || showAuditDetails || showOfferDetails ? (
        <View style={styles.statsDetails}>
          {opportunityMax > 0 ? (
            <Text style={styles.statItemWarm}>🔥 {opportunityMax} opportunites max</Text>
          ) : null}
          {offerPackVisibility > 0 ? (
            <Text style={styles.statItemPurple}>Pack visibilite: {offerPackVisibility}</Text>
          ) : null}
          {offerGoogleBusiness > 0 ? (
            <Text style={styles.statItemInfo}>Fiche Google: {offerGoogleBusiness}</Text>
          ) : null}
          {offerWebsite > 0 ? (
            <Text style={styles.statItemBlue}>Site web: {offerWebsite}</Text>
          ) : null}
          {offerGoogleReviews > 0 ? (
            <Text style={styles.statItemSuccess}>Google et avis: {offerGoogleReviews}</Text>
          ) : null}
          {auditedVisibility > 0 ? (
            <Text style={styles.statItemInfo}>Audit visibility: {auditedVisibility}</Text>
          ) : null}
          {legalConfirmed > 0 ? (
            <Text style={styles.statItemSuccess}>Legales confirmees: {legalConfirmed}</Text>
          ) : null}
          {legalMissing > 0 ? (
            <Text style={styles.statItemWarning}>A recouper: {legalMissing}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statsBar: {
    marginHorizontal: 14,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  statsTotal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  statsBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  statsBreakdownItem: {
    fontSize: 16,
    color: '#475569',
  },
  statsBreakdownSep: {
    fontSize: 16,
    color: '#94A3B8',
  },
  statsVerified: {
    color: '#4CAF50',
    fontWeight: '800',
  },
  statsUnverified: {
    color: '#FF9800',
    fontWeight: '800',
  },
  statsVisiteTerrain: {
    color: '#9C27B0',
    fontWeight: '800',
  },
  statsDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  statItemWarm: {
    fontSize: 14,
    color: '#B45309',
    fontWeight: '700',
  },
  statItemInfo: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  statItemBlue: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '700',
  },
  statItemPurple: {
    fontSize: 14,
    color: '#6D28D9',
    fontWeight: '700',
  },
  statItemSuccess: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '700',
  },
  statItemWarning: {
    fontSize: 14,
    color: '#B45309',
    fontWeight: '700',
  },
  listFocusBanner: {
    marginHorizontal: 14,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 6,
  },
  listFocusBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3730A3',
  },
  listFocusBannerText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
});
