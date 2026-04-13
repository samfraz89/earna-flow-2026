import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  access_token?: string;
}

interface AuthContextType {
  user: User | null | false;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | false>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      if (storedToken) {
        setToken(storedToken);
        const response = await axios.get(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        setUser(response.data);
      } else {
        setUser(false);
      }
    } catch (error) {
      console.log('Auth check failed:', error);
      setUser(false);
      await AsyncStorage.removeItem('access_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email,
      password
    });
    const userData = response.data;
    if (userData.access_token) {
      await AsyncStorage.setItem('access_token', userData.access_token);
      setToken(userData.access_token);
    }
    setUser(userData);
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, {
      email,
      password,
      name
    });
    const userData = response.data;
    if (userData.access_token) {
      await AsyncStorage.setItem('access_token', userData.access_token);
      setToken(userData.access_token);
    }
    setUser(userData);
  };

  const logout = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('access_token');
      if (storedToken) {
        await axios.post(`${API_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
      }
    } catch (error) {
      console.log('Logout error:', error);
    }
    await AsyncStorage.removeItem('access_token');
    setToken(null);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
