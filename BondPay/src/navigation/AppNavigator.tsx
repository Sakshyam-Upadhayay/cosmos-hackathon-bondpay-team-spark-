import React, { useState } from 'react';
import * as Network from 'expo-network';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { HomeScreen } from '../screens/HomeScreen';
import { SendScreen } from '../screens/SendScreen';
import { ReceiveScreen } from '../screens/ReceiveScreen';
import { TransactionHistoryScreen } from '../screens/TransactionHistoryScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { LogsScreen } from '../screens/LogsScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import { MoreMenu } from '../components/MoreMenu';
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const MainTabs = () => {
  const [moreVisible, setMoreVisible] = useState(false);

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            onScanPress={async () => {
              // We need access to the parent stack navigator.
              // Since we can't easily get it here, we use a global event or
              // simply store a ref. The simplest approach: use navigation.dangerouslyGetParent()
              const parent = props.navigation.getParent();
              if (parent) {
                let isOnline = false;
                try {
                  const state = await Network.getNetworkStateAsync();
                  isOnline = !!(state.isConnected && state.isInternetReachable);
                } catch (e) {
                  // Fallback to false if check fails
                }
                parent.navigate('Send', { isOnline });
              }
            }}
            onMorePress={() => setMoreVisible(true)}
          />
        )}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="History" component={TransactionHistoryScreen} />
        <Tab.Screen name="Account" component={AccountScreen} />
      </Tab.Navigator>
      <MoreMenu visible={moreVisible} onClose={() => setMoreVisible(false)} />
    </>
  );
};

export const AppNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Send" component={SendScreen} />
      <Stack.Screen name="Receive" component={ReceiveScreen} />
      <Stack.Screen name="Logs" component={LogsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
    </Stack.Navigator>
  );
};
