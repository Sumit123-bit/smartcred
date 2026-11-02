import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  dbPath: path.resolve(
    process.cwd(),
    process.env.SQLITE_DB_PATH || './database/smartcred.db'
  ),
  uploadsDir: path.resolve(process.cwd(), 'uploads'),
  enableDemoSeed: process.env.ENABLE_DEMO_SEED !== 'false',

  jwtAccessSecret:
    process.env.JWT_ACCESS_SECRET || 'smartcred-dev-access-secret-9f8e7d6c5b4a3210-persistent',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'smartcred-dev-refresh-secret-1a2b3c4d5e6f7890-persistent',
  csrfSecret:
    process.env.CSRF_SECRET || 'smartcred-dev-csrf-hmac-secret-7c6b5a4d3e2f1098-persistent',
  qrHmacSecret:
    process.env.QR_HMAC_SECRET || 'smartcred-dev-qr-hmac-secret-4f3e2d1c0b9a8765-persistent',

  accessTokenTtl: '30m',
  refreshTokenDays: 7,

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'SmartCred <no-reply@smartcred.demo>',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  },
};
