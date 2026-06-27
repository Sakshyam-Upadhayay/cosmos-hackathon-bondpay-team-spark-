import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, ActivityIndicator, Text } from 'react-native';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { useAppStore } from '../store/useAppStore';
import { initDB, getDB } from '../database/db';
import * as SecureStore from 'expo-secure-store';
import { CryptoService } from '../services/crypto.service';
import { SyncService } from '../services/sync.service';
import * as Network from 'expo-network';
import * as LocalAuthentication from 'expo-local-authentication';

export const RootNavigator = () => {
  const isAuthenticated = useAppStore((state) => state.user.isAuthenticated);
  const setUser = useAppStore((state) => state.setUser);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initDB();

        // Load offline balance directly from SQLite database on startup so it doesn't show 0
        try {
          const db = await getDB();
          const nowSec = Math.floor(Date.now() / 1000);
          const availableBondsResult = await db.getAllAsync(`
            SELECT SUM(value) as total FROM bonds WHERE status = 'available' AND expires_at > ?
          `, [nowSec]) as any[];
          const offlineTotal = availableBondsResult[0]?.total || 0;
          useAppStore.getState().setBalance({ offline: offlineTotal });
        } catch (dbErr) {
          console.error("Failed to load offline balance on startup:", dbErr);
        }
        
        // Load preferences
        const prefsStr = await SecureStore.getItemAsync('bondpay_prefs');
        let biometricsEnabled = false;
        if (prefsStr) {
          const prefs = JSON.parse(prefsStr);
          setPreferences(prefs);
          biometricsEnabled = prefs.biometrics;
        }

        // Load persisted session
        const sessionStr = await SecureStore.getItemAsync('bondpay_session');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          
          if (biometricsEnabled) {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (hasHardware && isEnrolled) {
              const authResult = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Authenticate to access BondPay',
                fallbackLabel: 'Use Passcode',
              });
              if (!authResult.success) {
                setAuthFailed(true);
                return;
              }
            }
          }

          // Self-healing: verify the session's public key matches the actual public key of the local private key
          try {
            const currentPubKey = await CryptoService.initializeUserKeys(session.userId);
            if (currentPubKey !== session.publicKey) {
              console.warn("Public key mismatch detected on startup! Correcting session public key.", {
                sessionPubKey: session.publicKey,
                currentPubKey
              });
              session.publicKey = currentPubKey;
              await SecureStore.setItemAsync('bondpay_session', JSON.stringify(session));
            }
          } catch (e) {
            console.error("Failed to verify/self-heal public key on startup", e);
          }

          setUser({
            ...session,
            isAuthenticated: true,
          });
        }
      } catch (error) {
        console.error('Failed to initialize app', error);
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Periodic background sync if authenticated and online
  useEffect(() => {
    if (!isAuthenticated) return;

    const performSync = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const isOnline = state.isConnected && state.isInternetReachable;
        if (isOnline) {
          await SyncService.sync();
          console.log("Periodic balance sync completed successfully");
        }
      } catch (error: any) {
        if (error.response?.status === 401) {
          console.warn("Session invalid or expired. Logging out...", error.message);
          await SecureStore.deleteItemAsync('bondpay_session');
          useAppStore.getState().logout();
        } else {
          console.warn("Periodic balance sync failed:", error.message || error);
        }
      }
    };

    // Run immediately on network/auth detection
    performSync();

    const intervalId = setInterval(performSync, 10000); // 10 seconds

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2D46B9" />
      </View>
    );
  }

  if (authFailed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, marginBottom: 20 }}>Authentication Failed</Text>
        <Text style={{ color: '#2D46B9', fontWeight: 'bold' }} onPress={() => setAuthFailed(false)}>Try Again</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
