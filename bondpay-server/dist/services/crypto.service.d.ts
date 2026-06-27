export declare class CryptoService {
    private static privateKey;
    private static publicKey;
    private static publicKeyBase64;
    static init(): Promise<void>;
    static getPublicKeyBase64(): string;
    static signBond(dataString: string): Promise<string>;
    static verifySignature(dataString: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean>;
}
//# sourceMappingURL=crypto.service.d.ts.map