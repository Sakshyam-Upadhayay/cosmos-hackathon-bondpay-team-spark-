import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MoreMenuProps {
  visible: boolean;
  onClose: () => void;
}

const MENU_ITEMS = [
  {
    key: 'Settings',
    label: 'Settings',
    icon: 'settings-outline',
    color: '#2D46B9',
  },
  {
    key: 'Support',
    label: 'Help & Support',
    icon: 'help-circle-outline',
    color: '#27AE60',
  },
  {
    key: 'Logs',
    label: 'App Logs',
    icon: 'document-text-outline',
    color: '#F39C12',
  },
];

export const MoreMenu = ({ visible, onClose }: MoreMenuProps) => {
  const navigation = useNavigation<any>();
  const isDark = useAppStore((s) => s.preferences.darkTheme);

  const handleItemPress = (key: string) => {
    onClose();
    setTimeout(() => {
      navigation.navigate(key);
    }, 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, isDark && styles.darkSheet]}>
              {/* Handle bar */}
              <View style={styles.handleBarContainer}>
                <View style={styles.handleBar} />
              </View>

              {/* Title */}
              <Text style={[styles.title, isDark && styles.darkText]}>More</Text>

              {/* Menu items */}
              <View style={styles.menuList}>
                {MENU_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.menuItem, isDark && styles.darkMenuItem]}
                    onPress={() => handleItemPress(item.key)}
                    activeOpacity={0.6}
                  >
                    <View
                      style={[
                        styles.menuIconContainer,
                        { backgroundColor: `${item.color}15` },
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={22}
                        color={item.color}
                      />
                    </View>
                    <Text style={[styles.menuLabel, isDark && styles.darkText]}>
                      {item.label}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={isDark ? '#555' : '#CCC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cancel */}
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={[styles.cancelText, isDark && styles.darkSubtitle]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  darkSheet: {
    backgroundColor: '#1A1A1A',
  },
  handleBarContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  menuList: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  darkMenuItem: {},
  menuIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginLeft: 14,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  darkText: {
    color: '#FFF',
  },
  darkSubtitle: {
    color: '#888',
  },
});
