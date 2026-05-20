import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export async function checkAuth() {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return false;
  }
  return true;
}

export async function handleAuthError(error: any, redirectToLogin = false) {
  const status = error?.response?.status;
  const isAuthError = status === 401 || status === 403;

  if (!isAuthError) {
    return false;
  }

  await AsyncStorage.multiRemove(['token', 'user', 'userName', 'userEmail']);

  if (redirectToLogin && Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = '/login';
  }

  return true;
}
