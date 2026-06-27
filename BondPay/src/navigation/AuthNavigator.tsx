import React, { useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, Alert, ActivityIndicator, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { CryptoService } from '../services/crypto.service';
import { SyncService } from '../services/sync.service';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const Stack = createStackNavigator();
import { API_URL } from '../services/config.service';

const LoginScreen = ({ navigation }: any) => {
  const setUser = useAppStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = async () => {
    if (!loginId.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your phone/email and password');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        loginId: loginId.trim(),
        password: password.trim()
      });

      const pubKey = await CryptoService.initializeUserKeys(response.data.userId);
      if (pubKey !== response.data.publicKey) {
        await axios.post(`${API_URL}/auth/public-key`, { publicKey: pubKey }, { headers: { Authorization: `Bearer ${response.data.jwt}` } });
        response.data.publicKey = pubKey;
      }

      const sessionData = {
        userId: response.data.userId,
        fullName: response.data.fullName,
        email: response.data.email,
        phoneNumber: response.data.phoneNumber,
        publicKey: response.data.publicKey,
        jwt: response.data.jwt
      };

      await SecureStore.setItemAsync('bondpay_session', JSON.stringify(sessionData));

      setUser({
        ...sessionData,
        isAuthenticated: true,
      });

      // Fetch online balance immediately so it's not 0
      await SyncService.fetchOnlineBalance(response.data.jwt);

    } catch (e: any) {
      console.error(e);
      Alert.alert('Login Failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>BondPay</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>
        
        <View style={styles.formContainer}>
          <Text style={styles.label}>PHONE OR EMAIL</Text>
          <TextInput 
            style={styles.input}
            placeholder="e.g. 9800000000 or user@email.com"
            placeholderTextColor="#888"
            keyboardType="email-address"
            autoCapitalize="none"
            value={loginId}
            onChangeText={setLoginId}
          />
 
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput 
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#888"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.buttonText}>Login</Text>}
          </TouchableOpacity>
 
          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
            <Text style={styles.linkText}>Don't have an account? Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};
 
const RegisterScreen = ({ navigation }: any) => {
  const setUser = useAppStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleRegister = async () => {
    if (!fullName.trim() || !phoneNumber.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const pubKey = await CryptoService.generateTempKeys();
      
      const response = await axios.post(`${API_URL}/auth/register`, {
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        fullName: fullName.trim(),
        password: password.trim(),
        publicKey: pubKey
      });

      // Scope the private key to the new userId
      await CryptoService.initializeUserKeys(response.data.userId);
 
      const sessionData = {
        userId: response.data.userId,
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        publicKey: pubKey,
        jwt: response.data.jwt
      };

      await SecureStore.setItemAsync('bondpay_session', JSON.stringify(sessionData));

      setUser({
        ...sessionData,
        isAuthenticated: true,
      });

      await SyncService.fetchOnlineBalance(response.data.jwt);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Registration Failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>BondPay</Text>
          <Text style={styles.subtitle}>Create a new account</Text>
        </View>
        
        <View style={styles.formContainer}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput 
            style={styles.input}
            placeholder="e.g. John Doe"
            placeholderTextColor="#888"
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput 
            style={styles.input}
            placeholder="e.g. john@example.com"
            placeholderTextColor="#888"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>PHONE NUMBER</Text>
          <TextInput 
            style={styles.input}
            placeholder="e.g. 9800000000"
            placeholderTextColor="#888"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput 
            style={styles.input}
            placeholder="Enter a strong password"
            placeholderTextColor="#888"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.buttonText}>Register</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 20 }}>
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 30,
    justifyContent: 'center',
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    padding: 30,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#2D46B9', // Deep blue from reference
    letterSpacing: -1,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    color: '#333',
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#F5F5F5',
    color: '#000',
    fontSize: 16,
    padding: 18,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  button: {
    backgroundColor: '#2D46B9',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#2D46B9',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
  }
});

export const AuthNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};
