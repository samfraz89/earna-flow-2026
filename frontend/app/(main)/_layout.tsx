import React from 'react';
import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F9FAFB' },
      }}
    >
      <Stack.Screen name="contacts" />
      <Stack.Screen name="contact/[id]" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
