import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [autoLogging, setAutoLogging] = useState(true);

  useEffect(() => {
    const autoLogin = async () => {
      if (!loading) {
        if (user) {
          router.replace('/(main)/contacts');
        } else {
          // Auto-login with admin credentials for preview
          try {
            await login('admin@earnaflow.com', 'admin123');
            router.replace('/(main)/contacts');
          } catch (error) {
            console.log('Auto-login failed, going to login screen');
            router.replace('/(auth)/login');
          }
        }
        setAutoLogging(false);
      }
    };
    autoLogin();
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#002FA7" />
      <Text style={styles.text}>Loading Earna Flow...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    marginTop: 16,
    fontSize: 14,
    color: '#52525B',
  },
});
