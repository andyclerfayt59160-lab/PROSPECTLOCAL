import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProspectLocalLogo } from '../components/ProspectLocalLogo';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  is_active?: boolean;
  is_approved?: boolean;
  registration_date?: string;
  scan_count?: number;
  business_count?: number;
}

interface PendingUser {
  id: string;
  email: string;
  registration_date: string;
  is_approved: boolean;
}

interface Stats {
  total_users: number;
  total_scans: number;
  total_businesses: number;
  pj_absent: number;
  pj_present: number;
  with_website: number;
}

// Générateur de mot de passe sécurisé
const generateSecurePassword = (length: number = 12): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export default function AdminScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'pending'>('users');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      // Load users
      const usersResponse = await axios.get(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(usersResponse.data);

      // Load pending registrations
      const pendingResponse = await axios.get(`${API_URL}/api/admin/pending-registrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingUsers(pendingResponse.data);

      // Load stats
      const statsResponse = await axios.get(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(statsResponse.data);
    } catch (error: any) {
      console.error('Error loading admin data:', error);
      if (error.response?.status === 403) {
        // Not admin, redirect
        if (Platform.OS === 'web') {
          window.alert('❌ Accès refusé. Vous devez être administrateur.');
        } else {
          Alert.alert('Accès refusé', 'Vous devez être administrateur.');
        }
        router.replace('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      if (Platform.OS === 'web') {
        window.alert('❌ Veuillez remplir tous les champs');
      } else {
        Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      }
      return;
    }

    setCreating(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/admin/users`,
        {
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (Platform.OS === 'web') {
        window.alert('✅ Utilisateur créé avec succès');
      } else {
        Alert.alert('Succès', 'Utilisateur créé avec succès');
      }

      setShowCreateModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors de la création';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    const newStatus = user.is_active === false ? true : false;
    
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/admin/users/${user.id}`,
        { is_active: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, is_active: newStatus } : u
      ));
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    }
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setEditPassword('');
    setEditRole(user.role);
    setShowEditModal(true);
  };

  const handleGeneratePassword = () => {
    const newPass = generateSecurePassword(12);
    if (showCreateModal) {
      setNewUserPassword(newPass);
    } else {
      setEditPassword(newPass);
    }
  };

  const handleApproveRegistration = async (userId: string, email: string) => {
    const confirmApprove = Platform.OS === 'web'
      ? window.confirm(`Approuver l'inscription de ${email} ?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Approuver cette inscription ?',
            `L'utilisateur ${email} pourra se connecter.`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Approuver', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmApprove) return;

    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/admin/approve-registration/${userId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remove from pending list
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      
      // Reload users list
      loadData();

      if (Platform.OS === 'web') {
        window.alert(`✅ ${email} a été approuvé !`);
      } else {
        Alert.alert('Succès', `${email} a été approuvé !`);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    }
  };

  const handleRejectRegistration = async (userId: string, email: string) => {
    const confirmReject = Platform.OS === 'web'
      ? window.confirm(`Refuser et supprimer la demande de ${email} ?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Refuser cette inscription ?',
            `La demande de ${email} sera supprimée définitivement.`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Refuser', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmReject) return;

    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/admin/reject-registration/${userId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remove from pending list
      setPendingUsers(prev => prev.filter(u => u.id !== userId));

      if (Platform.OS === 'web') {
        window.alert(`La demande de ${email} a été refusée`);
      } else {
        Alert.alert('Info', `La demande de ${email} a été refusée`);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    setUpdating(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const updateData: any = { role: editRole };
      
      if (editPassword.trim()) {
        updateData.password = editPassword.trim();
      }
      
      await axios.patch(
        `${API_URL}/api/admin/users/${editingUser.id}`,
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === editingUser.id ? { ...u, role: editRole } : u
      ));

      if (Platform.OS === 'web') {
        window.alert(`✅ Utilisateur mis à jour${editPassword ? '\n\n📋 Nouveau mot de passe : ' + editPassword : ''}`);
      } else {
        Alert.alert('Succès', `Utilisateur mis à jour${editPassword ? '\n\nNouveau mot de passe : ' + editPassword : ''}`);
      }

      setShowEditModal(false);
      setEditingUser(null);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors de la mise à jour';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm(`Supprimer l'utilisateur ${user.email} ?\n\nCette action supprimera également tous ses scans et données.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Supprimer cet utilisateur ?',
            `Cette action supprimera également tous ses scans et données.`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmDelete) return;

    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/admin/users/${user.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUsers(prev => prev.filter(u => u.id !== user.id));
      
      if (Platform.OS === 'web') {
        window.alert('✅ Utilisateur supprimé');
      } else {
        Alert.alert('Succès', 'Utilisateur supprimé');
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur';
      if (Platform.OS === 'web') {
        window.alert(`❌ ${message}`);
      } else {
        Alert.alert('Erreur', message);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={[styles.userCard, item.is_active === false && styles.userCardDisabled]}>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Ionicons 
            name={item.role === 'admin' ? 'shield-checkmark' : 'person'} 
            size={20} 
            color={item.role === 'admin' ? '#6366F1' : '#666'} 
          />
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.is_active === false && (
            <View style={styles.disabledBadge}>
              <Text style={styles.disabledBadgeText}>DÉSACTIVÉ</Text>
            </View>
          )}
        </View>
        <View style={styles.userMeta}>
          <Text style={styles.userRole}>
            {item.role === 'admin' ? '👑 Admin' : '👤 Utilisateur'}
          </Text>
          <Text style={styles.userStats}>
            📊 {item.scan_count || 0} scans • {item.business_count || 0} entreprises
          </Text>
          <Text style={styles.userDate}>Créé le {formatDate(item.created_at)}</Text>
        </View>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnEdit]}
          onPress={() => handleOpenEditModal(item)}
        >
          <Ionicons name="create-outline" size={18} color="#6366F1" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, item.is_active === false && styles.actionBtnActive]}
          onPress={() => handleToggleUserStatus(item)}
        >
          <Ionicons 
            name={item.is_active === false ? 'checkmark-circle' : 'ban'} 
            size={18} 
            color={item.is_active === false ? '#4CAF50' : '#FF9800'} 
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnDelete]}
          onPress={() => handleDeleteUser(item)}
        >
          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <ProspectLocalLogo size={36} variant="icon" />
        <Text style={styles.headerTitle}>Administration</Text>
      </View>

      {/* Stats Cards */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#6366F1" />
            <Text style={styles.statNumber}>{stats.total_users}</Text>
            <Text style={styles.statLabel}>Utilisateurs</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="search" size={24} color="#4CAF50" />
            <Text style={styles.statNumber}>{stats.total_scans}</Text>
            <Text style={styles.statLabel}>Scans</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="business" size={24} color="#FF9800" />
            <Text style={styles.statNumber}>{stats.total_businesses}</Text>
            <Text style={styles.statLabel}>Entreprises</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
            <Text style={styles.statNumber}>{stats.pj_absent}</Text>
            <Text style={styles.statLabel}>Sans PJ</Text>
          </View>
        </View>
      )}

      {/* Section Title with Tabs */}
      <View style={styles.sectionHeader}>
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.tabActive]}
            onPress={() => setActiveTab('users')}
          >
            <Ionicons name="people" size={18} color={activeTab === 'users' ? '#6366F1' : '#666'} />
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              Utilisateurs ({users.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
            onPress={() => setActiveTab('pending')}
          >
            <Ionicons name="hourglass" size={18} color={activeTab === 'pending' ? '#FF9500' : '#666'} />
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
              En attente ({pendingUsers.length})
            </Text>
            {pendingUsers.length > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingUsers.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        {activeTab === 'users' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.addButtonText}>Nouveau</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Users List */}
      {activeTab === 'users' && (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.usersList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun utilisateur</Text>
          }
        />
      )}

      {/* Pending Registrations List */}
      {activeTab === 'pending' && (
        <FlatList
          data={pendingUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.usersList}
          ListEmptyComponent={
            <View style={styles.emptyPendingContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#34C759" />
              <Text style={styles.emptyPendingText}>Aucune demande en attente</Text>
              <Text style={styles.emptyPendingSubtext}>
                Les nouvelles inscriptions apparaîtront ici
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.pendingCard}>
              <View style={styles.pendingIcon}>
                <Ionicons name="person-add" size={24} color="#FF9500" />
              </View>
              <View style={styles.pendingInfo}>
                <Text style={styles.pendingEmail}>{item.email}</Text>
                <Text style={styles.pendingDate}>
                  Demande du {formatDate(item.registration_date)}
                </Text>
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleApproveRegistration(item.id, item.email)}
                >
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleRejectRegistration(item.id, item.email)}
                >
                  <Ionicons name="close" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Create User Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Créer un compte</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="email@exemple.com"
                placeholderTextColor="#999"
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mot de passe</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••"
                  placeholderTextColor="#999"
                  value={newUserPassword}
                  onChangeText={setNewUserPassword}
                />
                <TouchableOpacity 
                  style={styles.generateBtn}
                  onPress={handleGeneratePassword}
                >
                  <Ionicons name="dice" size={18} color="#FFF" />
                  <Text style={styles.generateBtnText}>Générer</Text>
                </TouchableOpacity>
              </View>
              {newUserPassword ? (
                <Text style={styles.passwordPreview}>📋 {newUserPassword}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Rôle</Text>
              <View style={styles.roleSelector}>
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    newUserRole === 'user' && styles.roleOptionActive
                  ]}
                  onPress={() => setNewUserRole('user')}
                >
                  <Ionicons 
                    name="person" 
                    size={18} 
                    color={newUserRole === 'user' ? '#FFF' : '#666'} 
                  />
                  <Text style={[
                    styles.roleOptionText,
                    newUserRole === 'user' && styles.roleOptionTextActive
                  ]}>
                    Utilisateur
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    newUserRole === 'admin' && styles.roleOptionActive
                  ]}
                  onPress={() => setNewUserRole('admin')}
                >
                  <Ionicons 
                    name="shield-checkmark" 
                    size={18} 
                    color={newUserRole === 'admin' ? '#FFF' : '#666'} 
                  />
                  <Text style={[
                    styles.roleOptionText,
                    newUserRole === 'admin' && styles.roleOptionTextActive
                  ]}>
                    Admin
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreateUser}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.createButtonText}>Créer le compte</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier l'utilisateur</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {editingUser && (
              <>
                <View style={styles.editUserInfo}>
                  <Ionicons name="person-circle" size={48} color="#6366F1" />
                  <Text style={styles.editUserEmail}>{editingUser.email}</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>🔐 Nouveau mot de passe (optionnel)</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Laisser vide pour ne pas changer"
                      placeholderTextColor="#999"
                      value={editPassword}
                      onChangeText={setEditPassword}
                    />
                    <TouchableOpacity 
                      style={styles.generateBtn}
                      onPress={handleGeneratePassword}
                    >
                      <Ionicons name="dice" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  {editPassword ? (
                    <Text style={styles.passwordPreview}>📋 Nouveau : {editPassword}</Text>
                  ) : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>👤 Rôle</Text>
                  <View style={styles.roleSelector}>
                    <TouchableOpacity
                      style={[
                        styles.roleOption,
                        editRole === 'user' && styles.roleOptionActive
                      ]}
                      onPress={() => setEditRole('user')}
                    >
                      <Ionicons 
                        name="person" 
                        size={18} 
                        color={editRole === 'user' ? '#FFF' : '#666'} 
                      />
                      <Text style={[
                        styles.roleOptionText,
                        editRole === 'user' && styles.roleOptionTextActive
                      ]}>
                        Utilisateur
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.roleOption,
                        editRole === 'admin' && styles.roleOptionActive
                      ]}
                      onPress={() => setEditRole('admin')}
                    >
                      <Ionicons 
                        name="shield-checkmark" 
                        size={18} 
                        color={editRole === 'admin' ? '#FFF' : '#666'} 
                      />
                      <Text style={[
                        styles.roleOptionText,
                        editRole === 'admin' && styles.roleOptionTextActive
                      ]}>
                        Admin
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.createButton, updating && styles.createButtonDisabled]}
                  onPress={handleUpdateUser}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.createButtonText}>Enregistrer les modifications</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  usersList: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#F0F0F0',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
  },
  disabledBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  disabledBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  userMeta: {
    marginTop: 8,
    gap: 4,
  },
  userRole: {
    fontSize: 13,
    color: '#666',
  },
  userStats: {
    fontSize: 12,
    color: '#999',
  },
  userDate: {
    fontSize: 11,
    color: '#999',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  actionBtnActive: {
    backgroundColor: '#E8F5E9',
  },
  actionBtnDelete: {
    backgroundColor: '#FFEBEE',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  roleOptionActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roleOptionTextActive: {
    color: '#FFF',
  },
  createButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // New styles for password generation and edit
  passwordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  passwordInput: {
    flex: 1,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  generateBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  passwordPreview: {
    marginTop: 8,
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    backgroundColor: '#E8F5E9',
    padding: 8,
    borderRadius: 8,
  },
  actionBtnEdit: {
    backgroundColor: '#E8EAF6',
  },
  editUserInfo: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
  },
  editUserEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 8,
  },
  // Tabs styles
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#6366F1',
  },
  pendingBadge: {
    backgroundColor: '#FF3B30',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  pendingBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  // Pending registration card
  pendingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  pendingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  pendingDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    backgroundColor: '#34C759',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: '#FF3B30',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPendingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyPendingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
  },
  emptyPendingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
});
