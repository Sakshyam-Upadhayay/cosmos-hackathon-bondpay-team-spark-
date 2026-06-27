import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Animated } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';

import { API_URL } from '../services/config.service';

export const AccountScreen = () => {
  const { userId, fullName, phoneNumber, email, jwt } = useAppStore((state) => state.user);
  const isDark = useAppStore((state) => state.preferences.darkTheme);
  const logout = useAppStore((state) => state.logout);
  const setUser = useAppStore((state) => state.setUser);
  
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(fullName || '');
  const [newPhone, setNewPhone] = useState(phoneNumber || '');
  const [newEmail, setNewEmail] = useState(email || '');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Custom Toast State
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Sync state if store updates
  useEffect(() => {
    setNewName(fullName || '');
    setNewPhone(phoneNumber || '');
    setNewEmail(email || '');
  }, [fullName, phoneNumber, email]);

  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
    ]).start();
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    showToast(`${label} copied!`);
  };

  const handleUpdate = async () => {
    if (!newName.trim() || !newPhone.trim() || !newEmail.trim()) {
      Alert.alert('Required Fields', 'Please enter your name, phone number, and email');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/auth/profile`, 
        { fullName: newName.trim(), phoneNumber: newPhone.trim(), email: newEmail.trim() },
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      
      setUser({ 
        fullName: response.data.fullName,
        phoneNumber: response.data.phoneNumber,
        email: response.data.email
      });

      // Update secure store
      const sessionStr = await SecureStore.getItemAsync('bondpay_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        session.fullName = response.data.fullName;
        session.phoneNumber = response.data.phoneNumber;
        session.email = response.data.email;
        await SecureStore.setItemAsync('bondpay_session', JSON.stringify(session));
      }

      setIsEditing(false);
      showToast('Profile updated!');
    } catch (e: any) {
      Alert.alert('Update Failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to log out? Your offline keys will remain on this device until uninstalled.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", onPress: async () => {
          await SecureStore.deleteItemAsync('bondpay_session');
          logout();
        }, style: "destructive" }
      ]
    );
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={[styles.container, isDark && styles.darkContainer]} showsVerticalScrollIndicator={false}>
        {/* Banner with Profile */}
        <LinearGradient
          colors={isDark ? ['#1A2A6C', '#0D0D0D'] : ['#2D46B9', '#1A2A6C']}
          style={styles.banner}
        >
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarGlass}>
              <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
            </View>
          </View>
          
          <Text style={styles.profileName}>{fullName}</Text>
          
          {/* Action copyable tags */}
          <View style={styles.badgeRow}>
            <TouchableOpacity 
              style={styles.badge} 
              onPress={() => copyToClipboard(userId || '', 'User ID')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={13} color="rgba(255,255,255,0.8)" style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>ID: {userId?.substring(0,8)}... <Ionicons name="copy-outline" size={11} color="rgba(255,255,255,0.6)" /></Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={styles.contentContainer}>
          {!isEditing ? (
            // VIEW MODE
            <View>
              <Text style={[styles.sectionTitle, isDark && styles.darkSubtitle]}>Profile Information</Text>
              
              <View style={[styles.infoCard, isDark && styles.darkCard]}>
                <View style={styles.infoRow}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="person-circle-outline" size={22} color="#2D46B9" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Full Name</Text>
                    <Text style={[styles.infoValue, isDark && styles.darkText]}>{fullName}</Text>
                  </View>
                </View>

                <View style={styles.cardSeparator} />

                <View style={styles.infoRow}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="mail-outline" size={22} color="#27AE60" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Email Address</Text>
                    <Text style={[styles.infoValue, isDark && styles.darkText]}>{email}</Text>
                  </View>
                </View>

                <View style={styles.cardSeparator} />

                <View style={styles.infoRow}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="call-outline" size={22} color="#F39C12" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Phone Number</Text>
                    <Text style={[styles.infoValue, isDark && styles.darkText]}>{phoneNumber}</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.sectionTitle, isDark && styles.darkSubtitle]}>Security Credentials</Text>
              
              <TouchableOpacity 
                style={[styles.infoCard, isDark && styles.darkCard, { paddingVertical: 18 }]}
                onPress={() => copyToClipboard(useAppStore.getState().user.publicKey || '', 'Public Key')}
                activeOpacity={0.7}
              >
                <View style={styles.infoRow}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="key-outline" size={22} color="#8E44AD" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.infoLabel}>Ed25519 Public Key</Text>
                      <Ionicons name="copy-outline" size={14} color="#8E44AD" />
                    </View>
                    <Text style={[styles.monoValue, isDark && styles.darkText]} numberOfLines={1} ellipsizeMode="middle">
                      {useAppStore.getState().user.publicKey || 'Not registered'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.editProfileBtn} 
                onPress={() => setIsEditing(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // EDIT MODE
            <View style={styles.editForm}>
              <Text style={[styles.sectionTitle, isDark && styles.darkSubtitle]}>Update Details</Text>
              
              <View style={[styles.inputGroup, isDark && styles.darkCard]}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>FULL NAME</Text>
                  <View style={[
                    styles.inputWrapper, 
                    focusedField === 'name' && styles.inputWrapperFocused,
                    isDark && styles.darkInputWrapper
                  ]}>
                    <Ionicons name="person-outline" size={18} color={focusedField === 'name' ? '#2D46B9' : '#888'} style={{ marginRight: 10 }} />
                    <TextInput 
                      style={[styles.textInput, isDark && styles.darkTextInput]}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="Your Name"
                      placeholderTextColor={isDark ? "#555" : "#AAA"}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                  <View style={[
                    styles.inputWrapper, 
                    focusedField === 'email' && styles.inputWrapperFocused,
                    isDark && styles.darkInputWrapper
                  ]}>
                    <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? '#2D46B9' : '#888'} style={{ marginRight: 10 }} />
                    <TextInput 
                      style={[styles.textInput, isDark && styles.darkTextInput]}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="Email Address"
                      placeholderTextColor={isDark ? "#555" : "#AAA"}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>PHONE NUMBER</Text>
                  <View style={[
                    styles.inputWrapper, 
                    focusedField === 'phone' && styles.inputWrapperFocused,
                    isDark && styles.darkInputWrapper
                  ]}>
                    <Ionicons name="call-outline" size={18} color={focusedField === 'phone' ? '#2D46B9' : '#888'} style={{ marginRight: 10 }} />
                    <TextInput 
                      style={[styles.textInput, isDark && styles.darkTextInput]}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      placeholder="Phone Number"
                      placeholderTextColor={isDark ? "#555" : "#AAA"}
                      keyboardType="phone-pad"
                      onFocus={() => setFocusedField('phone')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.editActionRow}>
                <TouchableOpacity 
                  style={[styles.actionBtn, styles.cancelBtn, isDark && styles.darkCancelBtn]} 
                  onPress={() => { setIsEditing(false); setFocusedField(null); }}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cancelBtnText, isDark && styles.darkCancelBtnText]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtn, styles.saveBtn]} 
                  onPress={handleUpdate}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.6}>
            <Ionicons name="log-out-outline" size={18} color="#E74C3C" style={{ marginRight: 6 }} />
            <Text style={styles.logoutText}>Log Out Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  darkContainer: {
    backgroundColor: '#0D0D0D',
  },
  banner: {
    paddingTop: 65,
    paddingBottom: 35,
    alignItems: 'center',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  avatarWrapper: {
    marginBottom: 15,
  },
  avatarGlass: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  contentContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 15,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  darkCard: {
    backgroundColor: '#1E1E1E',
    borderColor: '#2A2A2A',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#111',
    fontWeight: '600',
  },
  monoValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
    fontWeight: '500',
  },
  cardSeparator: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 4,
  },
  editProfileBtn: {
    flexDirection: 'row',
    backgroundColor: '#2D46B9',
    paddingVertical: 16,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#2D46B9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  editBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  editForm: {
    marginTop: 5,
  },
  inputGroup: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    paddingHorizontal: 15,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputWrapperFocused: {
    borderColor: '#2D46B9',
    backgroundColor: '#FFF',
  },
  darkInputWrapper: {
    backgroundColor: '#2A2A2A',
  },
  textInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000',
    fontWeight: '600',
  },
  darkTextInput: {
    color: '#FFF',
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#E0E0E0',
  },
  darkCancelBtn: {
    backgroundColor: '#222',
  },
  cancelBtnText: {
    color: '#555',
    fontSize: 16,
    fontWeight: '700',
  },
  darkCancelBtnText: {
    color: '#AAA',
  },
  saveBtn: {
    backgroundColor: '#2D46B9',
    shadowColor: '#2D46B9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    marginTop: 25,
    marginBottom: 40,
  },
  logoutText: {
    color: '#E74C3C',
    fontSize: 15,
    fontWeight: '700',
  },
  darkText: {
    color: '#FFF',
  },
  darkSubtitle: {
    color: '#AAA',
  },
  toast: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 9999,
  },
  toastText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  }
});
