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

type AddressSuggestion = {
  label: string;
  postal_code: string;
  city: string;
};

type ManualVisiteForm = {
  name: string;
  address: string;
  postal_code: string;
  city: string;
  phone: string;
  siret: string;
  note: string;
};

type ManualVisiteModalProps = {
  visible: boolean;
  creatingManualVisite: boolean;
  manualVisiteForm: ManualVisiteForm;
  loadingAddressSuggestions: boolean;
  addressSuggestions: AddressSuggestion[];
  styles: any;
  onClose: () => void;
  onChangeField: (field: keyof ManualVisiteForm, value: string) => void;
  onSelectAddressSuggestion: (suggestion: AddressSuggestion) => void;
  onSubmit: () => void;
};

export default function ManualVisiteModal({
  visible,
  creatingManualVisite,
  manualVisiteForm,
  loadingAddressSuggestions,
  addressSuggestions,
  styles,
  onClose,
  onChangeField,
  onSelectAddressSuggestion,
  onSubmit,
}: ManualVisiteModalProps) {
  const safeClose = () => {
    if (!creatingManualVisite) {
      onClose();
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={safeClose}
    >
      <View style={styles.manualVisiteModalOverlay}>
        <View style={styles.manualVisiteModalCard}>
          <View style={styles.manualVisiteModalHeader}>
            <View>
              <Text style={styles.manualVisiteModalTitle}>Nouvelle visite terrain</Text>
              <Text style={styles.manualVisiteModalSubtitle}>
                Ajoute une opportunité repérée manuellement à la même tournée que tes
                autres visites.
              </Text>
            </View>
            <TouchableOpacity style={styles.manualVisiteModalClose} onPress={safeClose}>
              <Ionicons name="close" size={22} color="#111827" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.manualVisiteModalBody}
            contentContainerStyle={styles.manualVisiteModalBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <View style={styles.manualVisiteFieldBlock}>
              <Text style={styles.manualVisiteFieldLabel}>Nom de l'entreprise</Text>
              <TextInput
                value={manualVisiteForm.name}
                onChangeText={(value) => onChangeField('name', value)}
                placeholder="Ex: Atelier Dupont"
                style={styles.manualVisiteInput}
              />
            </View>

            <View style={styles.manualVisiteFieldBlock}>
              <Text style={styles.manualVisiteFieldLabel}>Adresse</Text>
              <TextInput
                value={manualVisiteForm.address}
                onChangeText={(value) => onChangeField('address', value)}
                placeholder="Ex: 12 rue des Artisans"
                style={styles.manualVisiteInput}
              />
              {loadingAddressSuggestions ? (
                <View style={styles.addressSuggestionLoading}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text style={styles.addressSuggestionLoadingText}>
                    Recherche d'adresses...
                  </Text>
                </View>
              ) : null}
              {addressSuggestions.length ? (
                <View style={styles.addressSuggestionsList}>
                  {addressSuggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={`${suggestion.label}-${suggestion.postal_code}`}
                      style={styles.addressSuggestionItem}
                      onPress={() => onSelectAddressSuggestion(suggestion)}
                    >
                      <Ionicons name="location-outline" size={16} color="#4F46E5" />
                      <View style={styles.addressSuggestionContent}>
                        <Text style={styles.addressSuggestionLabel}>{suggestion.label}</Text>
                        <Text style={styles.addressSuggestionMeta}>
                          {suggestion.postal_code} - {suggestion.city}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.manualVisiteFieldRow}>
              <View style={[styles.manualVisiteFieldBlock, styles.manualVisiteFieldHalf]}>
                <Text style={styles.manualVisiteFieldLabel}>Code postal</Text>
                <TextInput
                  value={manualVisiteForm.postal_code}
                  onChangeText={(value) => onChangeField('postal_code', value)}
                  placeholder="59000"
                  keyboardType="number-pad"
                  style={styles.manualVisiteInput}
                />
              </View>
              <View style={[styles.manualVisiteFieldBlock, styles.manualVisiteFieldHalf]}>
                <Text style={styles.manualVisiteFieldLabel}>Ville</Text>
                <TextInput
                  value={manualVisiteForm.city}
                  onChangeText={(value) => onChangeField('city', value)}
                  placeholder="Lille"
                  style={styles.manualVisiteInput}
                />
              </View>
            </View>

            <View style={styles.manualVisiteFieldRow}>
              <View style={[styles.manualVisiteFieldBlock, styles.manualVisiteFieldHalf]}>
                <Text style={styles.manualVisiteFieldLabel}>Téléphone</Text>
                <TextInput
                  value={manualVisiteForm.phone}
                  onChangeText={(value) => onChangeField('phone', value)}
                  placeholder="Optionnel"
                  keyboardType="phone-pad"
                  style={styles.manualVisiteInput}
                />
              </View>
              <View style={[styles.manualVisiteFieldBlock, styles.manualVisiteFieldHalf]}>
                <Text style={styles.manualVisiteFieldLabel}>SIRET</Text>
                <TextInput
                  value={manualVisiteForm.siret}
                  onChangeText={(value) => onChangeField('siret', value)}
                  placeholder="Optionnel"
                  keyboardType="number-pad"
                  style={styles.manualVisiteInput}
                />
              </View>
            </View>

            <View style={styles.manualVisiteFieldBlock}>
              <Text style={styles.manualVisiteFieldLabel}>Note</Text>
              <TextInput
                value={manualVisiteForm.note}
                onChangeText={(value) => onChangeField('note', value)}
                placeholder="Contexte, contact repéré, point à vérifier..."
                multiline
                numberOfLines={4}
                style={[styles.manualVisiteInput, styles.manualVisiteTextarea]}
              />
            </View>
          </ScrollView>

          <View style={styles.manualVisiteModalActions}>
            <TouchableOpacity
              style={styles.manualVisiteCancelButton}
              onPress={safeClose}
              disabled={creatingManualVisite}
            >
              <Text style={styles.manualVisiteCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualVisiteSubmitButton}
              onPress={onSubmit}
              disabled={creatingManualVisite}
            >
              {creatingManualVisite ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="add" size={18} color="#FFF" />
              )}
              <Text style={styles.manualVisiteSubmitButtonText}>
                {creatingManualVisite ? 'Création...' : 'Créer la fiche'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
