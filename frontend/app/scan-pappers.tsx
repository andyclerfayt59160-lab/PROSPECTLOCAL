import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function LegacyScanPappersRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    // Keep legacy links alive while routing every Pappers workflow
    // through the single maintained screen.
    router.replace({
      pathname: '/pappersscan',
      params,
    });
  }, [params, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FC',
  },
});
