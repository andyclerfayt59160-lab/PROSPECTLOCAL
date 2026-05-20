import React, { useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function NewPappersScanScreen() {
  const router = useRouter();
  const [codePostal, setCodePostal] = useState('');
  const [codeNaf, setCodeNaf] = useState('');
  const [dateCreationMin, setDateCreationMin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuickDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    setDateCreationMin(date.toISOString().slice(0, 10));
  };

  const handleSubmit = async () => {
    if (!/^\d{5}$/.test(codePostal.trim())) {
      Alert.alert('Erreur', 'Veuillez renseigner un code postal valide sur 5 chiffres');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/scans/pappers`,
        {
          code_postal: codePostal.trim(),
          date_creation_min: dateCreationMin.trim() || undefined,
          code_naf: codeNaf.trim() || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 180000 }
      );

      if (response.data.id) {
        router.replace({
          pathname: '/results',
          params: { scanId: response.data.id },
        });
      }
    } catch (error: any) {
      Alert.alert(
        'Erreur',
        error.response?.data?.detail || 'Impossible de lancer le scan Pappers'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <ProspectLocalLogo size={36} variant="icon" />
            <Text style={styles.headerTitle}>Scan Pappers</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Nouvelles créations d'entreprises</Text>
            <Text style={styles.heroSubtitle}>
              Cible les sociétés récemment créées pour sortir des leads avant qu'ils ne soient déjà travaillés partout.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Code postal</Text>
            <View style={styles.inputRow}>
              <Ionicons name="location-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Ex: 59000"
                placeholderTextColor="#999"
                value={codePostal}
                onChangeText={setCodePostal}
                keyboardType="numeric"
                maxLength={5}
                editable={!loading}
              />
            </View>

            <Text style={styles.label}>Date de création mini</Text>
            <View style={styles.inputRow}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={dateCreationMin}
                onChangeText={setDateCreationMin}
                editable={!loading}
              />
            </View>

            <View style={styles.quickDates}>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => handleQuickDate(30)}>
                <Text style={styles.quickDateText}>30 jours</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => handleQuickDate(90)}>
                <Text style={styles.quickDateText}>3 mois</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => handleQuickDate(180)}>
                <Text style={styles.quickDateText}>6 mois</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => handleQuickDate(365)}>
                <Text style={styles.quickDateText}>12 mois</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Code NAF optionnel</Text>
            <View style={styles.inputRow}>
              <Ionicons name="briefcase-outline" size={20} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Ex: 43.22A"
                placeholderTextColor="#999"
                value={codeNaf}
                onChangeText={setCodeNaf}
                editable={!loading}
              />
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Objectif commercial</Text>
            <Text style={styles.infoText}>
              Repérer les entreprises récentes, souvent sans site, peu visibles, et parfois sans PagesJaunes pour pousser tes offres Solocal au bon moment.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#FFF" />
                <Text style={styles.submitText}>Lancer le scan Pappers</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    backgroundColor: '#F5EDFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4C1D95',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5B21B6',
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#1C1C1E',
  },
  quickDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickDateBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickDateText: {
    color: '#4338CA',
    fontWeight: '700',
    fontSize: 13,
  },
  infoBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#9A3412',
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
