import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ModalOption = {
  value: string;
  label: string;
  icon: string;
  color?: string;
};

type CrmInteraction = {
  id: string;
  interaction_type: string;
  title?: string;
  content?: string;
  created_at: string;
};

type CrmModalsProps = {
  styles: any;
  selectedBusiness: any;
  showStatusModal: boolean;
  showInteractionModal: boolean;
  showHistoryModal: boolean;
  changingStatus: boolean;
  savingInteraction: boolean;
  loadingHistory: boolean;
  deletingInteractionId: string | null;
  interactionType: string;
  interactionNote: string;
  interactionCallbackDate: string;
  interactions: CrmInteraction[];
  salesStatuses: ModalOption[];
  interactionTypes: ModalOption[];
  onCloseStatusModal: () => void;
  onCloseInteractionModal: () => void;
  onCloseHistoryModal: () => void;
  onUpdateStatus: (value: string) => void;
  onSetInteractionType: (value: string) => void;
  onSetInteractionNote: (value: string) => void;
  onSetInteractionCallbackDate: (value: string) => void;
  onSaveInteraction: () => void;
  onDeleteInteraction: (interaction: CrmInteraction) => void;
  formatDate: (value: string) => string;
};

export default function CrmModals({
  styles,
  selectedBusiness,
  showStatusModal,
  showInteractionModal,
  showHistoryModal,
  changingStatus,
  savingInteraction,
  loadingHistory,
  deletingInteractionId,
  interactionType,
  interactionNote,
  interactionCallbackDate,
  interactions,
  salesStatuses,
  interactionTypes,
  onCloseStatusModal,
  onCloseInteractionModal,
  onCloseHistoryModal,
  onUpdateStatus,
  onSetInteractionType,
  onSetInteractionNote,
  onSetInteractionCallbackDate,
  onSaveInteraction,
  onDeleteInteraction,
  formatDate,
}: CrmModalsProps) {
  return (
    <>
      <Modal visible={showStatusModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Changer le statut</Text>
              <TouchableOpacity onPress={onCloseStatusModal}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>{selectedBusiness?.name}</Text>

            <ScrollView style={styles.statusList}>
              {salesStatuses.map((status) => (
                <TouchableOpacity
                  key={status.value}
                  style={[
                    styles.statusOption,
                    selectedBusiness?.sales_status === status.value && styles.statusOptionSelected,
                  ]}
                  onPress={() => onUpdateStatus(status.value)}
                  disabled={changingStatus}
                >
                  <View style={[styles.statusOptionIcon, { backgroundColor: `${status.color || '#6366F1'}20` }]}>
                    <Ionicons name={status.icon as any} size={18} color={status.color || '#6366F1'} />
                  </View>
                  <Text style={styles.statusOptionLabel}>{status.label}</Text>
                  {selectedBusiness?.sales_status === status.value && (
                    <Ionicons name="checkmark" size={20} color={status.color || '#6366F1'} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showInteractionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter une interaction</Text>
              <TouchableOpacity onPress={onCloseInteractionModal}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>{selectedBusiness?.name}</Text>

            <View style={styles.interactionTypes}>
              {interactionTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.interactionTypeBtn,
                    interactionType === type.value && styles.interactionTypeBtnSelected,
                  ]}
                  onPress={() => onSetInteractionType(type.value)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={16}
                    color={interactionType === type.value ? '#FFF' : '#666'}
                  />
                  <Text
                    style={[
                      styles.interactionTypeText,
                      interactionType === type.value && styles.interactionTypeTextSelected,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Notes de l'interaction..."
              value={interactionNote}
              onChangeText={onSetInteractionNote}
              multiline
              numberOfLines={4}
            />

            <TextInput
              style={styles.callbackInput}
              placeholder="Rappel (optionnel) : 2026-04-27 15:30"
              value={interactionCallbackDate}
              onChangeText={onSetInteractionCallbackDate}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.saveBtn, savingInteraction && styles.saveBtnDisabled]}
              onPress={onSaveInteraction}
              disabled={savingInteraction || !interactionNote.trim()}
            >
              {savingInteraction ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showHistoryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.historyModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Historique</Text>
              <TouchableOpacity onPress={onCloseHistoryModal}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>{selectedBusiness?.name}</Text>

            {loadingHistory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
              </View>
            ) : interactions.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Ionicons name="document-text-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>Aucune interaction enregistrée</Text>
              </View>
            ) : (
              <ScrollView style={styles.historyList}>
                {interactions.map((interaction) => {
                  const typeInfo = interactionTypes.find((type) => type.value === interaction.interaction_type);
                  return (
                    <View key={interaction.id} style={styles.historyItem}>
                      <View style={styles.historyIcon}>
                        <Ionicons name={(typeInfo?.icon || 'document') as any} size={16} color="#6366F1" />
                      </View>
                      <View style={styles.historyContent}>
                        <Text style={styles.historyTitle}>{interaction.title || typeInfo?.label}</Text>
                        {interaction.content ? (
                          <Text style={styles.historyNote}>{interaction.content}</Text>
                        ) : null}
                        <Text style={styles.historyDate}>{formatDate(interaction.created_at)}</Text>
                        <View style={styles.historyActionsRow}>
                          <TouchableOpacity
                            style={[styles.historyActionBtn, styles.historyActionBtnDanger]}
                            onPress={() => onDeleteInteraction(interaction)}
                            disabled={deletingInteractionId === interaction.id}
                          >
                            {deletingInteractionId === interaction.id ? (
                              <ActivityIndicator size="small" color="#B91C1C" />
                            ) : (
                              <>
                                <Ionicons name="trash-outline" size={14} color="#B91C1C" />
                                <Text style={styles.historyActionTextDanger}>Supprimer</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={onCloseHistoryModal}>
              <Text style={styles.closeBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
