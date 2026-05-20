import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  source: string | string[] | undefined;
  sourceLabel: string;
  zone: string;
  period: string;
  viewLabel: string;
  currentViewCount: number;
  filteredCount: number;
  coverage: string;
  resultMix: string;
  diagnosticMix?: string;
  premiumLabel?: string;
  premiumColor?: string;
  premiumBackgroundColor?: string;
  premiumSummary?: string;
  premiumCost?: string;
  premiumAction?: string;
  summaryExpanded: boolean;
  onToggleSummary: () => void;
};

export default function ResultsScanSummary({
  visible,
  source,
  sourceLabel,
  zone,
  period,
  viewLabel,
  currentViewCount,
  filteredCount,
  coverage,
  resultMix,
  diagnosticMix,
  premiumLabel,
  premiumColor,
  premiumBackgroundColor,
  premiumSummary,
  premiumCost,
  premiumAction,
  summaryExpanded,
  onToggleSummary,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.scanSummaryCard}>
      <View style={styles.scanSummaryHeader}>
        <View style={styles.scanSummaryHeaderMain}>
          <View style={styles.scanSummaryBadge}>
            <Ionicons
              name={source === 'pappers' ? 'business-outline' : 'globe-outline'}
              size={16}
              color="#6366F1"
            />
            <Text style={styles.scanSummaryBadgeText}>{sourceLabel}</Text>
          </View>
          <View style={styles.scanSummaryHero}>
            <Text style={styles.scanSummaryHeroTitle}>{zone}</Text>
            <Text style={styles.scanSummaryHeroSubtitle}>
              {period} • {viewLabel} • {currentViewCount}
            </Text>
          </View>
        </View>
        <View style={styles.scanSummaryHeaderRight}>
          <Text style={styles.scanSummaryCount}>{filteredCount} affiches</Text>
          <TouchableOpacity
            style={styles.scanSummaryToggle}
            onPress={onToggleSummary}
            activeOpacity={0.8}
          >
            <Ionicons
              name={summaryExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={16}
              color="#6366F1"
            />
            <Text style={styles.scanSummaryToggleText}>
              {summaryExpanded ? 'Reduire' : 'Details'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.scanSummaryPills}>
        <View style={styles.scanSummaryPill}>
          <Text style={styles.scanSummaryPillLabel}>Couverture</Text>
          <Text style={styles.scanSummaryPillValue}>{coverage}</Text>
        </View>
        <View style={styles.scanSummaryPill}>
          <Text style={styles.scanSummaryPillLabel}>Resultat</Text>
          <Text style={styles.scanSummaryPillValue}>{resultMix}</Text>
        </View>
      </View>
      {premiumLabel && premiumSummary ? (
        <View style={styles.scanSummaryPremiumCard}>
          <View
            style={[
              styles.scanSummaryPremiumBadge,
              premiumBackgroundColor ? { backgroundColor: premiumBackgroundColor } : null,
            ]}
          >
            <Text
              style={[
                styles.scanSummaryPremiumBadgeText,
                premiumColor ? { color: premiumColor } : null,
              ]}
            >
              {premiumLabel}
            </Text>
          </View>
          <Text style={styles.scanSummaryPremiumSummary}>{premiumSummary}</Text>
          {premiumCost ? <Text style={styles.scanSummaryPremiumCost}>{premiumCost}</Text> : null}
          {premiumAction ? <Text style={styles.scanSummaryPremiumAction}>{premiumAction}</Text> : null}
        </View>
      ) : null}
      {summaryExpanded ? (
        <View style={styles.scanSummaryDetails}>
          <View style={styles.scanSummaryItem}>
            <Text style={styles.scanSummaryLabel}>Zone</Text>
            <Text style={styles.scanSummaryValue}>{zone}</Text>
          </View>
          <View style={styles.scanSummaryItem}>
            <Text style={styles.scanSummaryLabel}>Periode</Text>
            <Text style={styles.scanSummaryValue}>{period}</Text>
          </View>
          <View style={styles.scanSummaryItem}>
            <Text style={styles.scanSummaryLabel}>Vue active</Text>
            <Text style={styles.scanSummaryValue}>
              {viewLabel} • {currentViewCount}
            </Text>
          </View>
          <View style={styles.scanSummaryItem}>
            <Text style={styles.scanSummaryLabel}>Resultat du scan</Text>
            <Text style={styles.scanSummaryValue}>{resultMix}</Text>
          </View>
          {diagnosticMix ? (
            <View style={styles.scanSummaryItem}>
              <Text style={styles.scanSummaryLabel}>Lecture scan</Text>
              <Text style={styles.scanSummaryValue}>{diagnosticMix}</Text>
            </View>
          ) : null}
          {premiumAction ? (
            <View style={styles.scanSummaryItem}>
              <Text style={styles.scanSummaryLabel}>Action recommandee</Text>
              <Text style={styles.scanSummaryValue}>{premiumAction}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scanSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    padding: 18,
    marginHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  scanSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 14,
  },
  scanSummaryHeaderMain: {
    flex: 1,
    gap: 10,
  },
  scanSummaryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  scanSummaryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  scanSummaryHero: {
    gap: 6,
  },
  scanSummaryHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scanSummaryHeroSubtitle: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  scanSummaryHeaderRight: {
    alignItems: 'flex-end',
    gap: 10,
  },
  scanSummaryCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  scanSummaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
  },
  scanSummaryToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  scanSummaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  scanSummaryPremiumCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  scanSummaryPremiumBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  scanSummaryPremiumBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6366F1',
  },
  scanSummaryPremiumSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    fontWeight: '700',
  },
  scanSummaryPremiumCost: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  scanSummaryPremiumAction: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    fontWeight: '600',
  },
  scanSummaryPill: {
    flex: 1,
    minWidth: 180,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  scanSummaryPillLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#64748B',
    fontWeight: '700',
  },
  scanSummaryPillValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  scanSummaryDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  scanSummaryItem: {
    gap: 4,
  },
  scanSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scanSummaryValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 20,
  },
});
