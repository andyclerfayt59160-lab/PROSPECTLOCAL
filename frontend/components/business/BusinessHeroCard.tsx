import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ContactModeMeta = {
  label: string;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
} | null;

type PhoneReliabilityMeta = {
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
} | null;

type CreationAnalysis = {
  freshness: string;
  bgColor: string;
  color: string;
  label: string;
} | null;

type BusinessLike = {
  name?: string;
  score?: number;
  score_reason?: string;
  solocal_priority_score?: number;
  solocal_priority_label?: string;
  solocal_priority_reason?: string;
  phone_reliability_label?: string;
  postal_code?: string;
};

type Props = {
  business: BusinessLike;
  getScoreColor: (score: number) => string;
  contactModeMeta: ContactModeMeta;
  phoneReliabilityMeta: PhoneReliabilityMeta;
  highlightedCreationDate: string;
  creationAnalysis: CreationAnalysis;
  highlightedCity: string;
};

export default function BusinessHeroCard({
  business,
  getScoreColor,
  contactModeMeta,
  phoneReliabilityMeta,
  highlightedCreationDate,
  creationAnalysis,
  highlightedCity,
}: Props) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.businessName}>{business.name}</Text>

      <View style={styles.scoreRow}>
        <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(business.score || 0) }]}>
          <Text style={styles.scoreText}>{business.score || 0}</Text>
        </View>
        <Text style={styles.scoreLabel}>Score de prospection</Text>
      </View>

      {business.score_reason ? (
        <View style={styles.scoreReasonBox}>
          <Text style={styles.scoreReasonText}>{business.score_reason}</Text>
        </View>
      ) : null}

      {(business.solocal_priority_label || business.solocal_priority_reason || contactModeMeta) ? (
        <View style={styles.solocalPriorityCard}>
          <View style={styles.solocalPriorityHeader}>
            <View style={styles.solocalPriorityScoreBubble}>
              <Text style={styles.solocalPriorityScoreText}>{business.solocal_priority_score ?? 0}</Text>
            </View>
            <View style={styles.solocalPriorityHeaderText}>
              <Text style={styles.solocalPriorityTitle}>
                {business.solocal_priority_label || 'Priorité Solocal'}
              </Text>
              {business.solocal_priority_reason ? (
                <Text style={styles.solocalPriorityReason}>{business.solocal_priority_reason}</Text>
              ) : null}
              {phoneReliabilityMeta && business.phone_reliability_label ? (
                <View style={[styles.phoneReliabilityBadge, { backgroundColor: phoneReliabilityMeta.bg }]}>
                  <Ionicons name={phoneReliabilityMeta.icon} size={12} color={phoneReliabilityMeta.color} />
                  <Text style={[styles.phoneReliabilityBadgeText, { color: phoneReliabilityMeta.color }]}>
                    {business.phone_reliability_label}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {contactModeMeta ? (
            <View style={[styles.solocalContactModeBadge, { backgroundColor: contactModeMeta.bg }]}>
              <Ionicons name={contactModeMeta.icon} size={14} color={contactModeMeta.color} />
              <Text style={[styles.solocalContactModeBadgeText, { color: contactModeMeta.color }]}>
                {contactModeMeta.label}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.heroHighlightsRow}>
        <View style={styles.heroHighlightCard}>
          <View style={styles.heroHighlightHeader}>
            <Ionicons name="calendar-outline" size={16} color="#4F46E5" />
            <Text style={styles.heroHighlightLabel}>Date de création</Text>
          </View>
          <Text style={styles.heroHighlightValue}>{highlightedCreationDate}</Text>
          {creationAnalysis && creationAnalysis.freshness !== 'unknown' ? (
            <View style={[styles.heroHighlightBadge, { backgroundColor: creationAnalysis.bgColor }]}>
              <Text style={[styles.heroHighlightBadgeText, { color: creationAnalysis.color }]}>
                {creationAnalysis.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroHighlightCard}>
          <View style={styles.heroHighlightHeader}>
            <Ionicons name="location-outline" size={16} color="#EA580C" />
            <Text style={styles.heroHighlightLabel}>Ville</Text>
          </View>
          <Text style={styles.heroHighlightValue}>{highlightedCity}</Text>
          {business.postal_code ? (
            <Text style={styles.heroHighlightMeta}>{business.postal_code}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  businessName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  scoreBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '700',
  },
  scoreReasonBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scoreReasonText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  solocalPriorityCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 12,
  },
  solocalPriorityHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  solocalPriorityScoreBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solocalPriorityScoreText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  solocalPriorityHeaderText: {
    flex: 1,
    gap: 6,
  },
  solocalPriorityTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  solocalPriorityReason: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  phoneReliabilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  phoneReliabilityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  solocalContactModeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  solocalContactModeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  heroHighlightsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroHighlightCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
  },
  heroHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroHighlightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroHighlightValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  heroHighlightMeta: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  heroHighlightBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroHighlightBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
