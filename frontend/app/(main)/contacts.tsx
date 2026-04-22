import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Stock headshot images for contacts - close-up face shots
const AVATAR_IMAGES: { [key: string]: string } = {
  'Sarah Mitchell': 'https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?w=200&h=200&fit=crop&crop=face',
  'James Chen': 'https://images.unsplash.com/photo-1633625510483-c177f4308f33?w=200&h=200&fit=crop&crop=face',
  'Emma Rodriguez': 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop&crop=face',
};

interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  location: string;
  email?: string;
  phone?: string;
  avatar_emoji: string;
  auto_signals_count: number;
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    role: '',
    company: '',
    location: '',
    email: '',
    phone: '',
  });
  const { user, logout, token } = useAuth();
  const router = useRouter();

  const fetchContacts = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const response = await axios.get(`${API_URL}/api/contacts`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      });
      setContacts(response.data);
    } catch (error) {
      console.log('Error fetching contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContacts();
  }, [fetchContacts]);

  const seedDemoData = async () => {
    setSeeding(true);
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      await axios.post(`${API_URL}/api/seed`, {}, {
        headers: { Authorization: `Bearer ${storedToken}` }
      });
      fetchContacts();
    } catch (error) {
      console.log('Error seeding data:', error);
    } finally {
      setSeeding(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const resetForm = () => {
    setForm({ name: '', role: '', company: '', location: '', email: '', phone: '' });
  };

  const handleAddContact = async () => {
    if (!form.name.trim() || !form.role.trim() || !form.company.trim() || !form.location.trim()) {
      Alert.alert('Missing fields', 'Please fill in Name, Role, Company and Location.');
      return;
    }
    setSaving(true);
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      await axios.post(
        `${API_URL}/api/contacts`,
        {
          name: form.name.trim(),
          role: form.role.trim(),
          company: form.company.trim(),
          location: form.location.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          avatar_emoji: '👤',
        },
        { headers: { Authorization: `Bearer ${storedToken}` } }
      );
      resetForm();
      setShowAddModal(false);
      fetchContacts();
    } catch (error: any) {
      console.log('Error adding contact:', error);
      Alert.alert('Error', 'Failed to add contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const avatarUrl = AVATAR_IMAGES[item.name];
    
    return (
      <TouchableOpacity
        testID={`contact-card-${item.id}`}
        style={styles.contactCard}
        onPress={() => router.push(`/(main)/contact/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.contactHeader}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={24} color="#6C757D" />
            )}
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{item.name}</Text>
            <Text style={styles.contactRole}>{item.role}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6C757D" />
        </View>
        
        <View style={styles.contactDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="business-outline" size={14} color="#6C757D" />
            <Text style={styles.detailText}>{item.company}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={14} color="#6C757D" />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        </View>

        {item.auto_signals_count > 0 && (
          <View style={styles.signalBadge}>
            <Text style={styles.signalBadgeText}>
              {item.auto_signals_count} auto signals detected
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people-outline" size={48} color="#6C757D" />
      </View>
      <Text style={styles.emptyTitle}>No contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Add contacts to start analyzing signals and detecting opportunities
      </Text>
      <TouchableOpacity
        testID="seed-demo-data-button"
        style={styles.seedButton}
        onPress={seedDemoData}
        disabled={seeding}
      >
        {seeding ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Ionicons name="flash" size={18} color="#FFFFFF" />
            <Text style={styles.seedButtonText}>Load Demo Data</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>E</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Earna Flow</Text>
            <Text style={styles.headerSubtitle}>AI Relationship Intelligence</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="profile-button"
          style={styles.profileButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color="#343A40" />
        </TouchableOpacity>
      </View>

      {/* Panel Header */}
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={styles.panelHeaderIcon}>
            <Ionicons name="people" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.panelTitle}>Contacts</Text>
            <Text style={styles.panelSubtitle}>Select a contact to analyze</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="add-contact-button"
          style={styles.addContactButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Contacts List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D664" />
        </View>
      ) : (
        <FlatList
          testID="contacts-list"
          data={contacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#00D664']}
              tintColor="#00D664"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Contact Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Contact</Text>
              <TouchableOpacity
                testID="close-add-contact-modal"
                style={styles.modalCloseButton}
                onPress={() => setShowAddModal(false)}
              >
                <Ionicons name="close" size={22} color="#6C757D" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput
                  testID="input-name"
                  style={styles.input}
                  placeholder="e.g., Jane Doe"
                  placeholderTextColor="#ADB5BD"
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Role *</Text>
                <TextInput
                  testID="input-role"
                  style={styles.input}
                  placeholder="e.g., Real Estate Agent"
                  placeholderTextColor="#ADB5BD"
                  value={form.role}
                  onChangeText={(v) => setForm({ ...form, role: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Company *</Text>
                <TextInput
                  testID="input-company"
                  style={styles.input}
                  placeholder="e.g., Premier Properties"
                  placeholderTextColor="#ADB5BD"
                  value={form.company}
                  onChangeText={(v) => setForm({ ...form, company: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Location *</Text>
                <TextInput
                  testID="input-location"
                  style={styles.input}
                  placeholder="e.g., Auckland, NZ"
                  placeholderTextColor="#ADB5BD"
                  value={form.location}
                  onChangeText={(v) => setForm({ ...form, location: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  testID="input-email"
                  style={styles.input}
                  placeholder="e.g., jane@example.com"
                  placeholderTextColor="#ADB5BD"
                  value={form.email}
                  onChangeText={(v) => setForm({ ...form, email: v })}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput
                  testID="input-phone"
                  style={styles.input}
                  placeholder="e.g., +64 21 123 4567"
                  placeholderTextColor="#ADB5BD"
                  value={form.phone}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  keyboardType="phone-pad"
                />
              </View>

              <TouchableOpacity
                testID="submit-add-contact"
                style={[styles.submitButton, saving && { opacity: 0.7 }]}
                onPress={handleAddContact}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={18} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Add Contact</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#430C3D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF2ECC',
    fontFamily: 'Helvetica',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#343A40',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6C757D',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#430C3D',
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  panelHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addContactButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  panelSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarEmoji: {
    fontSize: 24,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#343A40',
  },
  contactRole: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 2,
  },
  contactDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#6C757D',
  },
  signalBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#00D664',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#343A40',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    marginBottom: 24,
  },
  seedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#950574',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  seedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
    maxHeight: '90%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#430C3D',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    marginTop: 8,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#343A40',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: '#343A40',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF2ECC',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
