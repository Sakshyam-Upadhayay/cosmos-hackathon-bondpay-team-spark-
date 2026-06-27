import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { getDB } from '../database/db';
import { useAppStore } from '../store/useAppStore';
import { SyncService } from '../services/sync.service';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Network from 'expo-network';

import { API_URL } from '../services/config.service';

export const TransactionHistoryScreen = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { userId, jwt } = useAppStore((state) => state.user);
  const preferences = useAppStore((state) => state.preferences);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, PENDING, COMPLETED, FAILED
  const [sortOrder, setSortOrder] = useState('NEWEST'); // NEWEST, OLDEST, HIGHEST

  // Modal State
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const fetchTransactions = async () => {
    try {
      const db = await getDB();
      const localResult = await db.getAllAsync(`
        SELECT * FROM transactions ORDER BY timestamp DESC
      `);
      
      let allTx = (localResult as any[]).map(tx => ({
        id: tx.tx_id,
        role: tx.role,
        amount: tx.total_amount,
        timestamp: tx.timestamp,
        status: tx.sync_status === 'synced' ? 'completed' : tx.sync_status, // normalize status
        type: 'P2P_OFFLINE',
        otherParty: tx.role === 'sender' ? tx.receiver_id : tx.sender_id,
        message: tx.message || '',
        rejectionReason: tx.rejection_reason || ''
      }));

      const networkState = await Network.getNetworkStateAsync();
      const isOnline = networkState.isConnected && networkState.isInternetReachable;

      if (isOnline && jwt) {
        try {
          const res = await axios.get(`${API_URL}/wallet/history`, { headers: { Authorization: `Bearer ${jwt}` } });
          const onlineTx = res.data.map((tx: any) => {
            const role = tx.sender_id === userId ? 'sender' : (tx.receiver_id === userId ? 'receiver' : 'self');
            const otherParty = tx.sender_id === userId ? tx.receiver_id : tx.sender_id;
            return {
              id: tx.tx_id,
              role: role,
              amount: parseInt(tx.total_amount, 10),
              timestamp: new Date(tx.tx_timestamp).getTime() / 1000,
              status: tx.status === 'accepted' ? 'completed' : tx.status,
              type: tx.tx_type,
              otherParty: otherParty,
              message: tx.message || '',
              rejectionReason: '' // Online tx don't have rejection reason in this endpoint currently
            };
          });

          const txMap = new Map();
          for (const tx of allTx) txMap.set(tx.id, tx);
          for (const tx of onlineTx) {
            txMap.set(tx.id, tx);
          }
          
          allTx = Array.from(txMap.values());
        } catch (e) {
          console.error('Failed to fetch online history:', e);
        }
      }

      setTransactions(allTx);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const onRefresh = async () => {
    setLoading(true);
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected && networkState.isInternetReachable) {
         await SyncService.sync();
      }
      await fetchTransactions();
    } catch (e) {
      setLoading(false);
    }
  };

  const getFilteredTransactions = () => {
    let result = transactions;

    // Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(tx => 
        tx.id.toLowerCase().includes(q) ||
        (tx.otherParty && tx.otherParty.toLowerCase().includes(q)) ||
        (tx.message && tx.message.toLowerCase().includes(q))
      );
    }

    // Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter(tx => {
        if (statusFilter === 'COMPLETED') return tx.status === 'completed';
        if (statusFilter === 'PENDING') return tx.status === 'pending';
        if (statusFilter === 'FAILED') return tx.status === 'failed' || tx.status === 'flagged';
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === 'NEWEST') return b.timestamp - a.timestamp;
      if (sortOrder === 'OLDEST') return a.timestamp - b.timestamp;
      if (sortOrder === 'HIGHEST') return b.amount - a.amount;
      return 0;
    });

    return result;
  };

  const filteredTransactions = getFilteredTransactions();

  const renderItem = ({ item }: { item: any }) => {
    const isOutgoing = item.role === 'sender';
    const date = new Date(item.timestamp * 1000).toLocaleString();
    
    let iconName: any = 'swap-horizontal';
    let iconColor = '#000';
    let bgColor = '#EEE';

    if (item.type === 'TOPUP') {
      iconName = 'add';
      iconColor = '#34C759';
      bgColor = 'rgba(52, 199, 89, 0.1)';
    } else if (item.type === 'BOND_LOAD') {
      iconName = 'download';
      iconColor = '#FF9500';
      bgColor = 'rgba(255, 149, 0, 0.1)';
    } else if (item.type === 'BOND_REVERSE') {
      iconName = 'push';
      iconColor = '#2D46B9';
      bgColor = 'rgba(45, 70, 185, 0.1)';
    } else {
      iconName = isOutgoing ? 'arrow-up' : 'arrow-down';
      iconColor = isOutgoing ? '#FF3B30' : '#34C759';
      bgColor = isOutgoing ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)';
    }

    let title = '';
    if (item.type === 'TOPUP') title = 'Wallet Topup';
    else if (item.type === 'BOND_LOAD') title = 'Loaded Offline Bonds';
    else if (item.type === 'BOND_REVERSE') title = 'Reversed Offline Bonds';
    else title = isOutgoing ? `Sent to ${item.otherParty?.substring(0, 8)}...` : `From ${item.otherParty?.substring(0, 8)}...`;

    const isDark = preferences.darkTheme;
    const itemStatusColor = item.status === 'completed' ? '#34C759' : item.status === 'pending' ? '#F39C12' : '#E74C3C';
    const itemStatusIcon = item.status === 'completed' ? 'checkmark-circle' : item.status === 'pending' ? 'time-outline' : 'warning';

    return (
      <TouchableOpacity 
         style={[styles.card, isDark && styles.darkCard]}
         onPress={() => setSelectedTx(item)}
      >
        <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
          <Ionicons name={iconName} size={24} color={iconColor} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, isDark && styles.darkText]}>{title}</Text>
          <Text style={[styles.cardDate, isDark && styles.darkSubtitle]}>{date}</Text>
          {item.message ? (
             <Text style={[styles.cardMessage, isDark && styles.darkSubtitle]} numberOfLines={1}>"{item.message}"</Text>
          ) : null}
          <View style={styles.statusRow}>
            <Ionicons name={itemStatusIcon} size={12} color={itemStatusColor} />
            <Text style={[styles.cardStatus, { color: itemStatusColor }]}>{item.status?.toUpperCase()}</Text>
            {item.type.includes('OFFLINE') && (
               <Text style={styles.offlineTag}> • OFFLINE</Text>
            )}
          </View>
        </View>
        <Text style={[styles.cardAmount, { color: iconColor }]}>
          {isOutgoing || item.type === 'BOND_LOAD' ? '-' : '+'}₹{item.amount}
        </Text>
      </TouchableOpacity>
    );
  };

  const isDark = preferences.darkTheme;

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>Transaction History</Text>
        
        {/* Search Bar */}
        <View style={[styles.searchBar, isDark && styles.darkInputBg]}>
          <Ionicons name="search" size={20} color={isDark ? '#AAA' : '#666'} />
          <TextInput
            style={[styles.searchInput, isDark && styles.darkText]}
            placeholder="Search ID, Message or User..."
            placeholderTextColor={isDark ? '#AAA' : '#999'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
           <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {['ALL', 'COMPLETED', 'PENDING', 'FAILED'].map((s) => (
                 <TouchableOpacity 
                    key={s} 
                    style={[styles.filterChip, statusFilter === s && styles.filterChipActive, isDark && statusFilter !== s && styles.darkInputBg]} 
                    onPress={() => setStatusFilter(s)}
                 >
                    <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive, isDark && statusFilter !== s && {color: '#CCC'}]}>{s}</Text>
                 </TouchableOpacity>
              ))}
           </ScrollView>
        </View>

        {/* Sorting */}
        <View style={styles.sortContainer}>
           <Text style={styles.sortLabel}>Sort by:</Text>
           {['NEWEST', 'OLDEST', 'HIGHEST'].map(s => (
             <TouchableOpacity key={s} onPress={() => setSortOrder(s)}>
               <Text style={[styles.sortOption, sortOrder === s && styles.sortOptionActive]}>{s}</Text>
             </TouchableOpacity>
           ))}
        </View>
      </View>

      {loading && transactions.length === 0 ? (
        <ActivityIndicator size="large" color="#2D46B9" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#2D46B9" />}
          ListEmptyComponent={<Text style={[styles.emptyText, isDark && styles.darkSubtitle]}>No matching transactions found.</Text>}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Transaction Details Modal */}
      <Modal visible={!!selectedTx} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.darkModal]}>
            {selectedTx && (
               <>
                 <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isDark && styles.darkText]}>Transaction Details</Text>
                    <TouchableOpacity onPress={() => setSelectedTx(null)}>
                      <Ionicons name="close" size={28} color={isDark ? '#FFF' : '#000'} />
                    </TouchableOpacity>
                 </View>
                 
                 <ScrollView>
                   <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Transaction ID</Text>
                      <Text style={[styles.detailValue, isDark && styles.darkText]}>{selectedTx.id}</Text>
                   </View>
                   <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={[styles.detailValue, isDark && styles.darkText]}>{selectedTx.type.replace('_', ' ')}</Text>
                   </View>
                   <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Date</Text>
                      <Text style={[styles.detailValue, isDark && styles.darkText]}>{new Date(selectedTx.timestamp * 1000).toLocaleString()}</Text>
                   </View>
                   <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Amount</Text>
                      <Text style={[styles.detailValue, isDark && styles.darkText, { fontSize: 24, fontWeight: 'bold' }]}>₹{selectedTx.amount}</Text>
                   </View>
                   
                   {selectedTx.otherParty && (
                     <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{selectedTx.role === 'sender' ? 'Sent To' : 'Received From'}</Text>
                        <Text style={[styles.detailValue, isDark && styles.darkText]}>{selectedTx.otherParty}</Text>
                     </View>
                   )}

                   {selectedTx.message ? (
                     <View style={styles.detailMessageBlock}>
                        <Text style={styles.detailLabel}>Payment Message</Text>
                        <Text style={[styles.detailMessageText, isDark && styles.darkText]}>"{selectedTx.message}"</Text>
                     </View>
                   ) : null}

                   <View style={[styles.statusBlock, selectedTx.status === 'failed' ? styles.statusBlockFailed : selectedTx.status === 'pending' ? styles.statusBlockPending : styles.statusBlockSuccess]}>
                      <Text style={[styles.statusBlockTitle, isDark && styles.darkText]}>Status: {selectedTx.status.toUpperCase()}</Text>
                      {selectedTx.rejectionReason ? (
                        <Text style={styles.statusBlockReason}>Reason: {selectedTx.rejectionReason}</Text>
                      ) : null}
                   </View>

                 </ScrollView>
               </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  darkContainer: { backgroundColor: '#121212' },
  header: { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  darkHeader: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  headerTitle: { color: '#000', fontSize: 24, fontWeight: 'bold', marginBottom: 15 },
  darkText: { color: '#FFFFFF' },
  darkSubtitle: { color: '#AAAAAA' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEE', borderRadius: 8, paddingHorizontal: 10, marginBottom: 15 },
  darkInputBg: { backgroundColor: '#333' },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, fontSize: 16 },
  filtersContainer: { flexDirection: 'row', marginBottom: 15 },
  filterChip: { backgroundColor: '#E0E0E0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  filterChipActive: { backgroundColor: '#2D46B9' },
  filterText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  filterTextActive: { color: '#FFF' },
  sortContainer: { flexDirection: 'row', alignItems: 'center' },
  sortLabel: { fontSize: 12, color: '#888', marginRight: 10 },
  sortOption: { fontSize: 12, color: '#888', marginRight: 15, fontWeight: 'bold' },
  sortOptionActive: { color: '#2D46B9' },
  
  listContent: { padding: 20 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, marginBottom: 15, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  darkCard: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#000', fontSize: 16, fontWeight: '600', marginBottom: 5 },
  cardDate: { color: '#888', fontSize: 12, marginBottom: 5 },
  cardMessage: { color: '#555', fontSize: 12, fontStyle: 'italic', marginBottom: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  cardStatus: { fontSize: 10, marginLeft: 5, letterSpacing: 1, fontWeight: 'bold' },
  offlineTag: { color: '#F39C12', fontSize: 10, fontWeight: 'bold' },
  cardAmount: { fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 50 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25 },
  darkModal: { backgroundColor: '#1E1E1E' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },
  detailRow: { marginBottom: 20 },
  detailLabel: { fontSize: 12, color: '#888', marginBottom: 5, textTransform: 'uppercase' },
  detailValue: { fontSize: 16, color: '#000' },
  detailMessageBlock: { backgroundColor: 'rgba(45, 70, 185, 0.05)', padding: 15, borderRadius: 8, marginBottom: 20 },
  detailMessageText: { fontSize: 16, fontStyle: 'italic', color: '#333', marginTop: 5 },
  
  statusBlock: { padding: 15, borderRadius: 8, marginTop: 10 },
  statusBlockSuccess: { backgroundColor: 'rgba(52, 199, 89, 0.1)' },
  statusBlockPending: { backgroundColor: 'rgba(243, 156, 18, 0.1)' },
  statusBlockFailed: { backgroundColor: 'rgba(231, 76, 60, 0.1)' },
  statusBlockTitle: { fontSize: 14, fontWeight: 'bold', color: '#000' },
  statusBlockReason: { fontSize: 14, color: '#E74C3C', marginTop: 5, fontWeight: '500' }
});
