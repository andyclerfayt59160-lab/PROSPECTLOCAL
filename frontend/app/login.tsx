import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';
import { useToast } from '../components/Toast';

import { API_URL } from '../utils/api';
import { validateStoredSession } from '../utils/authHelpers';
const REMEMBERED_EMAIL_KEY = 'rememberedEmail';

function AuthFormShell({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: (event?: any) => void;
}) {
  if (Platform.OS === 'web') {
    return (
      <form onSubmit={onSubmit} style={{ width: '100%' }}>
        {children}
      </form>
    );
  }

  return <View>{children}</View>;
}

export default function LoginScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [token, rememberedEmail] = await AsyncStorage.multiGet(['token', REMEMBERED_EMAIL_KEY]);
        const tokenValue = token?.[1];
        const emailValue = rememberedEmail?.[1];

        if (emailValue) {
          setEmail(emailValue);
        }

        if (tokenValue && (await validateStoredSession())) {
          router.replace('/home');
        }
      } catch (error) {
        console.error('Login restore error:', error);
      }
    };

    restoreSession();
  }, [router]);

  const clearFeedback = () => {
    setErrorMessage('');
  };

  const showInlineError = (message: string) => {
    setErrorMessage(message);
    showToast(message, 'error');
    if (Platform.OS !== 'web') {
      Alert.alert('Erreur', message);
    }
  };

  const handleSubmit = async (event?: any) => {
    event?.preventDefault?.();
    clearFeedback();

    if (!email || !password) {
      showInlineError('Veuillez remplir tous les champs.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showInlineError('Veuillez entrer une adresse email valide.');
      return;
    }

    if (!isLogin && password.length < 6) {
      showInlineError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`${API_URL}${endpoint}`, {
        email,
        password,
      });

      if (isLogin && response.data.access_token) {
        await AsyncStorage.multiSet([
          ['token', response.data.access_token],
          ['user', JSON.stringify(response.data.user)],
          [REMEMBERED_EMAIL_KEY, email],
          ['userEmail', response.data.user?.email || email],
          ['userName', response.data.user?.name || response.data.user?.email || email],
        ]);
        router.replace('/home');
        return;
      }

      if (!isLogin && response.data.success) {
        showToast('Demande d’inscription envoyée.', 'success');
        setRegistrationSuccess(true);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Une erreur est survenue.';
      showInlineError(message);
    } finally {
      setLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#34C759" />
          </View>
          <Text style={styles.successTitle}>Demande envoyée !</Text>
          <Text style={styles.successMessage}>
            Votre demande d&apos;inscription a bien été enregistrée.
          </Text>
          <Text style={styles.successSubMessage}>
            Un administrateur validera votre accès prochainement. Vous recevrez une confirmation
            dès que votre compte sera activé.
          </Text>
          <View style={styles.successEmail}>
            <Ionicons name="mail" size={20} color="#6366F1" />
            <Text style={styles.successEmailText}>{email}</Text>
          </View>
          <TouchableOpacity
            style={styles.backToLoginButton}
            onPress={() => {
              setRegistrationSuccess(false);
              setIsLogin(true);
              setEmail('');
              setPassword('');
              clearFeedback();
            }}
          >
            <Text style={styles.backToLoginText}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <ProspectLocalLogo size={120} variant="full" />
          <Text style={styles.title}>PROSPECTLOCAL V2</Text>
          <Text style={styles.subtitle}>Détecteur d&apos;opportunités locales</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>{isLogin ? 'Connexion' : 'Inscription'}</Text>

          <AuthFormShell onSubmit={handleSubmit}>
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Ionicons name="mail-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (errorMessage) {
                    clearFeedback();
                  }
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor="#999"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errorMessage) {
                    clearFeedback();
                  }
                }}
                secureTextEntry={!showPassword}
                editable={!loading}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                textContentType={isLogin ? 'password' : 'newPassword'}
                returnKeyType="go"
                onSubmitEditing={() => handleSubmit()}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={22}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => handleSubmit()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Se connecter' : "S'inscrire"}
                </Text>
              )}
            </TouchableOpacity>
          </AuthFormShell>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsLogin(!isLogin);
              clearFeedback();
            }}
            disabled={loading}
          >
            <Text style={styles.switchText}>
              {isLogin ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="shield-checkmark" size={14} color="#666" />
          <Text style={styles.footerText}>Connexion sécurisée</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginTop: 20,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6366F1',
    marginTop: 8,
    fontWeight: '500',
  },
  form: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  eyeButton: {
    padding: 8,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1C1C1E',
    paddingVertical: 12,
  },
  button: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#6366F1',
    fontSize: 14,
  },
  footerRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F5F7',
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 300,
  },
  successEmail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 32,
  },
  successEmailText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
  },
  backToLoginButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  backToLoginText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
