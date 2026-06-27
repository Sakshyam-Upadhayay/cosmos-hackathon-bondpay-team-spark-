import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { SyncService } from '../services/sync.service';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import { getDB } from '../database/db';
import { Ionicons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import { ConfigService, SystemConfig, API_URL } from '../services/config.service';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const HomeScreen = () => {
  const { userId, fullName, jwt } = useAppStore((state) => state.user);
  const { online, offline, pendingOnline } = useAppStore((state) => state.balance);
  const isDark = useAppStore((state) => state.preferences.darkTheme);
  const logout = useAppStore((state) => state.logout);
  const navigation = useNavigation<any>();

  const [networkState, setNetworkState] = useState<Network.NetworkState | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);

  // Modals state
  const [topupVisible, setTopupVisible] = useState(false);
  const [bondVisible, setBondVisible] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [bondAmount, setBondAmount] = useState('');
  const [bondTtlDays, setBondTtlDays] = useState(30);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const checkNetwork = async () => {
    const state = await Network.getNetworkStateAsync();
    setNetworkState(state);
  };

  const loadSystemConfigs = async () => {
    const configs = await ConfigService.fetchConfigs();
    setSysConfig(configs);
  };

  const loadRecentPayments = async () => {
    try {
      const db = await getDB();
      const txns = await db.getAllAsync(
        `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5`
      );
      
      let allTx = (txns as any[]).map(tx => {
        const isOutgoing = tx.role === 'sender';
        const type = isOutgoing ? 'sent' : 'received';
        const amount = tx.total_amount;
        const status = tx.sync_status === 'synced' ? 'completed' : tx.sync_status;
        const otherParty = isOutgoing ? tx.receiver_id : tx.sender_id;
        const otherPartyShort = otherParty ? `${otherParty.substring(0, 8)}...` : 'Unknown';
        
        const display_name = isOutgoing ? `Sent to ${otherPartyShort}` : `From ${otherPartyShort}`;
        
        return {
          id: tx.tx_id,
          display_name,
          created_at: new Date(tx.created_at * 1000).toISOString(),
          type,
          amount,
          status,
          tx_type: 'P2P_OFFLINE'
        };
      });

      const state = await Network.getNetworkStateAsync();
      const isOnline = state.isConnected && state.isInternetReachable;

      if (isOnline && jwt) {
        try {
          const res = await axios.get(`${API_URL}/wallet/history`, { headers: { Authorization: `Bearer ${jwt}` } });
          const onlineTx = res.data.map((tx: any) => {
            const isOutgoing = tx.sender_id === userId;
            const type = isOutgoing ? 'sent' : 'received';
            const otherParty = isOutgoing ? tx.receiver_id : tx.sender_id;
            const otherPartyShort = otherParty ? `${otherParty.substring(0, 8)}...` : 'Unknown';
            
            let display_name = isOutgoing ? `Sent to ${otherPartyShort}` : `From ${otherPartyShort}`;
            
            if (tx.tx_type === 'TOPUP') {
              display_name = 'Wallet Topup';
            } else if (tx.tx_type === 'BOND_LOAD') {
              display_name = 'Loaded Offline Bonds';
            } else if (tx.tx_type === 'BOND_REVERSE') {
              display_name = 'Reversed Offline Bonds';
            }

            return {
              id: tx.tx_id,
              display_name,
              created_at: tx.tx_timestamp,
              type,
              amount: parseInt(tx.total_amount, 10),
              status: tx.status === 'accepted' ? 'completed' : tx.status,
              tx_type: tx.tx_type
            };
          });

          const txMap = new Map();
          for (const tx of allTx) txMap.set(tx.id, tx);
          for (const tx of onlineTx) {
            txMap.set(tx.id, tx);
          }
          
          allTx = Array.from(txMap.values());
        } catch (e) {
          console.error('Failed to fetch online history for Home Screen:', e);
        }
      }

      allTx.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecentPayments(allTx.slice(0, 5));
    } catch (e) {
      console.log('Failed to load recent payments:', e);
    }
  };

  useEffect(() => {
    checkNetwork();
    loadSystemConfigs();
    loadRecentPayments();
    const interval = setInterval(checkNetwork, 5000);

    // Entry animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    return () => clearInterval(interval);
  }, []);

  const isOnline = networkState?.isConnected && networkState?.isInternetReachable;

  const onRefresh = async () => {
    setRefreshing(true);
    await checkNetwork();
    await loadSystemConfigs();
    await loadRecentPayments();
    if (isOnline) {
      await syncTransactions();
    }
    setRefreshing(false);
  };

  const syncTransactions = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'You must be online to sync.');
      return;
    }
    setLoading(true);
    try {
      await SyncService.sync();
      await loadRecentPayments();
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async () => {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/wallet/topup`,
        { amount },
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      Alert.alert('Success', `Added रू ${amount} to online balance`);
      setTopupAmount('');
      setTopupVisible(false);
      await SyncService.fetchOnlineBalance(jwt!);
    } catch (e: any) {
      Alert.alert('Topup Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueBonds = async () => {
    const amount = parseInt(bondAmount, 10);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const maxCapacity = sysConfig ? sysConfig.max_offline_capacity : 10000;

    // Re-fetch fresh balances from server to prevent stale-state bypass
    let freshOffline = offline;
    try {
      await SyncService.fetchOnlineBalance(jwt!);
      await SyncService.fetchBonds(jwt!);
      const freshState = useAppStore.getState().balance;
      freshOffline = freshState.offline;
    } catch {
      // If fetch fails, proceed with local values (server will still validate)
    }

    if (freshOffline + amount > maxCapacity) {
      Alert.alert(
        'Limit Exceeded',
        `You cannot hold more than रू ${maxCapacity} offline. You currently hold रू ${freshOffline}.`
      );
      return;
    }

    if (amount > online) {
      Alert.alert('Insufficient Balance', 'You do not have enough online balance.');
      return;
    }

    const minDenom = sysConfig ? sysConfig.min_denomination : 5;
    if (amount % minDenom !== 0) {
      Alert.alert(
        'Invalid Amount',
        `Amount must be a multiple of the minimum denomination (${minDenom} NPR).`
      );
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/bonds/issue`,
        { totalAmount: amount, ttlDays: bondTtlDays },
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      Alert.alert('Success', `Loaded रू ${amount} offline bonds (expires in ${bondTtlDays} days)`);
      setBondAmount('');
      setBondTtlDays(30);
      setBondVisible(false);
      await SyncService.sync();
    } catch (e: any) {
      Alert.alert('Failed to issue bonds', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReverseBond = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'You must be connected to the internet to reverse bonds.');
      return;
    }
    Alert.alert(
      'Reverse Bonds',
      'This will send all your unspent offline bonds back to your online balance. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          onPress: async () => {
            setLoading(true);
            try {
              const db = await getDB();
              const localBonds = await db.getAllAsync(
                `SELECT bond_id FROM bonds WHERE status = 'available'`
              );
              const bondIds = (localBonds as any[]).map((b) => b.bond_id);

              if (bondIds.length === 0) {
                Alert.alert('Info', 'No offline bonds available to reverse.');
                return;
              }

              await axios.post(
                `${API_URL}/wallet/reverse-bond`,
                { bondIds },
                { headers: { Authorization: `Bearer ${jwt}` } }
              );

              await db.runAsync(`DELETE FROM bonds WHERE status = 'available'`);
              useAppStore.getState().setBalance({ offline: 0 });

              Alert.alert('Success', 'Offline bonds have been reversed to online balance.');
              await SyncService.sync();
            } catch (e: any) {
              Alert.alert('Reverse Failed', e.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const getNetworkBannerColor = () => {
    if (!networkState) return '#999';
    if (!isOnline) return '#E74C3C';
    if (networkState.type === Network.NetworkStateType.WIFI) return '#2ECC71';
    if (networkState.type === Network.NetworkStateType.CELLULAR) return '#F39C12';
    return '#2ECC71';
  };

  const getNetworkText = () => {
    if (!networkState) return 'CHECKING...';
    if (!isOnline) return 'OFFLINE';
    if (networkState.type === Network.NetworkStateType.WIFI) return 'ONLINE (WiFi)';
    if (networkState.type === Network.NetworkStateType.CELLULAR) return 'ONLINE (Cellular)';
    return 'ONLINE';
  };

  const getNetworkIcon = () => {
    if (!networkState) return 'cloud-outline';
    if (!isOnline) return 'cloud-offline-outline';
    if (networkState.type === Network.NetworkStateType.WIFI) return 'wifi';
    if (networkState.type === Network.NetworkStateType.CELLULAR) return 'cellular';
    return 'cloud-outline';
  };

  const totalBalance = online + offline + pendingOnline;
  const onlineWidth = totalBalance > 0 ? (online / totalBalance) * 100 : 0;
  const pendingWidth = totalBalance > 0 ? (pendingOnline / totalBalance) * 100 : 0;
  const offlineWidth = totalBalance > 0 ? (offline / totalBalance) * 100 : 0;

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const formatTransactionDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      {/* Connectivity Banner */}
      <View
        style={[
          styles.connectivityBanner,
          { backgroundColor: getNetworkBannerColor() },
        ]}
      >
        <Ionicons name={getNetworkIcon() as any} size={14} color="#FFF" />
        <Text style={styles.connectivityText}>{getNetworkText()}</Text>
      </View>

      <Animated.View
        style={[
          styles.dashboardCard,
          isDark && styles.darkDashboardCard,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Header Row: Avatar + Greeting + Icons */}
        <View style={styles.dashboardHeader}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => navigation.navigate('Account')}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{getInitials(fullName)}</Text>
            </View>
            <View style={styles.greetingContainer}>
              <Text style={[styles.greetingName, isDark && styles.darkText]}>
                Hi, {fullName?.split(' ')[0] || 'User'}
              </Text>
              <Text style={[styles.greetingSub, isDark && styles.darkSubtitle]}>
                Welcome to BondPay
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons
                name="settings-outline"
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={handleLogout}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Section */}
        <View style={styles.balanceSection}>
          <View style={styles.balanceHeader}>
            <View style={styles.balanceLabelRow}>
              <Ionicons
                name="wallet-outline"
                size={18}
                color="rgba(255,255,255,0.7)"
              />
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
            <TouchableOpacity
              onPress={() => setBalanceVisible(!balanceVisible)}
              style={styles.visibilityToggle}
            >
              <Ionicons
                name={balanceVisible ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="rgba(255,255,255,0.7)"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceAmount}>
            रू{' '}
            {balanceVisible ? totalBalance.toLocaleString() : '••••••'}
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressSegment,
                {
                  width: `${onlineWidth}%`,
                  backgroundColor: '#2ECC71',
                },
              ]}
            />
            <View
              style={[
                styles.progressSegment,
                {
                  width: `${pendingWidth}%`,
                  backgroundColor: '#F39C12',
                },
              ]}
            />
            <View
              style={[
                styles.progressSegment,
                {
                  width: `${offlineWidth}%`,
                  backgroundColor: '#5DADE2',
                },
              ]}
            />
          </View>

          {/* Balance Breakdown */}
          <View style={styles.balanceBreakdown}>
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownDotContainer}>
                <View style={[styles.breakdownDot, { backgroundColor: '#2ECC71' }]} />
                <Text style={styles.breakdownLabel}>Online</Text>
              </View>
              <Text style={styles.breakdownAmount}>
                रू {balanceVisible ? online.toLocaleString() : '••••'}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownDotContainer}>
                <View style={[styles.breakdownDot, { backgroundColor: '#F39C12' }]} />
                <Text style={styles.breakdownLabel}>Pending</Text>
              </View>
              <Text style={styles.breakdownAmount}>
                रू {balanceVisible ? pendingOnline.toLocaleString() : '••••'}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownDotContainer}>
                <View style={[styles.breakdownDot, { backgroundColor: '#5DADE2' }]} />
                <Text style={styles.breakdownLabel}>Offline</Text>
              </View>
              <Text style={styles.breakdownAmount}>
                रू {balanceVisible ? offline.toLocaleString() : '••••'}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2D46B9"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <ActivityIndicator
            size="small"
            color="#2D46B9"
            style={styles.loadingIndicator}
          />
        )}

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
          QUICK ACTIONS
        </Text>

        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => navigation.navigate('Send', { isOnline })}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#EBF0FF' }]}>
              <Ionicons name="arrow-up" size={24} color="#2D46B9" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Send
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => navigation.navigate('Receive', { isOnline })}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#E8F8F0' }]}>
              <Ionicons name="arrow-down" size={24} color="#27AE60" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Receive
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => {
              if (!isOnline) {
                Alert.alert('Offline', 'Internet required for Topup');
                return;
              }
              setTopupVisible(true);
            }}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="add" size={24} color="#F39C12" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Topup
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={() => {
              if (!isOnline) {
                Alert.alert('Offline', 'Internet required to load bonds');
                return;
              }
              setBondVisible(true);
            }}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#E8F0FE' }]}>
              <Ionicons name="download" size={24} color="#3498DB" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Load Bond
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionItem}
            onPress={handleReverseBond}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#FDE8E8' }]}>
              <Ionicons name="arrow-undo" size={24} color="#E74C3C" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Reverse
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem} onPress={syncTransactions}>
            <View style={[styles.quickActionIcon, { backgroundColor: '#F0E8FD' }]}>
              <Ionicons name="sync" size={24} color="#8E44AD" />
            </View>
            <Text style={[styles.quickActionLabel, isDark && styles.darkText]}>
              Sync
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recent Payments */}
        <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
          RECENT PAYMENTS
        </Text>

        <View
          style={[styles.recentPaymentsContainer, isDark && styles.darkRecentPayments]}
        >
          {recentPayments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="receipt-outline"
                size={48}
                color={isDark ? '#555' : '#CCC'}
              />
              <Text style={[styles.emptyStateText, isDark && styles.darkSubtitle]}>
                No recent payments found
              </Text>
            </View>
          ) : (
            recentPayments.map((payment, index) => (
              <View
                key={payment.id || index}
                style={[
                  styles.paymentItem,
                  index < recentPayments.length - 1 && styles.paymentItemBorder,
                ]}
              >
                <View style={styles.paymentLeft}>
                  <View style={[styles.paymentAvatar, { backgroundColor: '#EBF0FF' }]}>
                    <Text style={styles.paymentAvatarText}>
                      {(payment.display_name || 'U')
                        .substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.paymentDetails}>
                    <Text
                      style={[styles.paymentName, isDark && styles.darkText]}
                      numberOfLines={1}
                    >
                      {payment.display_name || 'Unknown'}
                    </Text>
                    <Text
                      style={[styles.paymentTime, isDark && styles.darkSubtitle]}
                    >
                      {formatTransactionDate(payment.created_at)}
                    </Text>
                  </View>
                </View>
                <View style={styles.paymentRight}>
                  <Text
                    style={[
                      styles.paymentAmount,
                      payment.type === 'received'
                        ? styles.paymentAmountPositive
                        : styles.paymentAmountNegative,
                    ]}
                  >
                    {payment.type === 'received' ? '+' : '-'} रू{' '}
                    {(payment.amount || 0).toLocaleString()}
                  </Text>
                  <View
                    style={[
                      styles.paymentStatusBadge,
                      {
                        backgroundColor:
                          payment.status === 'completed' || payment.status === 'settled'
                            ? '#E8F8F0'
                            : '#FFF3E0',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentStatusText,
                        {
                          color:
                            payment.status === 'completed' || payment.status === 'settled'
                              ? '#27AE60'
                              : '#F39C12',
                        },
                      ]}
                    >
                      {payment.status || 'pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Topup Modal */}
      <Modal visible={topupVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.darkModalContent]}>
            <Text style={[styles.modalTitle, isDark && styles.darkText]}>
              Topup Online Balance
            </Text>
            <TextInput
              style={[styles.modalInput, isDark && styles.darkModalInput]}
              placeholder="Amount (रू)"
              placeholderTextColor={isDark ? '#888' : '#AAA'}
              keyboardType="numeric"
              value={topupAmount}
              onChangeText={setTopupAmount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setTopupVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleTopup}>
                <Text style={styles.modalSubmitText}>Topup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Load Bond Modal */}
      <Modal visible={bondVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && styles.darkModalContent]}>
            <Text style={[styles.modalTitle, isDark && styles.darkText]}>
              Load Bond Money
            </Text>
            <Text style={[styles.modalSubtitle, isDark && styles.darkSubtitle]}>
              Limit: रू {sysConfig ? sysConfig.max_offline_capacity : 10000} | Balance: रू {online}
            </Text>
            <TextInput
              style={[styles.modalInput, isDark && styles.darkModalInput]}
              placeholder="Amount (रू)"
              placeholderTextColor={isDark ? '#888' : '#AAA'}
              keyboardType="numeric"
              value={bondAmount}
              onChangeText={setBondAmount}
            />

            {/* Bond Expiry Picker */}
            <Text style={[styles.ttlLabel, isDark && styles.darkText]}>Bond Expires In</Text>
            <View style={styles.ttlRow}>
              {[1, 3, 7, 14, 30].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.ttlOption,
                    bondTtlDays === days && styles.ttlOptionActive,
                    isDark && styles.darkTtlOption,
                    bondTtlDays === days && isDark && styles.darkTtlOptionActive,
                  ]}
                  onPress={() => setBondTtlDays(days)}
                >
                  <Text
                    style={[
                      styles.ttlOptionText,
                      bondTtlDays === days && styles.ttlOptionTextActive,
                    ]}
                  >
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.ttlExpiry, isDark && styles.darkSubtitle]}>
              Expires: {new Date(Date.now() + bondTtlDays * 86400000).toLocaleDateString()}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setBondVisible(false); setBondTtlDays(30); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleIssueBonds}>
                <Text style={styles.modalSubmitText}>Load</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  // Connectivity Banner
  connectivityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 8,
    gap: 6,
  },
  connectivityText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  // Dashboard Card
  dashboardCard: {
    backgroundColor: '#2D46B9',
    marginHorizontal: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingBottom: 32,
    shadowColor: '#2D46B9',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  darkDashboardCard: {
    backgroundColor: '#1A2A6C',
    shadowColor: '#1A2A6C',
  },

  // Dashboard Header
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  greetingContainer: {
    marginLeft: 14,
    flex: 1,
  },
  greetingName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  greetingSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Balance Section
  balanceSection: {
    paddingHorizontal: 24,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  visibilityToggle: {
    padding: 4,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 38,
    fontWeight: '800',
    marginBottom: 20,
    letterSpacing: 0.5,
  },

  // Progress Bar
  progressContainer: {
    height: 6,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  progressSegment: {
    height: '100%',
  },

  // Balance Breakdown
  balanceBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownItem: {
    flex: 1,
  },
  breakdownDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakdownAmount: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },

  // Scroll Content
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingIndicator: {
    marginVertical: 12,
  },

  // Section Title
  sectionTitle: {
    color: '#333',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 16,
  },

  // Quick Actions
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 20,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    color: '#333',
    fontSize: 12,
    fontWeight: '600',
  },

  // Recent Payments
  recentPaymentsContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  darkRecentPayments: {
    backgroundColor: '#1A1A1A',
    shadowOpacity: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    color: '#AAA',
    fontSize: 14,
    marginTop: 12,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  paymentItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentAvatarText: {
    color: '#2D46B9',
    fontSize: 14,
    fontWeight: '700',
  },
  paymentDetails: {
    marginLeft: 12,
    flex: 1,
  },
  paymentName: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentTime: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentAmountPositive: {
    color: '#27AE60',
  },
  paymentAmountNegative: {
    color: '#E74C3C',
  },
  paymentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  bottomSpacer: {
    height: 100,
  },

  // Dark Mode Text
  darkText: {
    color: '#FFF',
  },
  darkSubtitle: {
    color: '#AAA',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    padding: 28,
    borderRadius: 20,
    width: '85%',
  },
  darkModalContent: {
    backgroundColor: '#1E1E1E',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#F5F6FA',
    color: '#000',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#EEE',
    marginBottom: 20,
  },
  darkModalInput: {
    backgroundColor: '#2A2A2A',
    borderColor: '#333',
    color: '#FFF',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    backgroundColor: '#2D46B9',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  modalSubmitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // TTL Picker
  ttlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ttlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ttlOption: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
    backgroundColor: '#F5F6FA',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ttlOptionActive: {
    backgroundColor: '#EBF0FF',
    borderColor: '#2D46B9',
  },
  darkTtlOption: {
    backgroundColor: '#2A2A2A',
  },
  darkTtlOptionActive: {
    backgroundColor: '#1A2A6C',
    borderColor: '#4D66D9',
  },
  ttlOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  ttlOptionTextActive: {
    color: '#2D46B9',
  },
  ttlExpiry: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
    textAlign: 'center',
  },
});
