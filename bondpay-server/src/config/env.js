require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY,
  SERVER_PUBLIC_KEY: process.env.SERVER_PUBLIC_KEY,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:8081',
};
