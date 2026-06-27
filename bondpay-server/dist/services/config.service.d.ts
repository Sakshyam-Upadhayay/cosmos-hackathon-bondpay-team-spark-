export declare class ConfigService {
    static getConfigs(): Promise<Record<string, string>>;
    static getConfigVal(key: string, defaultValue: string): Promise<string>;
    static getConfigNum(key: string, defaultValue: number): Promise<number>;
}
//# sourceMappingURL=config.service.d.ts.map