const SERVER_UTC_REGEX = /(Z|[+-]\d{2}:\d{2})$/i;

export const parseServerDate = (rawValue?: string | null): Date | null => {
  if (!rawValue) {
    return null;
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return null;
  }

  const normalized = SERVER_UTC_REGEX.test(trimmed)
    ? trimmed
    : `${trimmed.replace(' ', 'T')}Z`;

  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

export const formatServerDateTime = (rawValue?: string | null): string => {
  const parsedDate = parseServerDate(rawValue);
  if (!parsedDate) {
    return 'Heure inconnue';
  }

  return parsedDate.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
