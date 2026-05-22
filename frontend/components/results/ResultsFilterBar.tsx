import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';

type StatsLike = {
  no_pagesjaunes?: number;
  no_website?: number;
  google_missing?: number;
  new_in_scan?: number;
  opportunity_max?: number;
  rebound_available?: number;
  fragile_available?: number;
  legal_confirmed?: number;
  legal_missing?: number;
  audited_visibility?: number;
  offer_pack_visibility?: number;
  offer_google_business?: number;
  offer_website?: number;
  offer_google_reviews?: number;
  readiness_ready_call?: number;
  readiness_review?: number;
  readiness_field?: number;
  readiness_avoid?: number;
};

type Props = {
  visible: boolean;
  activeFilter: string;
  onChangeFilter: (filter: string) => void;
  totalCurrentView: number;
  includeClients: boolean;
  onToggleIncludeClients: (value: boolean) => void;
  stats: StatsLike | null;
};

export default function ResultsFilterBar({
  visible,
  activeFilter,
  onChangeFilter,
  totalCurrentView,
  includeClients,
  onToggleIncludeClients,
  stats,
}: Props) {
  if (!visible) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
          onPress={() => onChangeFilter('all')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
            Tous ({totalCurrentView})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, styles.filterPillMax, activeFilter === 'opportunity_max' && styles.filterPillMaxActive]}
          onPress={() => onChangeFilter('opportunity_max')}
        >
          <Text style={[styles.filterPillText, styles.filterPillTextMax, activeFilter === 'opportunity_max' && styles.filterPillTextActive]}>
            🔥 Opportunité Max ({stats?.opportunity_max || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, styles.filterPillRed, activeFilter === 'no_pj' && styles.filterPillRedActive]}
          onPress={() => onChangeFilter('no_pj')}
        >
          <Text style={[styles.filterPillText, styles.filterPillTextRed, activeFilter === 'no_pj' && styles.filterPillTextActive]}>
            🔴 Sans PJ ({stats?.no_pagesjaunes || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'no_website' && styles.filterPillActive]}
          onPress={() => onChangeFilter('no_website')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'no_website' && styles.filterPillTextActive]}>
            🌐 Sans site ({stats?.no_website || 0})
          </Text>
        </TouchableOpacity>

        {stats && (stats.google_missing || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillAmber, activeFilter === 'google_missing' && styles.filterPillAmberActive]}
            onPress={() => onChangeFilter('google_missing')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextAmber, activeFilter === 'google_missing' && styles.filterPillTextActive]}>
              📍 Sans Google ({stats.google_missing || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.offer_pack_visibility || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillPurple, activeFilter === 'offer_pack_visibility' && styles.filterPillPurpleActive]}
            onPress={() => onChangeFilter('offer_pack_visibility')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextPurple, activeFilter === 'offer_pack_visibility' && styles.filterPillTextActive]}>
              Pack visibilite ({stats.offer_pack_visibility || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.offer_google_business || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillAmber, activeFilter === 'offer_google_business' && styles.filterPillAmberActive]}
            onPress={() => onChangeFilter('offer_google_business')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextAmber, activeFilter === 'offer_google_business' && styles.filterPillTextActive]}>
              Fiche Google ({stats.offer_google_business || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.offer_website || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillBlue, activeFilter === 'offer_website' && styles.filterPillBlueActive]}
            onPress={() => onChangeFilter('offer_website')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextBlue, activeFilter === 'offer_website' && styles.filterPillTextActive]}>
              Site web ({stats.offer_website || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.offer_google_reviews || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillGreen, activeFilter === 'offer_google_reviews' && styles.filterPillGreenActive]}
            onPress={() => onChangeFilter('offer_google_reviews')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextGreen, activeFilter === 'offer_google_reviews' && styles.filterPillTextActive]}>
              Google et avis ({stats.offer_google_reviews || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.readiness_ready_call || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillGreen, activeFilter === 'ready_call' && styles.filterPillGreenActive]}
            onPress={() => onChangeFilter('ready_call')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextGreen, activeFilter === 'ready_call' && styles.filterPillTextActive]}>
              Pret a appeler ({stats.readiness_ready_call || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.readiness_review || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillAmber, activeFilter === 'review' && styles.filterPillAmberActive]}
            onPress={() => onChangeFilter('review')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextAmber, activeFilter === 'review' && styles.filterPillTextActive]}>
              A recouper ({stats.readiness_review || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.readiness_field || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillPurple, activeFilter === 'field' && styles.filterPillPurpleActive]}
            onPress={() => onChangeFilter('field')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextPurple, activeFilter === 'field' && styles.filterPillTextActive]}>
              A visiter ({stats.readiness_field || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.readiness_avoid || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillRed, activeFilter === 'avoid' && styles.filterPillRedActive]}
            onPress={() => onChangeFilter('avoid')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextRed, activeFilter === 'avoid' && styles.filterPillTextActive]}>
              A eviter ({stats.readiness_avoid || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.filterPill, activeFilter === 'low_reviews' && styles.filterPillActive]}
          onPress={() => onChangeFilter('low_reviews')}
        >
          <Text style={[styles.filterPillText, activeFilter === 'low_reviews' && styles.filterPillTextActive]}>
            ⭐ &lt;5 avis
          </Text>
        </TouchableOpacity>

        {stats && (stats.new_in_scan || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillGreen, activeFilter === 'new' && styles.filterPillGreenActive]}
            onPress={() => onChangeFilter('new')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextGreen, activeFilter === 'new' && styles.filterPillTextActive]}>
              🆕 Nouveaux ({stats.new_in_scan || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.rebound_available || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillBlue, activeFilter === 'rebound' && styles.filterPillBlueActive]}
            onPress={() => onChangeFilter('rebound')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextBlue, activeFilter === 'rebound' && styles.filterPillTextActive]}>
              🔗 Rebond ({stats.rebound_available || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.fragile_available || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillAmber, activeFilter === 'fragile' && styles.filterPillAmberActive]}
            onPress={() => onChangeFilter('fragile')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextAmber, activeFilter === 'fragile' && styles.filterPillTextActive]}>
              ⚠️ Direct fragile ({stats.fragile_available || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.legal_confirmed || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillGreen, activeFilter === 'legal_confirmed' && styles.filterPillGreenActive]}
            onPress={() => onChangeFilter('legal_confirmed')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextGreen, activeFilter === 'legal_confirmed' && styles.filterPillTextActive]}>
              ✅ Legales OK ({stats.legal_confirmed || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.legal_missing || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillRed, activeFilter === 'legal_missing' && styles.filterPillRedActive]}
            onPress={() => onChangeFilter('legal_missing')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextRed, activeFilter === 'legal_missing' && styles.filterPillTextActive]}>
              ⚠️ A recouper ({stats.legal_missing || 0})
            </Text>
          </TouchableOpacity>
        ) : null}

        {stats && (stats.audited_visibility || 0) > 0 ? (
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillBlue, activeFilter === 'audited' && styles.filterPillBlueActive]}
            onPress={() => onChangeFilter('audited')}
          >
            <Text style={[styles.filterPillText, styles.filterPillTextBlue, activeFilter === 'audited' && styles.filterPillTextActive]}>
              🧭 Audites ({stats.audited_visibility || 0})
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View style={styles.clientToggle}>
        <Text style={styles.clientToggleLabel}>Inclure les clients</Text>
        <Switch
          value={includeClients}
          onValueChange={onToggleIncludeClients}
          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
          style={styles.filterSwitch}
        />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotAbsent]} />
          <Text style={styles.legendText}>Absent PJ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotPresent]} />
          <Text style={styles.legendText}>Présent PJ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.pjDot, styles.pjDotUnknown]} />
          <Text style={styles.legendText}>À vérifier</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendEmoji}>🔥</Text>
          <Text style={styles.legendText}>Opportunité Max</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  filterScroll: {
    maxHeight: 58,
  },
  filterContainer: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  filterPillActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  filterPillMax: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
  },
  filterPillMaxActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  filterPillTextMax: {
    color: '#C2410C',
  },
  filterPillRed: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  filterPillRedActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  filterPillTextRed: {
    color: '#DC2626',
  },
  filterPillGreen: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  filterPillGreenActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  filterPillTextGreen: {
    color: '#15803D',
  },
  filterPillPurple: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  filterPillPurpleActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  filterPillTextPurple: {
    color: '#6D28D9',
  },
  filterPillBlue: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  filterPillBlueActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterPillTextBlue: {
    color: '#1D4ED8',
  },
  filterPillAmber: {
    borderColor: '#D97706',
    backgroundColor: '#FFF7ED',
  },
  filterPillAmberActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  filterPillTextAmber: {
    color: '#B45309',
  },
  clientToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clientToggleLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  filterSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  legendEmoji: {
    fontSize: 14,
  },
  pjDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pjDotAbsent: {
    backgroundColor: '#EF4444',
  },
  pjDotPresent: {
    backgroundColor: '#22C55E',
  },
  pjDotUnknown: {
    backgroundColor: '#F59E0B',
  },
});
