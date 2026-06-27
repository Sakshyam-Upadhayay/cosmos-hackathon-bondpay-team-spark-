import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('WARNING: JWT_SECRET is not set in production. Using insecure default.');
}

export const config = {
  jwtSecret: process.env.JWT_SECRET || 'super_secret',
  serverPrivateKeyBase64: process.env.SERVER_ED25519_PRIVATE_KEY || '',
  serverKeyVersion: process.env.SERVER_KEY_VERSION || 'v1.0',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  port: process.env.PORT || 3000,
};

export const limits = {
  MAX_OFFLINE_BOND_PAISA: parseInt(process.env.MAX_OFFLINE_BOND_PAISA || '500000', 10),
  BOND_TTL_DAYS: parseInt(process.env.BOND_TTL_DAYS || '30', 10),
  MAX_BONDS_PER_REQUEST: parseInt(process.env.MAX_BONDS_PER_REQUEST || '50', 10)
};
