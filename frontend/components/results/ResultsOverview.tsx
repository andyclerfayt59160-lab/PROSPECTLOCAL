import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  listFocusMode: boolean;
  total: number;
  totalVerified: number;
  totalUnverified: number;
  totalVisiteTerrain: number;
  opportunityMax: number;
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
  currentViewLabel,
  currentViewCount,
}: Props) {
  if (listFocusMode) {
    return (
      <View style={styles.listFocusBanner}>
        <Text style={styles.listFocusBannerTitle}>Vue liste plein écran</Text>
        <Text style={styles.listFocusBannerText}>
          {currentViewLabel} • {currentViewCount} fiche(s)
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.statsBar}>
      <Text style={styles.statsTotal}>{total} établissements au total</Text>
      <View style={styles.statsBreakdown}>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsVerified}>{totalVerified}</Text> vérifiés
        </Text>
        <Text style={styles.statsBreakdownSep}>•</Text>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsUnverified}>{totalUnverified}</Text> à vérifier
        </Text>
        <Text style={styles.statsBreakdownSep}>•</Text>
        <Text style={styles.statsBreakdownItem}>
          <Text style={styles.statsVisiteTerrain}>{totalVisiteTerrain}</Text> visite terrain
        </Text>
      </View>
      {opportunityMax > 0 ? (
        <View style={styles.statsDetails}>
          <Text style={styles.statItem}>🔥 {opportunityMax} opportunités max</Text>
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
  statItem: {
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
