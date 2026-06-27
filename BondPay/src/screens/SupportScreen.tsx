import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';

export const SupportScreen = () => {
  const isDark = useAppStore((state) => state.preferences.darkTheme);
  
  return (
    <ScrollView style={[styles.container, isDark && styles.darkContainer]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>Help & Support</Text>
      </View>

      <View style={styles.contactCards}>
        <TouchableOpacity style={[styles.card, isDark && styles.darkCard]}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]}>
            <Ionicons name="call" size={24} color="#34C759" />
          </View>
          <Text style={[styles.cardTitle, isDark && styles.darkText]}>Call Us</Text>
          <Text style={styles.cardSub}>24/7 Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, isDark && styles.darkCard]}>
          <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 149, 0, 0.1)' }]}>
            <Ionicons name="chatbubbles" size={24} color="#FF9500" />
          </View>
          <Text style={[styles.cardTitle, isDark && styles.darkText]}>Live Chat</Text>
          <Text style={styles.cardSub}>Typical reply: 5m</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formContainer}>
        <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Send us a message</Text>
        
        <Text style={[styles.label, isDark && styles.darkText]}>SUBJECT</Text>
        <TextInput 
          style={[styles.input, isDark && styles.darkInput]}
          placeholder="What is this regarding?"
          placeholderTextColor={isDark ? "#888" : "#A0A0A0"}
        />

        <Text style={[styles.label, isDark && styles.darkText]}>DESCRIPTION</Text>
        <TextInput 
          style={[styles.input, styles.textArea, isDark && styles.darkInput]}
          placeholder="Please describe your issue..."
          placeholderTextColor={isDark ? "#888" : "#A0A0A0"}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.submitButton}>
          <Text style={styles.submitButtonText}>Submit Ticket</Text>
          <Ionicons name="send" size={16} color="#FFF" style={{ marginLeft: 10 }} />
        </TouchableOpacity>
      </View>

      <View style={[styles.faqSection, isDark && styles.darkFaqSection]}>
        <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Frequently Asked Questions</Text>
        
        <TouchableOpacity style={[styles.faqItem, isDark && styles.darkFaqItem]}>
          <Text style={[styles.faqText, isDark && styles.darkText]}>How does Offline Sending work?</Text>
          <Ionicons name="chevron-forward" size={20} color={isDark ? "#666" : "#A0A0A0"} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.faqItem, isDark && styles.darkFaqItem]}>
          <Text style={[styles.faqText, isDark && styles.darkText]}>What is the offline limit?</Text>
          <Ionicons name="chevron-forward" size={20} color={isDark ? "#666" : "#A0A0A0"} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.faqItem, isDark && styles.darkFaqItem, { borderBottomWidth: 0 }]}>
          <Text style={[styles.faqText, isDark && styles.darkText]}>I forgot my password</Text>
          <Ionicons name="chevron-forward" size={20} color={isDark ? "#666" : "#A0A0A0"} />
        </TouchableOpacity>
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  darkContainer: { backgroundColor: '#121212' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  darkHeader: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  headerTitle: { color: '#000', fontSize: 24, fontWeight: 'bold' },
  darkText: { color: '#FFF' },
  contactCards: { flexDirection: 'row', padding: 20, justifyContent: 'space-between' },
  card: { flex: 1, backgroundColor: '#FAFAFA', padding: 20, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#EEE', marginHorizontal: 5 },
  darkCard: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#000', marginBottom: 5 },
  cardSub: { fontSize: 12, color: '#888' },
  formContainer: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8, letterSpacing: 1 },
  input: { backgroundColor: '#F5F5F5', color: '#000', padding: 15, fontSize: 16, borderRadius: 8, borderWidth: 1, borderColor: '#EEE', marginBottom: 20 },
  darkInput: { backgroundColor: '#333', borderColor: '#444', color: '#FFF' },
  textArea: { height: 120 },
  submitButton: { backgroundColor: '#2D46B9', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  faqSection: { padding: 20, backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: '#EEE' },
  darkFaqSection: { backgroundColor: '#1E1E1E', borderTopColor: '#333' },
  faqItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  darkFaqItem: { borderBottomColor: '#333' },
  faqText: { fontSize: 14, color: '#333', fontWeight: '500' }
});
