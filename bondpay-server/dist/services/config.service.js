"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const db_1 = require("../database/db");
class ConfigService {
    static async getConfigs() {
        try {
            const res = await (0, db_1.query)('SELECT config_key, config_value FROM system_config');
            const configs = {};
            for (const row of res.rows) {
                configs[row.config_key] = row.config_value;
            }
            return configs;
        }
        catch (e) {
            console.error('Failed to get dynamic configs, using default limits.', e);
            return {};
        }
    }
    static async getConfigVal(key, defaultValue) {
        try {
            const res = await (0, db_1.query)('SELECT config_value FROM system_config WHERE config_key = $1', [key]);
            if (res.rows.length === 0)
                return defaultValue;
            return res.rows[0].config_value;
        }
        catch (e) {
            return defaultValue;
        }
    }
    static async getConfigNum(key, defaultValue) {
        const val = await this.getConfigVal(key, defaultValue.toString());
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=config.service.js.map