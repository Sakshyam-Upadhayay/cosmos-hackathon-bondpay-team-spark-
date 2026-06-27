import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
// Removed expo-notifications import due to Expo Go SDK 53 incompatibilities
import axios from 'axios';

import { API_URL } from '../services/config.service';

export const SettingsScreen = () => {
  const preferences = useAppStore((state) => state.preferences);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const jwt = useAppStore((state) => state.user.jwt);
  const navigation = useNavigation<any>();

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoText, setInfoText] = useState('');

  const savePreferences = async (newPrefs: any) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    await SecureStore.setItemAsync('bondpay_prefs', JSON.stringify(updated));
  };

  const toggleNotifications = async (val: boolean) => {
    // In Expo Go SDK 53, expo-notifications throws an error.
    // For this prototype, we'll just mock the preference toggle locally.
    savePreferences({ notifications: val });
  };

  const toggleBiometrics = async (val: boolean) => {
    if (val) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        Alert.alert('Not Supported', 'Your device does not have biometric hardware or you have not set it up.');
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable Biometrics',
      });

      if (authResult.success) {
        savePreferences({ biometrics: true });
        Alert.alert('Success', 'Biometric authentication enabled.');
      }
    } else {
      savePreferences({ biometrics: false });
    }
  };

  const toggleDarkTheme = (val: boolean) => {
    savePreferences({ darkTheme: val });
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/change-password`, {
        currentPassword,
        newPassword
      }, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      
      Alert.alert('Success', 'Your password has been changed successfully.');
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      Alert.alert('Failed', e.response?.data?.error || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  const showInfo = (title: string, text: string) => {
    setInfoTitle(title);
    setInfoText(text);
    setInfoModalVisible(true);
  };

  const SettingRow = ({ icon, title, type, value, onValueChange, onPress }: any) => (
    <View style={[styles.settingRow, preferences.darkTheme && styles.darkSettingRow]}>
      <View style={styles.settingRowLeft}>
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={20} color={preferences.darkTheme ? '#4D66D9' : '#2D46B9'} />
        </View>
        <Text style={[styles.settingTitle, preferences.darkTheme && styles.darkText]}>{title}</Text>
      </View>
      {type === 'toggle' ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#EEE', true: '#2D46B9' }}
          thumbColor="#FFF"
        />
      ) : (
        <TouchableOpacity onPress={onPress}>
          <Ionicons name="chevron-forward" size={20} color="#A0A0A0" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView style={[styles.container, preferences.darkTheme && styles.darkContainer]}>
      <View style={[styles.header, preferences.darkTheme && styles.darkHeader]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={preferences.darkTheme ? '#FFF' : '#333'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, preferences.darkTheme && styles.darkText]}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>PREFERENCES</Text>
        <SettingRow 
          icon="notifications-outline" 
          title="Push Notifications" 
          type="toggle" 
          value={preferences.notifications} 
          onValueChange={toggleNotifications} 
        />
        <SettingRow 
          icon="moon-outline" 
          title="Dark Theme" 
          type="toggle" 
          value={preferences.darkTheme} 
          onValueChange={toggleDarkTheme} 
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>SECURITY</Text>
        <SettingRow 
          icon="finger-print-outline" 
          title="Biometric Authentication" 
          type="toggle" 
          value={preferences.biometrics} 
          onValueChange={toggleBiometrics} 
        />
        <SettingRow 
          icon="lock-closed-outline" 
          title="Change Password" 
          type="link" 
          onPress={() => setPasswordModalVisible(true)} 
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <SettingRow 
          icon="document-text-outline" 
          title="Terms & Conditions" 
          type="link" 
          onPress={() => showInfo('Terms & Conditions', '1. Use BondPay responsibly.\n2. Offline bonds require exact change.\n3. By using this app you agree to the mock terms.')} 
        />
        <SettingRow 
          icon="shield-checkmark-outline" 
          title="Privacy Policy" 
          type="link" 
          onPress={() => showInfo('Privacy Policy', '1. We store your data securely.\n2. We do not sell your personal information.\n3. Local bonds are stored on your device using SecureStore.')} 
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>DEVELOPER</Text>
        <SettingRow 
          icon="bug-outline" 
          title="Developer Logs" 
          type="link" 
          onPress={() => navigation.navigate('Logs')} 
        />
      </View>
      
      <View style={styles.footer}>
         <Text style={styles.versionText}>BondPay v1.0.0</Text>
      </View>

      {/* Info Modal */}
      <Modal visible={infoModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, preferences.darkTheme && styles.darkModal]}>
            <Text style={[styles.modalTitle, preferences.darkTheme && styles.darkText]}>{infoTitle}</Text>
            <Text style={[styles.modalText, preferences.darkTheme && styles.darkText]}>{infoText}</Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => setInfoModalVisible(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, preferences.darkTheme && styles.darkModal]}>
            <Text style={[styles.modalTitle, preferences.darkTheme && styles.darkText]}>Change Password</Text>
            
            <TextInput
              style={[styles.input, preferences.darkTheme && styles.darkInput]}
              placeholder="Current Password"
              placeholderTextColor="#A0A0A0"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={[styles.input, preferences.darkTheme && styles.darkInput]}
              placeholder="New Password"
              placeholderTextColor="#A0A0A0"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={[styles.input, preferences.darkTheme && styles.darkInput]}
              placeholder="Confirm New Password"
              placeholderTextColor="#A0A0A0"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPasswordModalVisible(false)} disabled={loading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  darkContainer: { backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  backBtn: { marginRight: 14, padding: 2 },
  darkHeader: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  headerTitle: { color: '#000', fontSize: 24, fontWeight: 'bold' },
  darkText: { color: '#FFFFFF' },
  section: { marginTop: 25, paddingHorizontal: 20 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 10, letterSpacing: 1 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 15, marginBottom: 1, borderWidth: 1, borderColor: '#EEE', borderRadius: 8, marginTop: 10 },
  darkSettingRow: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  settingRowLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(45, 70, 185, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  settingTitle: { fontSize: 16, color: '#333', fontWeight: '500' },
  footer: { alignItems: 'center', marginTop: 40, marginBottom: 60 },
  versionText: { color: '#A0A0A0', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', width: '85%', padding: 25, borderRadius: 12 },
  darkModal: { backgroundColor: '#1E1E1E' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#000' },
  modalText: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 20 },
  modalButton: { backgroundColor: '#2D46B9', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  input: { backgroundColor: '#F5F5F5', color: '#000', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  darkInput: { backgroundColor: '#333', color: '#FFF' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  cancelBtn: { padding: 12, marginRight: 10 },
  cancelBtnText: { color: '#888', fontWeight: 'bold', fontSize: 16 },
  saveBtn: { backgroundColor: '#2D46B9', padding: 12, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
