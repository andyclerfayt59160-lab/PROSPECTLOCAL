import React from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SourceInfo = {
  source?: string;
  source_name?: string;
  label?: string;
  confidence?: string | number;
  verified?: boolean;
  extracted_from?: string;
  url?: string;
} | null | undefined;

interface Props {
  fieldName?: string;
  sourceInfo?: SourceInfo;
}

const getSourceMeta = (sourceInfo?: SourceInfo) => {
  const rawSource =
    sourceInfo?.source ||
    sourceInfo?.label ||
    sourceInfo?.extracted_from ||
    'source inconnue';
  const source = String(rawSource).toLowerCase();

  if (source.includes('google')) {
    return { label: 'Google', color: '#2563EB', bg: '#DBEAFE', icon: 'logo-google' as const };
  }
  if (source.includes('pappers')) {
    return { label: 'Pappers', color: '#EA580C', bg: '#FFEDD5', icon: 'business' as const };
  }
  if (source.includes('web') || source.includes('site')) {
    return { label: 'Web', color: '#059669', bg: '#D1FAE5', icon: 'globe-outline' as const };
  }
  if (source.includes('serper')) {
    return { label: 'Serper', color: '#7C3AED', bg: '#EDE9FE', icon: 'search-outline' as const };
  }

  return { label: 'Source', color: '#475569', bg: '#E2E8F0', icon: 'information-circle-outline' as const };
};

export default function SourceIndicator({ fieldName, sourceInfo }: Props) {
  if (!sourceInfo) {
    return null;
  }

  const meta = getSourceMeta(sourceInfo);
  const sourceUrl = sourceInfo.url;
  const confidence =
    sourceInfo.confidence !== undefined && sourceInfo.confidence !== null
      ? String(sourceInfo.confidence)
      : null;

  const handleOpenSource = async () => {
    if (!sourceUrl) return;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const popup = window.open(sourceUrl, '_blank', 'noopener,noreferrer');
        if (popup) return;
      }
      await Linking.openURL(sourceUrl);
    } catch {
      Alert.alert('Source', `Impossible d'ouvrir la source.\n${sourceUrl}`);
    }
  };

  const BadgeComponent = sourceUrl ? TouchableOpacity : View;

  return (
    <View style={styles.wrapper}>
      {fieldName ? <Text style={styles.field}>{fieldName}</Text> : null}
      <BadgeComponent
        style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.color }]}
        {...(sourceUrl ? { onPress: handleOpenSource, activeOpacity: 0.8 } : {})}
      >
        <Ionicons name={meta.icon} size={12} color={meta.color} />
        <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
        {confidence ? <Text style={[styles.confidence, { color: meta.color }]}>{confidence}</Text> : null}
        {sourceUrl ? <Ionicons name="open-outline" size={12} color={meta.color} /> : null}
      </BadgeComponent>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
  },
  field: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  confidence: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.8,
  },
});
