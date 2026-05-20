export interface RoutePoint {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface TourMetrics {
  stops: number;
  mappedStops: number;
  totalDistanceKm: number;
  averageLegKm: number;
}

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const hasCoordinates = (point: RoutePoint): boolean =>
  typeof point.latitude === 'number' && typeof point.longitude === 'number';

export const optimizeTourOrder = <T extends RoutePoint>(
  points: T[],
  startLocation: UserLocation
): T[] => {
  if (points.length <= 1) {
    return points;
  }

  const pointsWithCoordinates = points.filter(hasCoordinates) as T[];
  const pointsWithoutCoordinates = points.filter((point) => !hasCoordinates(point));

  if (!pointsWithCoordinates.length) {
    return points;
  }

  const remaining = [...pointsWithCoordinates];
  const ordered: T[] = [];
  let currentLat = startLocation.latitude;
  let currentLon = startLocation.longitude;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((point, index) => {
      const distance = calculateDistance(
        currentLat,
        currentLon,
        point.latitude as number,
        point.longitude as number
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const nearest = remaining.splice(nearestIndex, 1)[0];
    ordered.push(nearest);
    currentLat = nearest.latitude as number;
    currentLon = nearest.longitude as number;
  }

  return [...ordered, ...pointsWithoutCoordinates];
};

export const calculateTourMetrics = <T extends RoutePoint>(
  points: T[],
  startLocation?: UserLocation | null
): TourMetrics => {
  const mappedPoints = points.filter(hasCoordinates);

  if (!mappedPoints.length || !startLocation) {
    return {
      stops: points.length,
      mappedStops: mappedPoints.length,
      totalDistanceKm: 0,
      averageLegKm: 0,
    };
  }

  const ordered = optimizeTourOrder(mappedPoints, startLocation);
  let totalDistanceKm = 0;
  let currentLat = startLocation.latitude;
  let currentLon = startLocation.longitude;

  ordered.forEach((point) => {
    totalDistanceKm += calculateDistance(
      currentLat,
      currentLon,
      point.latitude as number,
      point.longitude as number
    );
    currentLat = point.latitude as number;
    currentLon = point.longitude as number;
  });

  return {
    stops: points.length,
    mappedStops: mappedPoints.length,
    totalDistanceKm,
    averageLegKm: ordered.length ? totalDistanceKm / ordered.length : 0,
  };
};

export const buildGoogleMapsDirectionsUrl = <T extends RoutePoint>(
  points: T[],
  startLocation?: UserLocation | null
): string | null => {
  const orderedStops = startLocation ? optimizeTourOrder(points, startLocation) : points;
  const usableStops = orderedStops.filter((point) => point.address || hasCoordinates(point));

  if (!usableStops.length) {
    return null;
  }

  const stopToQuery = (point: RoutePoint): string => {
    if (point.address) {
      return encodeURIComponent(
        [point.address, point.postal_code, point.city].filter(Boolean).join(', ')
      );
    }

    return encodeURIComponent(`${point.latitude},${point.longitude}`);
  };

  const destination = stopToQuery(usableStops[usableStops.length - 1]);
  const waypoints = usableStops.slice(0, -1).map(stopToQuery).slice(0, 8);
  const origin = startLocation
    ? `${startLocation.latitude},${startLocation.longitude}`
    : decodeURIComponent(stopToQuery(usableStops[0]));

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });

  if (waypoints.length) {
    params.append('waypoints', waypoints.join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
