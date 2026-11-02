import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './server/config.ts';
import { getDb } from './server/db/database.ts';
import { seedDatabaseIfEmpty } from './server/db/seed.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import { publicRouter } from './server/routes/publicRoutes.ts';
import { userRouter } from './server/routes/userRoutes.ts';
import { appointmentRouter } from './server/routes/appointmentRoutes.ts';
import { professionalRouter } from './server/routes/professionalRoutes.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';

async function startServer() {
  // Initialize SQLite database & run idempotent baseline/demo seed on startup
  getDb();
  const seedResult = seedDatabaseIfEmpty(false);
  if (seedResult.seeded) {
    console.log(`[SmartCred] ${seedResult.message}`);
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded avatars and generated studio assets in both dev and production
  if (!fs.existsSync(CONFIG.uploadsDir)) {
    fs.mkdirSync(CONFIG.uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(CONFIG.uploadsDir));
  app.use(
    '/src/assets/images',
    express.static(path.resolve(process.cwd(), 'src/assets/images'))
  );

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', database: 'sqlite', persistent: true });
  });

  // Mount REST API routes
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/users', userRouter);
  app.use('/api/appointments', appointmentRouter);
  app.use('/api/professional', professionalRouter);
  app.use('/api/admin', adminRouter);

  // Unknown API route handler
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(CONFIG.port, '0.0.0.0', () => {
    console.log(`SmartCred full-stack server listening on http://0.0.0.0:${CONFIG.port}`);
  });

  const shutdown = () => {
    try {
      const db = getDb();
      db.pragma('wal_checkpoint(PASSIVE)');
    } catch {
      // Ignore checkpoint error during exit
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

