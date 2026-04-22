import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Stock headshot images for contacts - close-up face shots (same as contacts list)
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

interface Signal {
  id: string;
  signal_type: string;
  title: string;
  description: string;
  is_auto: boolean;
  timestamp: string;
}

interface Opportunity {
  title: string;
  description: string;
  match_percentage: number;
  partner_name: string;
  triggered_by: string;
  ai_reasoning: string[];
}

const SIGNAL_TYPES = [
  { id: 'meeting_recorded', icon: 'calendar', title: 'Meeting Recorded' },
  { id: 'life_event', icon: 'heart', title: 'Life Event' },
  { id: 'property_activity', icon: 'home', title: 'Property Activity' },
  { id: 'deal_activity', icon: 'trending-up', title: 'Deal Activity' },
  { id: 'vehicle_purchase', icon: 'car', title: 'Vehicle Purchase' },
  { id: 'business_event', icon: 'briefcase', title: 'Business Event' },
];

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<Contact | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAddSignal, setShowAddSignal] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  
  const pulseAnim = useState(new Animated.Value(0.4))[0];

  useEffect(() => {
    if (analyzing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [analyzing]);

  const fetchData = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${storedToken}` };

      const [contactRes, signalsRes, opportunitiesRes] = await Promise.all([
        axios.get(`${API_URL}/api/contacts/${id}`, { headers }),
        axios.get(`${API_URL}/api/contacts/${id}/signals`, { headers }),
        axios.get(`${API_URL}/api/contacts/${id}/opportunities`, { headers }),
      ]);

      setContact(contactRes.data);
      setSignals(signalsRes.data);
      setOpportunities(opportunitiesRes.data);
      
      if (opportunitiesRes.data.length > 0) {
        setAnalysisComplete(true);
      }
    } catch (error) {
      console.log('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const analyzeSignals = async () => {
    setAnalyzing(true);
    setAnalysisComplete(false);
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      const response = await axios.post(
        `${API_URL}/api/contacts/${id}/analyze`,
        {},
        { headers: { Authorization: `Bearer ${storedToken}` } }
      );
      setOpportunities(response.data.opportunities || []);
      setAnalysisComplete(true);
    } catch (error) {
      console.log('Error analyzing:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const addSignal = async (signalType: string, title: string) => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      await axios.post(
        `${API_URL}/api/contacts/${id}/signals`,
        {
          signal_type: signalType,
          title: title,
          description: `Manual ${title.toLowerCase()} signal added`,
          is_auto: false,
        },
        { headers: { Authorization: `Bearer ${storedToken}` } }
      );
      setShowAddSignal(false);
      fetchData();
    } catch (error) {
      console.log('Error adding signal:', error);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D664" />
        </View>
      </SafeAreaView>
    );
  }

  if (!contact) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Contact not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="back-button"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#343A40" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Contact Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <View style={styles.avatarContainer}>
              {AVATAR_IMAGES[contact.name] ? (
                <Image source={{ uri: AVATAR_IMAGES[contact.name] }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={28} color="#6C757D" />
              )}
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactRole}>{contact.role}</Text>
            </View>
          </View>
          
          <View style={styles.contactDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={14} color="#6C757D" />
              <Text style={styles.detailText}>{contact.company}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={14} color="#6C757D" />
              <Text style={styles.detailText}>{contact.location}</Text>
            </View>
            {contact.email && (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={14} color="#6C757D" />
                <Text style={styles.detailText}>{contact.email}</Text>
              </View>
            )}
            {contact.phone && (
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={14} color="#6C757D" />
                <Text style={styles.detailText}>{contact.phone}</Text>
              </View>
            )}
          </View>

          {contact.auto_signals_count > 0 && (
            <View style={styles.signalBadge}>
              <Text style={styles.signalBadgeText}>
                {contact.auto_signals_count} auto signals detected
              </Text>
            </View>
          )}
        </View>

        {/* Signals Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderGreen}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIcon}>
                <Ionicons name="radio" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.sectionTitle}>Signals</Text>
                <Text style={styles.sectionSubtitle}>Detected & Manual</Text>
              </View>
            </View>
            <TouchableOpacity
              testID="add-signal-button"
              style={styles.addButton}
              onPress={() => setShowAddSignal(true)}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {signals.length === 0 ? (
            <View style={styles.emptySignals}>
              <Ionicons name="radio-outline" size={32} color="#6C757D" />
              <Text style={styles.emptyText}>No signals yet</Text>
              <Text style={styles.emptySubtext}>Add signals to analyze</Text>
            </View>
          ) : (
            <View style={styles.signalsList}>
              {signals.map((signal) => (
                <View key={signal.id} style={styles.signalCard}>
                  <View style={styles.signalIconContainer}>
                    <Ionicons name="radio" size={18} color="#00D664" />
                  </View>
                  <View style={styles.signalContent}>
                    <View style={styles.signalTitleRow}>
                      <Text style={styles.signalTitle}>{signal.title}</Text>
                      {signal.is_auto && (
                        <View style={styles.autoBadge}>
                          <Text style={styles.autoBadgeText}>Auto</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.signalDescription}>{signal.description}</Text>
                    <View style={styles.signalTime}>
                      <Ionicons name="time-outline" size={12} color="#6C757D" />
                      <Text style={styles.signalTimeText}>{formatTimeAgo(signal.timestamp)}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <Text style={styles.signalsCount}>
                {signals.length} total signals ({signals.filter(s => s.is_auto).length} auto, {signals.filter(s => !s.is_auto).length} manual)
              </Text>
            </View>
          )}
        </View>

        {/* Flow AI Engine Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderGreen}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIcon}>
                <Ionicons name="flash" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={[styles.sectionTitle, styles.italicTitle]}>Flow AI Engine</Text>
                <Text style={styles.sectionSubtitle}>Moment Detection</Text>
              </View>
            </View>
          </View>

          {analyzing ? (
            <View style={styles.analyzingContainer}>
              <Animated.View style={[styles.analyzingSpinner, { opacity: pulseAnim }]}>
                <ActivityIndicator size="large" color="#00D664" />
              </Animated.View>
              <Text style={styles.analyzingTitle}>Analyzing Signals</Text>
              <View style={styles.analyzingSteps}>
                <Text style={styles.analyzingStep}>🔍 Processing {signals.length} signals...</Text>
                <Text style={styles.analyzingStep}>🤖 AI agents analyzing context...</Text>
                <Text style={styles.analyzingStep}>🎯 Matching opportunities...</Text>
              </View>
            </View>
          ) : opportunities.length > 0 ? (
            <View style={styles.opportunitiesContainer}>
              <View style={styles.opportunitiesHeader}>
                <Text style={styles.opportunitiesTitle}>
                  {opportunities.length} Opportunit{opportunities.length === 1 ? 'y' : 'ies'} Detected
                </Text>
                <View style={styles.readyBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#00D664" />
                  <Text style={styles.readyText}>Ready</Text>
                </View>
              </View>
              <Text style={styles.opportunitiesSubtitle}>AI-powered referral recommendations</Text>

              {opportunities.map((opp, index) => (
                <View key={index} style={styles.opportunityCard}>
                  <View style={styles.oppHeader}>
                    <View style={styles.oppIconContainer}>
                      <Ionicons name="trending-up" size={20} color="#00D664" />
                    </View>
                    <View style={styles.oppTitleContainer}>
                      <Text style={styles.oppTitle}>{opp.title}</Text>
                      <View style={styles.matchBadge}>
                        <Text style={styles.matchText}>{opp.match_percentage}%</Text>
                        <Text style={styles.matchLabel}>match</Text>
                      </View>
                    </View>
                  </View>
                  
                  <Text style={styles.oppDescription}>{opp.description}</Text>
                  
                  <View style={styles.partnerRow}>
                    <Ionicons name="people-outline" size={14} color="#6C757D" />
                    <Text style={styles.partnerText}>{opp.partner_name}</Text>
                  </View>

                  <View style={styles.triggeredBy}>
                    <Text style={styles.triggeredLabel}>Triggered by:</Text>
                    <View style={styles.triggeredBadge}>
                      <Text style={styles.triggeredText}>{opp.triggered_by}</Text>
                    </View>
                  </View>

                  {opp.ai_reasoning && opp.ai_reasoning.length > 0 && (
                    <View style={styles.reasoningContainer}>
                      <Text style={styles.reasoningTitle}>AI Reasoning:</Text>
                      {opp.ai_reasoning.map((reason, idx) => (
                        <View key={idx} style={styles.reasoningItem}>
                          <Text style={styles.reasoningBullet}>•</Text>
                          <Text style={styles.reasoningText}>{reason}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    testID={`introduce-button-${index}`}
                    style={styles.introduceButton}
                  >
                    <Text style={styles.introduceButtonText}>Introduce {opp.title.split(' ')[0]}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.poweredBy}>
                <Ionicons name="flash" size={14} color="#00D664" />
                <Text style={styles.poweredByText}>Powered by Flow AI</Text>
              </View>
              <Text style={styles.poweredBySubtext}>
                Analyzed {signals.length} signals using moment detection and relationship intelligence
              </Text>
            </View>
          ) : signals.length > 0 ? (
            <View style={styles.readyToAnalyze}>
              <View style={styles.readyIcon}>
                <Ionicons name="flash-outline" size={32} color="#00D664" />
              </View>
              <Text style={styles.readyTitle}>Ready to Analyze</Text>
              <Text style={styles.readySubtitle}>
                Flow will analyze signals and detect opportunities
              </Text>
              <TouchableOpacity
                testID="analyze-button"
                style={styles.analyzeButton}
                onPress={analyzeSignals}
              >
                <Ionicons name="flash" size={18} color="#FFFFFF" />
                <Text style={styles.analyzeButtonText}>Analyze Signals</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyAI}>
              <Ionicons name="flash-outline" size={32} color="#6C757D" />
              <Text style={styles.emptyAITitle}>Select a contact to begin</Text>
              <Text style={styles.emptyAISubtitle}>
                Flow will analyze signals and detect opportunities
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Signal Modal */}
      <Modal
        visible={showAddSignal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddSignal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowAddSignal(false)}
        >
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Signal</Text>
              <TouchableOpacity
                testID="close-modal-button"
                onPress={() => setShowAddSignal(false)}
              >
                <Ionicons name="close" size={24} color="#6C757D" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.signalTypesGrid}>
              {SIGNAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  testID={`signal-type-${type.id}`}
                  style={styles.signalTypeCard}
                  onPress={() => addSignal(type.id, type.title)}
                >
                  <Ionicons name={type.icon as any} size={24} color="#6C757D" />
                  <Text style={styles.signalTypeText}>{type.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6C757D',
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#343A40',
  },
  scrollView: {
    flex: 1,
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00D664',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#343A40',
  },
  contactRole: {
    fontSize: 14,
    color: '#6C757D',
    marginTop: 2,
  },
  contactDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
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
    marginTop: 16,
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
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  sectionHeaderGreen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#00D664',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  italicTitle: {
    fontStyle: 'italic',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySignals: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C757D',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 4,
  },
  signalsList: {
    padding: 16,
  },
  signalCard: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  signalIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 214, 100, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  signalContent: {
    flex: 1,
  },
  signalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#343A40',
  },
  autoBadge: {
    backgroundColor: '#80FFAD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  signalDescription: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 4,
  },
  signalTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  signalTimeText: {
    fontSize: 11,
    color: '#6C757D',
  },
  signalsCount: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 8,
    textAlign: 'center',
  },
  analyzingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  analyzingSpinner: {
    marginBottom: 16,
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#343A40',
    marginBottom: 16,
  },
  analyzingSteps: {
    alignItems: 'flex-start',
  },
  analyzingStep: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  opportunitiesContainer: {
    padding: 16,
  },
  opportunitiesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  opportunitiesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#343A40',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00D664',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  readyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  opportunitiesSubtitle: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 4,
    marginBottom: 16,
  },
  opportunityCard: {
    backgroundColor: 'rgba(0, 214, 100, 0.08)',
    borderWidth: 1,
    borderColor: '#00D664',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  oppHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  oppIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00D664',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  oppTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  oppTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#343A40',
    flex: 1,
  },
  matchBadge: {
    alignItems: 'center',
    backgroundColor: '#00D664',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  matchText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  matchLabel: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  oppDescription: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 12,
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  partnerText: {
    fontSize: 13,
    color: '#6C757D',
  },
  triggeredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  triggeredLabel: {
    fontSize: 12,
    color: '#6C757D',
  },
  triggeredBadge: {
    backgroundColor: '#00D664',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  triggeredText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reasoningContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  reasoningTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C757D',
    marginBottom: 8,
  },
  reasoningItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  reasoningBullet: {
    color: '#00D664',
    marginRight: 8,
    fontSize: 14,
  },
  reasoningText: {
    fontSize: 13,
    color: '#6C757D',
    flex: 1,
  },
  introduceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00D664',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  introduceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  poweredByText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D664',
  },
  poweredBySubtext: {
    fontSize: 12,
    color: '#6C757D',
    textAlign: 'center',
    marginTop: 4,
  },
  readyToAnalyze: {
    padding: 32,
    alignItems: 'center',
  },
  readyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00D664',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  readyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#343A40',
    marginBottom: 4,
  },
  readySubtitle: {
    fontSize: 13,
    color: '#6C757D',
    marginBottom: 16,
    textAlign: 'center',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00D664',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  analyzeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyAI: {
    padding: 32,
    alignItems: 'center',
  },
  emptyAITitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C757D',
    marginTop: 8,
  },
  emptyAISubtitle: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#343A40',
  },
  signalTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  signalTypeCard: {
    width: '47%',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 8,
  },
  signalTypeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#343A40',
    textAlign: 'center',
  },
});
