import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  onScanPress: () => void;
  onMorePress: () => void;
}

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  History: { focused: 'time', unfocused: 'time-outline' },
  Account: { focused: 'person', unfocused: 'person-outline' },
};

export const CustomTabBar = ({
  state,
  descriptors,
  navigation,
  onScanPress,
  onMorePress,
}: CustomTabBarProps) => {
  const isDark = useAppStore((s) => s.preferences.darkTheme);
  const currentRoute = state.routes[state.index].name;

  const getTabColor = (routeName: string) => {
    return currentRoute === routeName
      ? isDark
        ? '#6B8AFF'
        : '#2D46B9'
      : isDark
        ? '#666'
        : '#AAA';
  };

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      {/* Tab: Home */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={
            (currentRoute === 'Home'
              ? TAB_ICONS.Home.focused
              : TAB_ICONS.Home.unfocused) as any
          }
          size={22}
          color={getTabColor('Home')}
        />
        <Text style={[styles.label, { color: getTabColor('Home') }]}>Home</Text>
      </TouchableOpacity>

      {/* Tab: History */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => navigation.navigate('History')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={
            (currentRoute === 'History'
              ? TAB_ICONS.History.focused
              : TAB_ICONS.History.unfocused) as any
          }
          size={22}
          color={getTabColor('History')}
        />
        <Text style={[styles.label, { color: getTabColor('History') }]}>
          History
        </Text>
      </TouchableOpacity>

      {/* Center Scan FAB */}
      <TouchableOpacity
        style={styles.fabWrapper}
        onPress={onScanPress}
        activeOpacity={0.85}
      >
        <View style={styles.fab}>
          <Ionicons name="scan-outline" size={28} color="#FFF" />
        </View>
        <Text style={[styles.fabLabel, { color: isDark ? '#6B8AFF' : '#2D46B9' }]}>
          Scan
        </Text>
      </TouchableOpacity>

      {/* Tab: Account */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => navigation.navigate('Account')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={
            (currentRoute === 'Account'
              ? TAB_ICONS.Account.focused
              : TAB_ICONS.Account.unfocused) as any
          }
          size={22}
          color={getTabColor('Account')}
        />
        <Text style={[styles.label, { color: getTabColor('Account') }]}>
          Account
        </Text>
      </TouchableOpacity>

      {/* Tab: More */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={onMorePress}
        activeOpacity={0.7}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={isDark ? '#666' : '#AAA'}
        />
        <Text style={[styles.label, { color: isDark ? '#666' : '#AAA' }]}>
          More
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    alignItems: 'center',
  },
  darkContainer: {
    backgroundColor: '#1A1A1A',
    borderTopColor: '#333',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2D46B9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2D46B9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  fabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
});
