import { query } from '../database/db';

export class ConfigService {
  static async getConfigs(): Promise<Record<string, string>> {
    try {
      const res = await query('SELECT config_key, config_value FROM system_config');
      const configs: Record<string, string> = {};
      for (const row of res.rows) {
        configs[row.config_key] = row.config_value;
      }
      return configs;
    } catch (e) {
      console.error('Failed to get dynamic configs, using default limits.', e);
      return {};
    }
  }

  static async getConfigVal(key: string, defaultValue: string): Promise<string> {
    try {
      const res = await query('SELECT config_value FROM system_config WHERE config_key = $1', [key]);
      if (res.rows.length === 0) return defaultValue;
      return res.rows[0].config_value;
    } catch (e) {
      return defaultValue;
    }
  }

  static async getConfigNum(key: string, defaultValue: number): Promise<number> {
    const val = await this.getConfigVal(key, defaultValue.toString());
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}
