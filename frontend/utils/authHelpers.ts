import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';

import { API_URL } from './api';

const SESSION_STORAGE_KEYS = ['token', 'user', 'userName', 'userEmail'];

export type AccessScope = 'full' | 'external_site_audit_only';

export interface StoredUserProfile {
  id?: string;
  email?: string;
  role?: 'admin' | 'user';
  access_scope?: AccessScope | string;
  name?: string;
}

export const AUDIT_PORTAL_HOME_ROUTE = '/portail-audit-sites';
export const AUDIT_PORTAL_LOGIN_ROUTE = '/portail-audit-sites-login';

export function normalizeAccessScope(value?: string | null): AccessScope {
  return value === 'external_site_audit_only' ? 'external_site_audit_only' : 'full';
}

export function isExternalAuditOnlyUser(user?: StoredUserProfile | null) {
  return normalizeAccessScope(user?.access_scope) === 'external_site_audit_only';
}

export function getDefaultRouteForUser(user?: StoredUserProfile | null) {
  return isExternalAuditOnlyUser(user) ? AUDIT_PORTAL_HOME_ROUTE : '/home';
}

export function isAllowedForExternalAuditPortal(pathname?: string | null) {
  const currentPath = (pathname || '').split('?')[0];
  return [
    AUDIT_PORTAL_HOME_ROUTE,
    AUDIT_PORTAL_LOGIN_ROUTE,
    '/audit-site-externe',
    '/settings',
  ].includes(currentPath);
}

export async function persistAuthenticatedUser(user: StoredUserProfile, fallbackEmail?: string) {
  const email = user?.email || fallbackEmail || '';
  const name = user?.name || email;

  await AsyncStorage.multiSet([
    ['user', JSON.stringify(user)],
    ['userEmail', email],
    ['userName', name],
  ]);
}

export async function getStoredUserProfile(): Promise<StoredUserProfile | null> {
  const rawUser = await AsyncStorage.getItem('user');
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch (error) {
    console.error('Unable to parse stored user profile:', error);
    return null;
  }
}

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
    const response = await axios.get(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.data) {
      await persistAuthenticatedUser(response.data);
    }
    return response.data;
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
