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
import { Swipeable } from 'react-native-gesture-handler';
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
  avatar_url?: string | null;
  auto_signals_count: number;
  is_archived?: boolean;
}

interface PhonebookEntry {
  id: string;
  name: string;
  role: string;
  company: string;
  location: string;
  email?: string;
  phone?: string;
  avatar_url: string;
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [modalStep, setModalStep] = useState<'choice' | 'phonebook' | 'manual'>('choice');
  const [saving, setSaving] = useState(false);
  const [phonebook, setPhonebook] = useState<PhonebookEntry[]>([]);
  const [phonebookLoading, setPhonebookLoading] = useState(false);
  const [selectedPhonebookIds, setSelectedPhonebookIds] = useState<Set<string>>(new Set());
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
      const response = await axios.get(
        `${API_URL}/api/contacts?include_archived=${showArchived ? 'true' : 'false'}`,
        { headers: { Authorization: `Bearer ${storedToken}` } }
      );
      setContacts(response.data);
    } catch (error) {
      console.log('Error fetching contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showArchived]);

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

  const closeAddModal = () => {
    setShowAddModal(false);
    setModalStep('choice');
    setSelectedPhonebookIds(new Set());
    resetForm();
  };

  const openPhonebook = async () => {
    setModalStep('phonebook');
    setPhonebookLoading(true);
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const response = await axios.get(`${API_URL}/api/phonebook`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      setPhonebook(response.data);
    } catch (error) {
      console.log('Error fetching phonebook:', error);
      Alert.alert('Error', 'Could not load phonebook.');
    } finally {
      setPhonebookLoading(false);
    }
  };

  const togglePhonebookSelection = (pbId: string) => {
    setSelectedPhonebookIds((prev) => {
      const next = new Set(prev);
      if (next.has(pbId)) next.delete(pbId);
      else next.add(pbId);
      return next;
    });
  };

  const handleImportPhonebook = async () => {
    if (selectedPhonebookIds.size === 0) {
      Alert.alert('No contacts selected', 'Please select at least one contact to add.');
      return;
    }
    setSaving(true);
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const toImport = phonebook.filter((p) => selectedPhonebookIds.has(p.id));
      await Promise.all(
        toImport.map((p) =>
          axios.post(
            `${API_URL}/api/contacts`,
            {
              name: p.name,
              role: p.role,
              company: p.company,
              location: p.location,
              email: p.email || null,
              phone: p.phone || null,
              avatar_url: p.avatar_url,
              avatar_emoji: '👤',
            },
            { headers: { Authorization: `Bearer ${storedToken}` } }
          )
        )
      );
      closeAddModal();
      fetchContacts();
    } catch (error) {
      console.log('Error importing contacts:', error);
      Alert.alert('Error', 'Failed to import contacts. Please try again.');
    } finally {
      setSaving(false);
    }
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
      closeAddModal();
      fetchContacts();
    } catch (error: any) {
      console.log('Error adding contact:', error);
      Alert.alert('Error', 'Failed to add contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (contactId: string, currentlyArchived: boolean) => {
    const targetArchived = !currentlyArchived;
    const previous = contacts;
    // Optimistic UI update
    if (!showArchived) {
      // Archived contacts are hidden — remove immediately after archiving
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } else {
      // Toggle is_archived in-place
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, is_archived: targetArchived } : c))
      );
    }
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      await axios.patch(
        `${API_URL}/api/contacts/${contactId}/archive`,
        { is_archived: targetArchived },
        { headers: { Authorization: `Bearer ${storedToken}` } }
      );
    } catch (error) {
      console.log('Error toggling archive:', error);
      setContacts(previous);
      Alert.alert('Error', 'Could not update archive state.');
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const avatarUrl = item.avatar_url || AVATAR_IMAGES[item.name];
    const archived = !!item.is_archived;

    return (
      <Swipeable
        renderRightActions={() => (
          <TouchableOpacity
            testID={`archive-contact-${item.id}`}
            style={[styles.swipeArchiveAction, archived && { backgroundColor: '#00D664' }]}
            onPress={() => handleToggleArchive(item.id, archived)}
            activeOpacity={0.85}
          >
            <Ionicons name={archived ? 'arrow-undo' : 'archive'} size={20} color="#FFFFFF" />
            <Text style={styles.swipeArchiveText}>{archived ? 'Restore' : 'Archive'}</Text>
          </TouchableOpacity>
        )}
        overshootRight={false}
        rightThreshold={40}
      >
        <TouchableOpacity
          testID={`contact-card-${item.id}`}
          style={[styles.contactCard, archived && styles.contactCardArchived]}
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
              <View style={styles.contactNameRow}>
                <Text style={styles.contactName}>{item.name}</Text>
                {archived && (
                  <View style={styles.archivedPill}>
                    <Text style={styles.archivedPillText}>Archived</Text>
                  </View>
                )}
              </View>
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
      </Swipeable>
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

      {/* Minimal archived toggle */}
      <TouchableOpacity
        testID="show-archived-toggle"
        style={styles.archivedToggle}
        onPress={() => setShowArchived((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={[styles.archivedToggleDot, showArchived && styles.archivedToggleDotOn]} />
        <Text style={[styles.archivedToggleText, showArchived && styles.archivedToggleTextOn]}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Text>
      </TouchableOpacity>

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
        onRequestClose={closeAddModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                {modalStep !== 'choice' && (
                  <TouchableOpacity
                    testID="modal-back-button"
                    style={styles.modalBackButton}
                    onPress={() => setModalStep('choice')}
                  >
                    <Ionicons name="chevron-back" size={22} color="#343A40" />
                  </TouchableOpacity>
                )}
                <Text style={styles.modalTitle}>
                  {modalStep === 'choice' ? 'Add Contact' : modalStep === 'phonebook' ? 'Phonebook' : 'Add Manually'}
                </Text>
              </View>
              <TouchableOpacity
                testID="close-add-contact-modal"
                style={styles.modalCloseButton}
                onPress={closeAddModal}
              >
                <Ionicons name="close" size={22} color="#6C757D" />
              </TouchableOpacity>
            </View>

            {modalStep === 'choice' && (
              <View style={styles.choiceContainer}>
                <TouchableOpacity
                  testID="choice-phonebook"
                  style={styles.choiceCard}
                  onPress={openPhonebook}
                  activeOpacity={0.85}
                >
                  <View style={[styles.choiceIcon, { backgroundColor: '#430C3D' }]}>
                    <Ionicons name="book" size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>Import from Phonebook</Text>
                    <Text style={styles.choiceSubtitle}>Pick one or more contacts from your phone</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6C757D" />
                </TouchableOpacity>

                <TouchableOpacity
                  testID="choice-manual"
                  style={styles.choiceCard}
                  onPress={() => setModalStep('manual')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.choiceIcon, { backgroundColor: '#FF2ECC' }]}>
                    <Ionicons name="create" size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>Add Manually</Text>
                    <Text style={styles.choiceSubtitle}>Enter contact details by hand</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6C757D" />
                </TouchableOpacity>
              </View>
            )}

            {modalStep === 'phonebook' && (
              <View style={styles.phonebookWrapper}>
                {phonebookLoading ? (
                  <View style={styles.phonebookLoader}>
                    <ActivityIndicator size="large" color="#00D664" />
                  </View>
                ) : phonebook.length === 0 ? (
                  <View style={styles.phonebookEmpty}>
                    <Ionicons name="checkmark-done" size={36} color="#00D664" />
                    <Text style={styles.emptyTitle}>All contacts added</Text>
                    <Text style={styles.emptySubtitle}>
                      Every phonebook contact is already in your list.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.phonebookHelper}>
                      {selectedPhonebookIds.size > 0
                        ? `${selectedPhonebookIds.size} selected`
                        : 'Tap contacts to select'}
                    </Text>
                    <ScrollView
                      style={styles.phonebookList}
                      contentContainerStyle={{ paddingBottom: 16 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {phonebook.map((p) => {
                        const selected = selectedPhonebookIds.has(p.id);
                        return (
                          <TouchableOpacity
                            key={p.id}
                            testID={`phonebook-entry-${p.id}`}
                            style={[styles.phonebookRow, selected && styles.phonebookRowSelected]}
                            onPress={() => togglePhonebookSelection(p.id)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.phonebookAvatarWrap}>
                              <Image source={{ uri: p.avatar_url }} style={styles.phonebookAvatar} />
                            </View>
                            <View style={styles.phonebookInfo}>
                              <Text style={styles.phonebookName}>{p.name}</Text>
                              <Text style={styles.phonebookRole} numberOfLines={1}>
                                {p.role} · {p.company}
                              </Text>
                              <Text style={styles.phonebookLocation}>{p.location}</Text>
                            </View>
                            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                              {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      testID="import-phonebook-button"
                      style={[
                        styles.submitButton,
                        (saving || selectedPhonebookIds.size === 0) && { opacity: 0.6 },
                      ]}
                      onPress={handleImportPhonebook}
                      disabled={saving || selectedPhonebookIds.size === 0}
                      activeOpacity={0.85}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="person-add" size={18} color="#FFFFFF" />
                          <Text style={styles.submitButtonText}>
                            Add {selectedPhonebookIds.size > 0 ? `${selectedPhonebookIds.size} ` : ''}
                            Contact{selectedPhonebookIds.size === 1 ? '' : 's'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {modalStep === 'manual' && (
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
            )}
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
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
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
  choiceContainer: {
    paddingVertical: 16,
    gap: 12,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceText: {
    flex: 1,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#343A40',
  },
  choiceSubtitle: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 2,
  },
  phonebookWrapper: {
    flex: 1,
    minHeight: 420,
    paddingBottom: 8,
  },
  phonebookLoader: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  phonebookEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  phonebookHelper: {
    fontSize: 12,
    color: '#6C757D',
    marginVertical: 10,
  },
  phonebookList: {
    maxHeight: 460,
  },
  phonebookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  phonebookRowSelected: {
    borderColor: '#00D664',
    backgroundColor: 'rgba(0, 214, 100, 0.06)',
  },
  phonebookAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  phonebookAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  phonebookInfo: {
    flex: 1,
  },
  phonebookName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#343A40',
  },
  phonebookRole: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 2,
  },
  phonebookLocation: {
    fontSize: 11,
    color: '#ADB5BD',
    marginTop: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#00D664',
    borderColor: '#00D664',
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
  swipeArchiveAction: {
    backgroundColor: '#6C757D',
    justifyContent: 'center',
    alignItems: 'center',
    width: 84,
    marginVertical: 6,
    marginLeft: 8,
    borderRadius: 12,
    gap: 4,
  },
  swipeArchiveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  contactCardArchived: {
    opacity: 0.55,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  archivedPill: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  archivedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6C757D',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  archivedToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CED4DA',
  },
  archivedToggleDotOn: {
    backgroundColor: '#00D664',
  },
  archivedToggleText: {
    fontSize: 11,
    color: '#6C757D',
    fontWeight: '500',
  },
  archivedToggleTextOn: {
    color: '#430C3D',
    fontWeight: '600',
  },
});
