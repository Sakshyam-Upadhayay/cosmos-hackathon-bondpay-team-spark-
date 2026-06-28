import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_URL = 'https://zenithkandel.com.np/bondpay';

export interface SystemConfig {
  min_denomination: number;
  max_offline_capacity: number;
  qr_switching_delay: number;
  max_bonds_per_request: number;
  bond_ttl_days: number;
}

export class ConfigService {
  static async fetchConfigs(): Promise<SystemConfig> {
    try {
      const res = await axios.get(`${API_URL}/server/config`);
      if (res.data) {
        await SecureStore.setItemAsync('bondpay_system_config', JSON.stringify(res.data));
        return res.data;
      }
    } catch (e) {
      console.warn('Failed to fetch configurations from server, loading cached values.', e);
    }
    
    // Attempt to load cached configs
    try {
      const cached = await SecureStore.getItemAsync('bondpay_system_config');
      if (cached) return JSON.parse(cached);
    } catch (e) {}

    // Fallback default values
    return {
      min_denomination: 5,
      max_offline_capacity: 10000,
      qr_switching_delay: 333,
      max_bonds_per_request: 50,
      bond_ttl_days: 30
    };
  }
}
