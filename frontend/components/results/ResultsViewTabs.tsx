import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ViewMode = 'verified' | 'unverified' | 'visite_terrain';

type Props = {
  visible: boolean;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  verifiedCount: number;
  unverifiedCount: number;
  visiteTerrainCount: number;
};

export default function ResultsViewTabs({
  visible,
  viewMode,
  onChangeViewMode,
  verifiedCount,
  unverifiedCount,
  visiteTerrainCount,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.viewModeTabs}>
      <TouchableOpacity
        style={[styles.viewModeTab, viewMode === 'verified' && styles.viewModeTabActive]}
        onPress={() => onChangeViewMode('verified')}
      >
        <Ionicons name="checkmark-circle" size={16} color={viewMode === 'verified' ? '#FFF' : '#4CAF50'} />
        <Text style={[styles.viewModeTabText, viewMode === 'verified' && styles.viewModeTabTextActive]}>
          Vérifiés ({verifiedCount})
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.viewModeTab, styles.viewModeTabUnverified, viewMode === 'unverified' && styles.viewModeTabUnverifiedActive]}
        onPress={() => onChangeViewMode('unverified')}
      >
        <Ionicons name="help-circle" size={16} color={viewMode === 'unverified' ? '#FFF' : '#FF9800'} />
        <Text style={[styles.viewModeTabText, styles.viewModeTabTextUnverified, viewMode === 'unverified' && styles.viewModeTabTextActive]}>
          À vérifier ({unverifiedCount})
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.viewModeTab, styles.viewModeTabVisiteTerrain, viewMode === 'visite_terrain' && styles.viewModeTabVisiteTerrainActive]}
        onPress={() => onChangeViewMode('visite_terrain')}
      >
        <Ionicons name="car" size={16} color={viewMode === 'visite_terrain' ? '#FFF' : '#9C27B0'} />
        <Text style={[styles.viewModeTabText, styles.viewModeTabTextVisiteTerrain, viewMode === 'visite_terrain' && styles.viewModeTabTextActive]}>
          Terrain ({visiteTerrainCount})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  viewModeTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  viewModeTabActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  viewModeTabText: {
    color: '#2E7D32',
    fontWeight: '700',
    fontSize: 14,
  },
  viewModeTabTextActive: {
    color: '#FFFFFF',
  },
  viewModeTabUnverified: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  viewModeTabUnverifiedActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  viewModeTabTextUnverified: {
    color: '#C2410C',
  },
  viewModeTabVisiteTerrain: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  viewModeTabVisiteTerrainActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  viewModeTabTextVisiteTerrain: {
    color: '#9C27B0',
  },
});
