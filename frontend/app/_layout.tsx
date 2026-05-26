import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { DataProvider } from '../contexts/DataContext';
import { ScanProvider } from '../context/ScanContext';
import { ToastProvider } from '../components/Toast';
import GlobalHeader from '../components/GlobalHeader';

export default function RootLayout() {
  const pathname = usePathname();
  
  // Don't show header on login, index (splash), and home (has its own header) pages
  const hideHeader = pathname === '/' || pathname === '/login' || pathname === '/index' || pathname === '/home';

  return (
    <DataProvider>
      <ScanProvider>
        <ToastProvider>
          <View style={styles.container}>
            {!hideHeader && <GlobalHeader />}
            <View style={styles.content}>
              <Stack 
                screenOptions={{ 
                  headerShown: false,
                  animation: 'slide_from_right',
                  animationDuration: 200,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="home" />
                <Stack.Screen name="dashboard" />
                <Stack.Screen name="scan-internet" />
                <Stack.Screen name="scan-pappers" />
                <Stack.Screen name="audit-site-externe" />
                <Stack.Screen name="newscan" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="pappersscan" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="webscan" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="results" />
                <Stack.Screen name="businessdetail" />
                <Stack.Screen name="admin" />
                <Stack.Screen name="visites" />
                <Stack.Screen name="visitedetail" />
                <Stack.Screen name="stats" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="surveillance" />
                <Stack.Screen name="duplicates" />
                <Stack.Screen name="crm" />
                <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="search" options={{ animation: 'fade' }} />
                <Stack.Screen name="credits" />
                <Stack.Screen name="export" />
                <Stack.Screen name="health" />
              </Stack>
            </View>
          </View>
        </ToastProvider>
      </ScanProvider>
    </DataProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  content: {
    flex: 1,
  },
});
