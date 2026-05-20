import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  hasCoordinates,
  type RoutePoint,
  type UserLocation,
} from '../utils/tourPlanning';

interface TourMapProps<T extends RoutePoint> {
  businesses: T[];
  startLocation?: UserLocation | null;
  height?: number;
}

const buildMapHtml = <T extends RoutePoint>(
  businesses: T[],
  startLocation?: UserLocation | null
): string => {
  const markers = businesses
    .filter(hasCoordinates)
    .map((business, index) => ({
      id: business.id,
      name: business.name,
      address: [business.address, business.postal_code, business.city]
        .filter(Boolean)
        .join(', '),
      latitude: business.latitude,
      longitude: business.longitude,
      rank: index + 1,
    }));

  const center = startLocation
    ? [startLocation.latitude, startLocation.longitude]
    : markers.length
      ? [markers[0].latitude, markers[0].longitude]
      : [50.6292, 3.0573];

  const routePoints = startLocation
    ? [[startLocation.latitude, startLocation.longitude], ...markers.map((marker) => [marker.latitude, marker.longitude])]
    : markers.map((marker) => [marker.latitude, marker.longitude]);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map { height: 100%; margin: 0; background: #f8fafc; }
      .tour-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 13px;
        background: #4f46e5;
        color: white;
        font: 700 12px Arial, sans-serif;
        border: 2px solid white;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
      }
      .tour-start {
        background: #16a34a;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const center = ${JSON.stringify(center)};
      const markers = ${JSON.stringify(markers)};
      const routePoints = ${JSON.stringify(routePoints)};
      const hasStart = ${JSON.stringify(Boolean(startLocation))};

      const map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView(center, markers.length > 1 ? 10 : 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const bounds = [];

      if (hasStart) {
        const startIcon = L.divIcon({
          className: '',
          html: '<div class="tour-badge tour-start">D</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        L.marker(routePoints[0], { icon: startIcon })
          .addTo(map)
          .bindPopup('<strong>Départ</strong>');
        bounds.push(routePoints[0]);
      }

      markers.forEach((marker) => {
        const icon = L.divIcon({
          className: '',
          html: '<div class="tour-badge">' + marker.rank + '</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        L.marker([marker.latitude, marker.longitude], { icon })
          .addTo(map)
          .bindPopup('<strong>' + marker.rank + '. ' + marker.name + '</strong><br />' + (marker.address || 'Adresse non disponible'));

        bounds.push([marker.latitude, marker.longitude]);
      });

      if (routePoints.length > 1) {
        L.polyline(routePoints, {
          color: '#4f46e5',
          weight: 4,
          opacity: 0.7
        }).addTo(map);
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    </script>
  </body>
</html>`;
};

export function TourMap<T extends RoutePoint>({
  businesses,
  startLocation,
  height = 320,
}: TourMapProps<T>) {
  const mappedBusinesses = useMemo(
    () => businesses.filter(hasCoordinates),
    [businesses]
  );

  const html = useMemo(
    () => buildMapHtml(mappedBusinesses, startLocation),
    [mappedBusinesses, startLocation]
  );

  if (!mappedBusinesses.length) {
    return (
      <View style={[styles.emptyState, { height }]}>
        <Text style={styles.emptyTitle}>Carte indisponible</Text>
        <Text style={styles.emptyText}>
          Aucune coordonnée exploitable pour afficher la tournée.
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return React.createElement('iframe', {
      srcDoc: html,
      style: {
        width: '100%',
        height,
        border: 'none',
        borderRadius: 18,
        backgroundColor: '#f8fafc',
      },
      sandbox: 'allow-scripts allow-same-origin allow-popups',
    });
  }

  return (
    <View style={styles.nativeWrapper}>
      <WebView
        source={{ html }}
        style={{ height, borderRadius: 18 }}
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nativeWrapper: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#f8fafc',
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
