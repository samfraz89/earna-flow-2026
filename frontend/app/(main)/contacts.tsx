import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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

  const renderContact = ({ item }: { item: Contact }) => (
    <TouchableOpacity
      testID={`contact-card-${item.id}`}
      style={styles.contactCard}
      onPress={() => router.push(`/(main)/contact/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.contactHeader}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarEmoji}>{item.avatar_emoji}</Text>
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
            <Ionicons name="git-network" size={24} color="#00C880" />
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

      {/* Panel Header with Gradient */}
      <LinearGradient
        colors={['#4200FF', '#8C54FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.panelHeader}
      >
        <View style={styles.panelHeaderIcon}>
          <Ionicons name="people" size={18} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.panelTitle}>Contacts</Text>
          <Text style={styles.panelSubtitle}>Select a contact to analyze</Text>
        </View>
      </LinearGradient>

      {/* Contacts List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00C880" />
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
              colors={['#00C880']}
              tintColor="#00C880"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
    backgroundColor: 'rgba(0, 200, 128, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 12,
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  panelHeaderIcon: {
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
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    backgroundColor: '#80FFAD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
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
    backgroundColor: '#00C880',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  seedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
