import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="newscan" />
      <Stack.Screen name="newscan-pappers" />
      <Stack.Screen name="results" />
      <Stack.Screen name="businessdetail" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="visites" />
      <Stack.Screen name="visitedetail" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
