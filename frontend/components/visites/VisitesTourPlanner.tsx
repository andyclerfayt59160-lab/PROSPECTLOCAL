import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TourMap } from '../TourMap';

type AddressSuggestion = {
  label: string;
};

type TourBusiness = {
  id: string;
  name: string;
  city?: string;
  address?: string;
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

type Props = {
  showManualVisiteButton?: boolean;
  onOpenManualVisite: () => void;
  showTourMap: boolean;
  onToggleTourMap: () => void;
  optimizedTourBusinesses: TourBusiness[];
  mappedTourBusinesses: TourBusiness[];
  inferredTourStartLocation: UserLocation | null;
  tourMetrics: {
    totalDistanceKm: number;
    averageLegKm: number;
    mappedStops: number;
  };
  optimizingTour: boolean;
  launchingTour: boolean;
  onOptimizeTour: () => void;
  onLaunchTour: () => void;
  tourStartSourceLabel?: string | null;
  customTourStartQuery: string;
  onChangeCustomTourStartQuery: (value: string) => void;
  loadingCustomTourStartSuggestions: boolean;
  customTourStartSuggestions: AddressSuggestion[];
  onSelectCustomTourStartSuggestion: (suggestion: AddressSuggestion) => void;
  onUseGpsStart: () => void | Promise<void>;
  onClearCustomTourStart: () => void | Promise<void>;
  tourStopLimit: number;
  onChangeTourStopLimit: (limit: number) => void;
  plannedTourBusinesses: TourBusiness[];
  morningTourBusinesses: TourBusiness[];
  afternoonTourBusinesses: TourBusiness[];
  plannedTourMetrics: {
    totalDistanceKm: number;
  };
  plannedRemainingStops: number;
  completedTodayCount: number;
  plannedTourStatusCounts: Record<string, number>;
  nextPlannedBusiness: TourBusiness | null;
  getNextPlannedBusinessIndex: (businessId: string) => number;
  onOpenMaps: (business: TourBusiness) => void;
  onOpenBusiness: (businessId: string) => void;
  tourActionMessage?: string | null;
  tourActionTone: 'info' | 'success' | 'warning';
  routePreviewStops: TourBusiness[];
};

export default function VisitesTourPlanner({
  showManualVisiteButton = true,
  onOpenManualVisite,
  showTourMap,
  onToggleTourMap,
  optimizedTourBusinesses,
  mappedTourBusinesses,
  inferredTourStartLocation,
  tourMetrics,
  optimizingTour,
  launchingTour,
  onOptimizeTour,
  onLaunchTour,
  tourStartSourceLabel,
  customTourStartQuery,
  onChangeCustomTourStartQuery,
  loadingCustomTourStartSuggestions,
  customTourStartSuggestions,
  onSelectCustomTourStartSuggestion,
  onUseGpsStart,
  onClearCustomTourStart,
  tourStopLimit,
  onChangeTourStopLimit,
  plannedTourBusinesses,
  morningTourBusinesses,
  afternoonTourBusinesses,
  plannedTourMetrics,
  plannedRemainingStops,
  completedTodayCount,
  plannedTourStatusCounts,
  nextPlannedBusiness,
  getNextPlannedBusinessIndex,
  onOpenMaps,
  onOpenBusiness,
  tourActionMessage,
  tourActionTone,
  routePreviewStops,
}: Props) {
  return (
    <View style={styles.tourHeroCard}>
      <View style={styles.tourHeroHeader}>
        <View style={styles.tourHeroTextBlock}>
          <Text style={styles.tourHeroTitle}>Tournée terrain</Text>
          <Text style={styles.tourHeroSubtitle}>
            Carte, ordre optimisé et lancement direct vers Google Maps.
          </Text>
        </View>
        <View style={styles.tourHeroHeaderActions}>
          {showManualVisiteButton ? (
            <TouchableOpacity style={styles.manualVisiteHeaderButton} onPress={onOpenManualVisite}>
              <Ionicons name="add-circle-outline" size={16} color="#4F46E5" />
              <Text style={styles.manualVisiteHeaderButtonText}>Nouvelle visite terrain</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.tourHeroBadge, showTourMap && styles.tourHeroBadgeActive]}
            onPress={onToggleTourMap}
          >
            <Ionicons name={showTourMap ? 'map' : 'map-outline'} size={16} color={showTourMap ? '#FFF' : '#4F46E5'} />
            <Text style={[styles.tourHeroBadgeText, showTourMap && styles.tourHeroBadgeTextActive]}>
              {showTourMap ? 'Carte visible' : 'Afficher la carte'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tourHeroStats}>
        <View style={styles.tourHeroStat}>
          <Text style={styles.tourHeroStatValue}>{optimizedTourBusinesses.length}</Text>
          <Text style={styles.tourHeroStatLabel}>arrêts</Text>
        </View>
        <View style={styles.tourHeroStat}>
          <Text style={styles.tourHeroStatValue}>{tourMetrics.totalDistanceKm.toFixed(1)} km</Text>
          <Text style={styles.tourHeroStatLabel}>estimes</Text>
        </View>
        <View style={styles.tourHeroStat}>
          <Text style={styles.tourHeroStatValue}>{Math.round(tourMetrics.averageLegKm * 10) / 10} km</Text>
          <Text style={styles.tourHeroStatLabel}>étape moy.</Text>
        </View>
      </View>

      <View style={styles.tourHeroActions}>
        <TouchableOpacity style={styles.tourHeroPrimaryBtn} onPress={onOptimizeTour} disabled={optimizingTour}>
          {optimizingTour ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="navigate" size={18} color="#FFF" />
          )}
          <Text style={styles.tourHeroPrimaryBtnText}>
            {optimizingTour ? 'Optimisation...' : "Optimiser l'ordre"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tourHeroSecondaryBtn} onPress={onLaunchTour} disabled={launchingTour}>
          {launchingTour ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <Ionicons name="car" size={18} color="#4F46E5" />
          )}
          <Text style={styles.tourHeroSecondaryBtnText}>
            {launchingTour ? 'Ouverture...' : 'Lancer la tournée'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tourStartCard}>
        <View style={styles.tourStartHeader}>
          <Text style={styles.tourStartTitle}>Départ de tournée</Text>
          {!!tourStartSourceLabel ? (
            <View style={styles.tourStartSourceBadge}>
              <Ionicons name="flag-outline" size={12} color="#4F46E5" />
              <Text style={styles.tourStartSourceBadgeText}>{tourStartSourceLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.tourStartSubtitle}>
          Définis ton agence, ton domicile ou un départ fixe pour éviter des détours inutiles.
        </Text>
        <TextInput
          value={customTourStartQuery}
          onChangeText={onChangeCustomTourStartQuery}
          placeholder="Saisir un départ personnalisé"
          style={styles.tourStartInput}
          placeholderTextColor="#9CA3AF"
        />
        {loadingCustomTourStartSuggestions ? (
          <View style={styles.tourStartLoadingRow}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.tourStartLoadingText}>Recherche d'adresse...</Text>
          </View>
        ) : null}
        {customTourStartSuggestions.length > 0 ? (
          <View style={styles.tourStartSuggestions}>
            {customTourStartSuggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={`${suggestion.label}-${index}`}
                style={styles.tourStartSuggestionItem}
                onPress={() => onSelectCustomTourStartSuggestion(suggestion)}
              >
                <Ionicons name="location-outline" size={14} color="#4F46E5" />
                <Text style={styles.tourStartSuggestionText}>{suggestion.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <View style={styles.tourStartActions}>
          <TouchableOpacity style={styles.tourStartActionBtn} onPress={onUseGpsStart}>
            <Ionicons name="locate-outline" size={15} color="#4F46E5" />
            <Text style={styles.tourStartActionText}>Utiliser mon GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tourStartActionBtn} onPress={onClearCustomTourStart}>
            <Ionicons name="trash-outline" size={15} color="#B91C1C" />
            <Text style={[styles.tourStartActionText, styles.tourStartActionTextDanger]}>Effacer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tourPlanningCard}>
        <View style={styles.tourPlanningHeader}>
          <Text style={styles.tourPlanningTitle}>Plan de journée</Text>
          <Text style={styles.tourPlanningSubtitle}>
            Limite les arrêts et visualise une découpe simple matin / après-midi.
          </Text>
        </View>
        <View style={styles.tourStopLimitRow}>
          {[6, 8, 10, 12].map((limit) => (
            <TouchableOpacity
              key={limit}
              style={[styles.tourStopLimitBtn, tourStopLimit === limit && styles.tourStopLimitBtnActive]}
              onPress={() => onChangeTourStopLimit(limit)}
            >
              <Text style={[styles.tourStopLimitBtnText, tourStopLimit === limit && styles.tourStopLimitBtnTextActive]}>
                {limit} arrêts
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tourPlanningStats}>
          <View style={styles.tourPlanningStat}>
            <Text style={styles.tourPlanningStatValue}>{plannedTourBusinesses.length}</Text>
            <Text style={styles.tourPlanningStatLabel}>prévu(s)</Text>
          </View>
          <View style={styles.tourPlanningStat}>
            <Text style={styles.tourPlanningStatValue}>{morningTourBusinesses.length}</Text>
            <Text style={styles.tourPlanningStatLabel}>matin</Text>
          </View>
          <View style={styles.tourPlanningStat}>
            <Text style={styles.tourPlanningStatValue}>{afternoonTourBusinesses.length}</Text>
            <Text style={styles.tourPlanningStatLabel}>apres-midi</Text>
          </View>
          <View style={styles.tourPlanningStat}>
            <Text style={styles.tourPlanningStatValue}>{plannedTourMetrics.totalDistanceKm.toFixed(1)} km</Text>
            <Text style={styles.tourPlanningStatLabel}>parcours</Text>
          </View>
        </View>

        <View style={styles.tourProgressCard}>
          <View style={styles.tourProgressHeader}>
            <Text style={styles.tourProgressTitle}>Progression du jour</Text>
            <Text style={styles.tourProgressSubtitle}>
              {plannedRemainingStops} arrêt(s) encore à traiter sur {plannedTourBusinesses.length}
            </Text>
          </View>
          <View style={styles.tourProgressGrid}>
            <ProgressPill value={completedTodayCount} label={"Faites aujourd'hui"} />
            <ProgressPill value={plannedTourStatusCounts.non_visite || 0} label="A faire" />
            <ProgressPill value={plannedTourStatusCounts.visite || 0} label="Visitees" />
            <ProgressPill value={plannedTourStatusCounts.a_revisiter || 0} label="A revoir" />
            <ProgressPill value={plannedTourStatusCounts.interesse || 0} label="Interessees" />
            <ProgressPill value={plannedTourStatusCounts.pas_interesse || 0} label="Non interessees" />
            <ProgressPill value={plannedTourStatusCounts.client || 0} label="Clients" />
          </View>
        </View>

        {nextPlannedBusiness ? (
          <View style={styles.nextStopCard}>
            <View style={styles.nextStopHeader}>
              <View style={styles.nextStopIndexBadge}>
                <Text style={styles.nextStopIndexText}>{getNextPlannedBusinessIndex(nextPlannedBusiness.id) + 1}</Text>
              </View>
              <View style={styles.nextStopContent}>
                <Text style={styles.nextStopTitle}>Prochaine étape</Text>
                <Text style={styles.nextStopName} numberOfLines={1}>{nextPlannedBusiness.name}</Text>
                <Text style={styles.nextStopMeta} numberOfLines={1}>
                  {[nextPlannedBusiness.city, nextPlannedBusiness.address].filter(Boolean).join(' • ') || 'Adresse à confirmer'}
                </Text>
              </View>
            </View>
            <View style={styles.nextStopActions}>
              <TouchableOpacity style={styles.nextStopActionBtn} onPress={() => onOpenMaps(nextPlannedBusiness)}>
                <Ionicons name="navigate-outline" size={15} color="#4F46E5" />
                <Text style={styles.nextStopActionText}>Y aller</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextStopActionBtn} onPress={() => onOpenBusiness(nextPlannedBusiness.id)}>
                <Ionicons name="create-outline" size={15} color="#4F46E5" />
                <Text style={styles.nextStopActionText}>Ouvrir la fiche</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.tourHalfDayGrid}>
          <HalfDayCard title="Matin" businesses={morningTourBusinesses} />
          <HalfDayCard title="Apres-midi" businesses={afternoonTourBusinesses} />
        </View>
      </View>

      {tourActionMessage ? (
        <View
          style={[
            styles.tourPlannerNotice,
            tourActionTone === 'success' && styles.tourPlannerNoticeSuccess,
            tourActionTone === 'warning' && styles.tourPlannerNoticeWarning,
          ]}
        >
          <Ionicons
            name={tourActionTone === 'warning' ? 'warning' : tourActionTone === 'success' ? 'checkmark-circle' : 'information-circle'}
            size={16}
            color={tourActionTone === 'warning' ? '#B45309' : tourActionTone === 'success' ? '#0F766E' : '#1D4ED8'}
          />
          <Text
            style={[
              styles.tourPlannerNoticeText,
              tourActionTone === 'success' && styles.tourActionTextSuccess,
              tourActionTone === 'warning' && styles.tourActionTextWarning,
            ]}
          >
            {tourActionMessage}
          </Text>
        </View>
      ) : null}

      {routePreviewStops.length ? (
        <View style={styles.tourPreviewCard}>
          <Text style={styles.tourPreviewTitle}>Aperçu de la tournée</Text>
          <Text style={styles.tourPreviewSubtitle}>
            Les premiers arrêts affichent l'ordre actuellement calculé pour la liste.
          </Text>
          <View style={styles.tourPreviewList}>
            {routePreviewStops.map((business, index) => (
              <View key={business.id} style={styles.tourPreviewItem}>
                <View style={styles.tourPreviewIndex}>
                  <Text style={styles.tourPreviewIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.tourPreviewContent}>
                  <Text style={styles.tourPreviewName} numberOfLines={1}>{business.name}</Text>
                  <Text style={styles.tourPreviewMeta} numberOfLines={1}>
                {[business.city, business.address].filter(Boolean).join(' • ') || 'Adresse à confirmer'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {tourMetrics.mappedStops < optimizedTourBusinesses.length ? (
        <View style={styles.tourPlannerNotice}>
          <Ionicons name="information-circle" size={16} color="#B45309" />
          <Text style={styles.tourPlannerNoticeText}>
            Carte : {tourMetrics.mappedStops} sur {optimizedTourBusinesses.length} entreprises géocodées.
            La liste reste complète, mais la carte et l'ordre optimisé ne s'appuient que sur les adresses
            positionnées correctement.
          </Text>
        </View>
      ) : null}

      {showTourMap ? (
        <View style={styles.tourMapSection}>
          <TourMap businesses={mappedTourBusinesses} startLocation={inferredTourStartLocation} height={420} />
        </View>
      ) : null}
    </View>
  );
}

function ProgressPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.tourProgressPill}>
      <Text style={styles.tourProgressPillValue}>{value}</Text>
      <Text style={styles.tourProgressPillLabel}>{label}</Text>
    </View>
  );
}

function HalfDayCard({ title, businesses }: { title: string; businesses: TourBusiness[] }) {
  return (
    <View style={styles.tourHalfDayCard}>
      <Text style={styles.tourHalfDayTitle}>{title}</Text>
      <Text style={styles.tourHalfDayText}>
        {businesses.length
          ? businesses.slice(0, 3).map((business, index) => `${index + 1}. ${business.name}`).join(' • ')
          : 'Aucun arrêt prévu'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tourHeroCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  tourHeroHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  tourHeroTextBlock: { flex: 1 },
  tourHeroTitle: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 4 },
  tourHeroSubtitle: { fontSize: 15, color: '#64748B', lineHeight: 22 },
  tourHeroHeaderActions: { alignItems: 'flex-end', gap: 10 },
  manualVisiteHeaderButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999 },
  manualVisiteHeaderButtonText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  tourHeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999 },
  tourHeroBadgeActive: { backgroundColor: '#4F46E5' },
  tourHeroBadgeText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  tourHeroBadgeTextActive: { color: '#FFFFFF' },
  tourHeroStats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tourHeroStat: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  tourHeroStatValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  tourHeroStatLabel: { fontSize: 13, color: '#64748B', marginTop: 4 },
  tourHeroActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tourHeroPrimaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16A34A', paddingVertical: 14, borderRadius: 16 },
  tourHeroPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  tourHeroSecondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EEF2FF', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE' },
  tourHeroSecondaryBtnText: { color: '#4F46E5', fontWeight: '800', fontSize: 16 },
  tourStartCard: { backgroundColor: '#F8FAFC', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 16 },
  tourStartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  tourStartTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  tourStartSourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  tourStartSourceBadgeText: { color: '#4F46E5', fontSize: 12, fontWeight: '700' },
  tourStartSubtitle: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 12 },
  tourStartInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  tourStartLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  tourStartLoadingText: { color: '#4F46E5', fontSize: 13, fontWeight: '600' },
  tourStartSuggestions: { marginTop: 10, gap: 8 },
  tourStartSuggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  tourStartSuggestionText: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '600' },
  tourStartActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tourStartActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10 },
  tourStartActionText: { color: '#4F46E5', fontSize: 13, fontWeight: '700' },
  tourStartActionTextDanger: { color: '#B91C1C' },
  tourPlanningCard: { backgroundColor: '#F8FAFC', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 16, gap: 14 },
  tourPlanningHeader: { gap: 4 },
  tourPlanningTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  tourPlanningSubtitle: { fontSize: 14, color: '#64748B' },
  tourStopLimitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tourStopLimitBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  tourStopLimitBtnActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  tourStopLimitBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  tourStopLimitBtnTextActive: { color: '#FFFFFF' },
  tourPlanningStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tourPlanningStat: { flexGrow: 1, minWidth: 120, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  tourPlanningStatValue: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  tourPlanningStatLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
  tourProgressCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 12 },
  tourProgressHeader: { gap: 4 },
  tourProgressTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  tourProgressSubtitle: { fontSize: 13, color: '#64748B' },
  tourProgressGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tourProgressPill: { minWidth: 110, backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  tourProgressPillValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  tourProgressPillLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
  nextStopCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE', padding: 14, gap: 12 },
  nextStopHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  nextStopIndexBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  nextStopIndexText: { color: '#FFFFFF', fontWeight: '800' },
  nextStopContent: { flex: 1, gap: 3 },
  nextStopTitle: { fontSize: 13, color: '#6366F1', fontWeight: '700', textTransform: 'uppercase' },
  nextStopName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  nextStopMeta: { fontSize: 13, color: '#64748B' },
  nextStopActions: { flexDirection: 'row', gap: 10 },
  nextStopActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  nextStopActionText: { color: '#4F46E5', fontSize: 13, fontWeight: '700' },
  tourHalfDayGrid: { flexDirection: 'row', gap: 10 },
  tourHalfDayCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, gap: 6 },
  tourHalfDayTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  tourHalfDayText: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  tourPlannerNotice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 14, padding: 12, marginBottom: 14 },
  tourPlannerNoticeSuccess: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  tourPlannerNoticeWarning: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  tourPlannerNoticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#92400E', fontWeight: '600' },
  tourActionTextSuccess: { color: '#0F766E' },
  tourActionTextWarning: { color: '#B45309' },
  tourPreviewCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 14, gap: 6 },
  tourPreviewTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  tourPreviewSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  tourPreviewList: { gap: 10 },
  tourPreviewItem: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  tourPreviewIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' },
  tourPreviewIndexText: { color: '#3730A3', fontWeight: '800', fontSize: 12 },
  tourPreviewContent: { flex: 1 },
  tourPreviewName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  tourPreviewMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  tourMapSection: { marginBottom: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
});
