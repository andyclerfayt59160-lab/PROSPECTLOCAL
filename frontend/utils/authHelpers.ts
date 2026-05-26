import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';

import { API_URL } from './api';

const SESSION_STORAGE_KEYS = ['token', 'user', 'userName', 'userEmail'];

export async function clearStoredSession() {
  await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS);
}

export function redirectToLogin(router?: { replace: (path: string) => void }) {
  if (router) {
    router.replace('/login');
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export async function checkAuth() {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    redirectToLogin();
    return false;
  }
  return true;
}

export async function validateStoredSession(router?: { replace: (path: string) => void }) {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    redirectToLogin(router);
    return false;
  }

  try {
    await axios.get(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch (error: any) {
    const wasAuthError = await handleAuthError(error, true, router);
    if (wasAuthError) {
      return false;
    }

    // En cas de souci réseau temporaire, on évite de déconnecter l'utilisateur.
    return true;
  }
}

export async function handleAuthError(
  error: any,
  shouldRedirectToLogin = false,
  router?: { replace: (path: string) => void }
) {
  const status = error?.response?.status;
  const isAuthError = status === 401 || status === 403;

  if (!isAuthError) {
    return false;
  }

  await clearStoredSession();

  if (shouldRedirectToLogin) {
    redirectToLogin(router);
  }

  return true;
}
