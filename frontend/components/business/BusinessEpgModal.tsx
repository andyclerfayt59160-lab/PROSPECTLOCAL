import React from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type BusinessEpgModalProps = {
  visible: boolean;
  business: any;
  styles: any;
  copiedField: string | null;
  enrichingSiret: boolean;
  onClose: () => void;
  onCopy: (text: string, fieldName: string) => void;
  onCopyAll: () => void;
  onEnrichSiret: () => void;
  openExternalLink: (url: string) => void;
};

type EpgFieldProps = {
  label: string;
  value: string;
  copyKey: string;
  copiedField: string | null;
  styles: any;
  onCopy: (text: string, fieldName: string) => void;
  selectable?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
};

function EpgFieldRow({
  label,
  value,
  copyKey,
  copiedField,
  styles,
  onCopy,
  selectable = false,
  disabled = false,
  children,
}: EpgFieldProps) {
  const isCopied = copiedField === copyKey;

  return (
    <View style={styles.epgFieldRow}>
      <View style={styles.epgFieldInfo}>
        <Text style={styles.epgFieldLabel}>{label}</Text>
        <Text style={styles.epgFieldValue} selectable={selectable}>
          {value}
        </Text>
        {children}
      </View>
      <TouchableOpacity
        style={[styles.epgCopyBtn, isCopied && styles.epgCopyBtnSuccess]}
        onPress={() => onCopy(value === 'Non disponible' ? '' : value, copyKey)}
        disabled={disabled}
      >
        <Ionicons
          name={isCopied ? 'checkmark' : 'copy-outline'}
          size={18}
          color={isCopied ? '#FFF' : disabled ? '#CCC' : '#6366F1'}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function BusinessEpgModal({
  visible,
  business,
  styles,
  copiedField,
  enrichingSiret,
  onClose,
  onCopy,
  onCopyAll,
  onEnrichSiret,
  openExternalLink,
}: BusinessEpgModalProps) {
  const fullAddress =
    [business?.address, business?.postal_code, business?.city].filter(Boolean).join(' ') ||
    'Non disponible';
  const salesforceUrl = 'https://solocal.lightning.force.com/lightning/n/Creation_EPJ';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.epgModalContent}>
          <View style={styles.epgModalHeader}>
        <Text style={styles.epgModalTitle}>Création EPJ</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
          </View>

          <Text style={styles.epgModalSubtitle}>
          Informations à copier pour la création de la fiche
          </Text>

          <EpgFieldRow
            label="Nom"
            value={business?.name || 'N/A'}
            copyKey="name"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
          />

          <View style={styles.epgFieldRow}>
            <View style={styles.epgFieldInfo}>
              <Text style={styles.epgFieldLabel}>SIRET</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.epgFieldValue}>{business?.siret || 'Non disponible'}</Text>
                {business?.siret_verification_status === 'warning' && (
                  <View style={styles.siretWarningBadge}>
                    <Text style={styles.siretWarningText}>VERIF</Text>
                  </View>
                )}
              </View>
              {business?.libelle_naf && (
                <Text style={styles.epgFieldSubLabel}>NAF: {business.libelle_naf}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!business?.siret && (
                <TouchableOpacity
                  style={styles.siretSearchBtn}
                  onPress={onEnrichSiret}
                  disabled={enrichingSiret}
                >
                  {enrichingSiret ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="search" size={18} color="#FFF" />
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.epgCopyBtn, copiedField === 'siret' && styles.epgCopyBtnSuccess]}
                onPress={() => onCopy(business?.siret || '', 'siret')}
                disabled={!business?.siret}
              >
                <Ionicons
                  name={copiedField === 'siret' ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copiedField === 'siret' ? '#FFF' : business?.siret ? '#6366F1' : '#CCC'}
                />
              </TouchableOpacity>
            </View>
          </View>

          <EpgFieldRow
            label="Adresse complete"
            value={fullAddress}
            copyKey="fulladdress"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
            selectable
            disabled={!business?.address && !business?.city}
          />

          <EpgFieldRow
            label="Rue"
            value={business?.address || 'Non disponible'}
            copyKey="address"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
            selectable
            disabled={!business?.address}
          />

          <EpgFieldRow
            label="Code postal"
            value={business?.postal_code || 'Non disponible'}
            copyKey="postal_code"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
            selectable
            disabled={!business?.postal_code}
          />

          <EpgFieldRow
            label="Ville"
            value={business?.city || 'Non disponible'}
            copyKey="city"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
            selectable
            disabled={!business?.city}
          />

          <EpgFieldRow
              label="Téléphone"
            value={business?.phone || 'Non disponible'}
            copyKey="phone"
            copiedField={copiedField}
            styles={styles}
            onCopy={onCopy}
            disabled={!business?.phone}
          />

          <TouchableOpacity
            style={[styles.epgCopyAllBtn, copiedField === 'all' && styles.epgCopyAllBtnSuccess]}
            onPress={onCopyAll}
          >
            <Ionicons
              name={copiedField === 'all' ? 'checkmark-circle' : 'clipboard-outline'}
              size={20}
              color="#FFF"
            />
            <Text style={styles.epgCopyAllBtnText}>
              {copiedField === 'all' ? 'Copie !' : 'Copier tout'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.epgSalesforceBtn}
            onPress={() => openExternalLink(salesforceUrl)}
          >
            <View style={styles.epgSalesforceBtnIcon}>
              <Text style={styles.epgSalesforceBtnIconText}>SF</Text>
            </View>
            <Text style={styles.epgSalesforceBtnText}>Ouvrir Salesforce (Création EPJ)</Text>
            <Ionicons name="open-outline" size={18} color="#0176D3" />
          </TouchableOpacity>

          <Text style={styles.epgSalesforceNote}>
            Copiez les champs ci-dessus puis collez-les dans Salesforce
          </Text>
        </View>
      </View>
    </Modal>
  );
}
