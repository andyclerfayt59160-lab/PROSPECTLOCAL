import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { API_URL } from '../utils/api';
import {
  AUDIT_PORTAL_HOME_ROUTE,
  AUDIT_PORTAL_LOGIN_ROUTE,
  clearStoredSession,
  getStoredUserProfile,
  persistAuthenticatedUser,
  validateStoredSession,
} from '../utils/authHelpers';

const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

export default function PortailAuditSitesLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [token, rememberedEmail] = await AsyncStorage.multiGet(['token', REMEMBERED_EMAIL_KEY]);
        if (rememberedEmail?.[1]) {
          setEmail(rememberedEmail[1]);
        }

        const sessionUser = token?.[1] ? await validateStoredSession() : null;
        if (sessionUser) {
          router.replace(AUDIT_PORTAL_HOME_ROUTE);
          return;
        }
      } catch (error) {
        console.error('Portal login restore error:', error);
      } finally {
        setBooting(false);
      }
    };

    restoreSession();
  }, [router]);

  const showInlineError = (message: string) => {
    setErrorMessage(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Erreur', message);
    }
  };

  const handleLogin = async () => {
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      showInlineError('Renseigne ton adresse email et ton mot de passe.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email: email.trim(),
        password,
      });

      await AsyncStorage.setItem('token', response.data.access_token);
      await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      await persistAuthenticatedUser(response.data.user, email.trim());
      router.replace(AUDIT_PORTAL_HOME_ROUTE);
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Connexion impossible pour le moment.';
      showInlineError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutCurrentSession = async () => {
    await clearStoredSession();
    setPassword('');
    setErrorMessage('');
    const storedUser = await getStoredUserProfile();
    if (!storedUser) {
      router.replace(AUDIT_PORTAL_LOGIN_ROUTE);
    }
  };

  if (booting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.heroCard}>
          <ProspectLocalLogo size={84} variant="icon" />
          <Text style={styles.heroTitle}>Portail Audit Sites</Text>
          <Text style={styles.heroSubtitle}>
            Portail separe pour lancer des audits de sites externes, configurer ses propres API et exporter les resultats.
          </Text>
          <View style={styles.heroList}>
            <View style={styles.heroBullet}>
              <Ionicons name="checkmark-circle" size={16} color="#4F46E5" />
              <Text style={styles.heroBulletText}>Connexion par email et mot de passe fournis</Text>
            </View>
            <View style={styles.heroBullet}>
              <Ionicons name="key-outline" size={16} color="#4F46E5" />
              <Text style={styles.heroBulletText}>Onboarding personnel avec tes propres cles API</Text>
            </View>
            <View style={styles.heroBullet}>
              <Ionicons name="download-outline" size={16} color="#4F46E5" />
              <Text style={styles.heroBulletText}>Lancement d'audits et export Excel sans acces au reste de l'application</Text>
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Connexion au portail</Text>
          <Text style={styles.formSubtitle}>
            Saisis tes identifiants pour acceder a l'espace d'audit de sites externes.
          </Text>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#B91C1C" />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Ionicons name="mail-outline" size={18} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="Adresse email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Ionicons name="lock-closed-outline" size={18} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              textContentType="password"
              editable={!loading}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeButton}>
              <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Entrer dans le portail</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleLogoutCurrentSession}>
            <Ionicons name="refresh-outline" size={16} color="#4F46E5" />
            <Text style={styles.secondaryButtonText}>Repartir sur une session propre</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2FF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
    gap: 18,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
  heroList: {
    gap: 10,
  },
  heroBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroBulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 4,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
});
