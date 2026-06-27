import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useLogStore, LogEntry } from '../store/useLogStore';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../store/useAppStore';

export const LogsScreen = () => {
  const navigation = useNavigation();
  const logs = useLogStore((state) => state.logs);
  const clearLogs = useLogStore((state) => state.clearLogs);
  const getLogsAsString = useLogStore((state) => state.getLogsAsString);
  const isDark = useAppStore((state) => state.preferences.darkTheme);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const handleCopyLogs = async () => {
    const logsString = getLogsAsString();
    if (!logsString) {
      Alert.alert('No Logs', 'There are no logs to copy.');
      return;
    }
    await Clipboard.setStringAsync(logsString);
    Alert.alert('Copied!', 'Logs copied to clipboard successfully.');
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'ERROR': return '#E74C3C';
      case 'WARN': return '#F39C12';
      case 'INFO': return '#2980B9';
      default: return '#333';
    }
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogId(prev => prev === id ? null : id);
  };

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#000"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>Developer Logs</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handleCopyLogs}>
          <Ionicons name="copy-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.actionText}>Copy All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.clearButton]} onPress={clearLogs}>
          <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.actionText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No logs recorded yet.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={{ paddingBottom: 20 }}>
          {logs.map((log: LogEntry) => (
            <TouchableOpacity 
              key={log.id} 
              style={[styles.logCard, isDark && styles.darkLogCard, { borderLeftColor: getLogColor(log.level) }]}
              onPress={() => toggleLogExpand(log.id)}
            >
              <View style={styles.logHeader}>
                <Text style={[styles.logLevel, { color: getLogColor(log.level) }]}>{log.level}</Text>
                <Text style={[styles.logContext, isDark && styles.darkLogContext]}>{log.context}</Text>
                <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
              </View>
              <Text style={[styles.logMessage, isDark && styles.darkText]}>{log.message}</Text>
              
              {expandedLogId === log.id && log.data && (
                <View style={[styles.logDataContainer, isDark && styles.darkLogDataContainer]}>
                  <Text style={[styles.logDataText, isDark && styles.darkText]}>{JSON.stringify(log.data, null, 2)}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  darkContainer: { backgroundColor: '#121212' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  darkHeader: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  backButton: { padding: 5 },
  headerTitle: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  darkText: { color: '#FFF' },
  actionRow: { flexDirection: 'row', padding: 15, justifyContent: 'space-between' },
  actionButton: { flex: 1, flexDirection: 'row', backgroundColor: '#2D46B9', paddingVertical: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: 5 },
  clearButton: { backgroundColor: '#E74C3C' },
  actionText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16 },
  scrollContainer: { flex: 1, paddingHorizontal: 15 },
  logCard: { backgroundColor: '#FFF', borderRadius: 8, padding: 15, marginBottom: 10, borderLeftWidth: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  darkLogCard: { backgroundColor: '#1E1E1E' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  logLevel: { fontWeight: 'bold', fontSize: 12, marginRight: 10 },
  logContext: { flex: 1, fontWeight: '600', color: '#555', fontSize: 12 },
  darkLogContext: { color: '#CCC' },
  logTime: { color: '#999', fontSize: 10 },
  logMessage: { color: '#333', fontSize: 14, marginTop: 5 },
  logDataContainer: { marginTop: 10, backgroundColor: '#F0F0F0', padding: 10, borderRadius: 6 },
  darkLogDataContainer: { backgroundColor: '#2D2D2D' },
  logDataText: { fontFamily: 'monospace', fontSize: 10, color: '#333' }
});
