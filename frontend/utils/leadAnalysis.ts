type PhoneAnalysis = {
  type: 'mobile' | 'local' | 'national' | 'voip' | 'unknown';
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
  source?: string;
  warning?: string;
};

type FreshnessAnalysis = {
  freshness: 'new' | 'recent' | 'aging' | 'old' | 'unknown';
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
};

export const CONTACT_STATUSES = [
  { value: 'not_contacted', label: 'Non contacté', color: '#64748B' },
  { value: 'contacted', label: 'Contacté', color: '#2563EB' },
  { value: 'interested', label: 'Intéressé', color: '#059669' },
  { value: 'not_interested', label: 'Pas intéressé', color: '#DC2626' },
];

export function getContactStatusInfo(status?: string) {
  return (
    CONTACT_STATUSES.find((item) => item.value === status) || {
      value: 'not_contacted',
      label: 'Non contacté',
      color: '#64748B',
    }
  );
}

function normalizePhone(phone?: string | null) {
  return (phone || '').replace(/\s+/g, '').replace(/[().-]/g, '');
}

export function analyzePhoneQuality(
  phone?: string | null,
  phoneSource?: string | null,
  phoneConfidence?: string | number | null,
): PhoneAnalysis {
  const normalized = normalizePhone(phone);

  if (!normalized) {
    return {
      type: 'unknown',
      label: 'Sans téléphone',
      description: 'Aucun numéro exploitable n’a été détecté sur cette fiche.',
      color: '#DC2626',
      bgColor: '#FEE2E2',
      icon: 'close-circle-outline',
    };
  }

  const source = phoneSource ? String(phoneSource) : undefined;
  const confidence = phoneConfidence ? String(phoneConfidence).toLowerCase() : '';
  const startsMobile = /^(\+33|0033|0)?[67]/.test(normalized);
  const startsGeo = /^(\+33|0033|0)?[1-5]/.test(normalized);
  const startsVoip = /^(\+33|0033|0)?9/.test(normalized);

  let analysis: PhoneAnalysis;

  if (startsMobile) {
    analysis = {
      type: 'mobile',
      label: 'Mobile',
      description: 'Numéro mobile généralement joignable rapidement.',
      color: '#2563EB',
      bgColor: '#DBEAFE',
      icon: 'phone-portrait-outline',
      source,
    };
  } else if (startsGeo) {
    analysis = {
      type: 'local',
      label: 'Ligne locale',
      description: 'Numéro fixe local intéressant pour une prise de contact commerciale.',
      color: '#059669',
      bgColor: '#D1FAE5',
      icon: 'call-outline',
      source,
    };
  } else if (startsVoip) {
    analysis = {
      type: 'voip',
      label: 'VoIP / 09',
      description: 'Numéro potentiellement moins qualifié qu’une ligne fixe locale.',
      color: '#7C3AED',
      bgColor: '#EDE9FE',
      icon: 'headset-outline',
      source,
    };
  } else {
    analysis = {
      type: 'national',
      label: 'Numéro national',
      description: 'Numéro valide mais sans signal local fort.',
      color: '#B45309',
      bgColor: '#FEF3C7',
      icon: 'call-outline',
      source,
    };
  }

  if ((source || '').toLowerCase().includes('pappers')) {
    analysis.warning = 'Données légales - peut être obsolète';
  } else if (confidence && ['low', 'faible', 'uncertain'].includes(confidence)) {
    analysis.warning = 'Fiabilité limitée';
  }

  return analysis;
}

export function analyzeLeadFreshness(dateCreation?: string | null): FreshnessAnalysis {
  if (!dateCreation) {
    return {
      freshness: 'unknown',
      label: 'Date inconnue',
      description: 'La date de création n’est pas disponible.',
      color: '#64748B',
      bgColor: '#F1F5F9',
      icon: 'help-circle-outline',
    };
  }

  const created = new Date(dateCreation);
  if (Number.isNaN(created.getTime())) {
    return {
      freshness: 'unknown',
      label: 'Date invalide',
      description: 'La date de création ne peut pas être interprétée.',
      color: '#64748B',
      bgColor: '#F1F5F9',
      icon: 'help-circle-outline',
    };
  }

  const ageDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 90) {
    return {
      freshness: 'new',
      label: 'Très récent',
      description: `Entreprise créée il y a ${ageDays} jour(s), excellente fenêtre de prospection.`,
      color: '#16A34A',
      bgColor: '#DCFCE7',
      icon: 'sparkles-outline',
    };
  }

  if (ageDays <= 180) {
    return {
      freshness: 'recent',
      label: 'Récent',
      description: `Entreprise créée il y a ${ageDays} jour(s), encore très intéressante.`,
      color: '#65A30D',
      bgColor: '#ECFCCB',
      icon: 'time-outline',
    };
  }

  if (ageDays <= 365) {
    return {
      freshness: 'aging',
      label: 'Moins d’un an',
      description: `Entreprise créée il y a ${ageDays} jour(s).`,
      color: '#D97706',
      bgColor: '#FEF3C7',
      icon: 'calendar-outline',
    };
  }

  return {
    freshness: 'old',
    label: 'Ancienne',
    description: `Entreprise créée il y a ${ageDays} jour(s), priorité plus faible.`,
    color: '#6B7280',
    bgColor: '#E5E7EB',
    icon: 'archive-outline',
  };
}
