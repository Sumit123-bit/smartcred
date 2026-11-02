import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.ts';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(CONFIG.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(CONFIG.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  initializeSchema(db);
  db.pragma('wal_checkpoint(PASSIVE)');
  dbInstance = db;
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 1. users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('USER', 'PROFESSIONAL', 'ADMIN')) DEFAULT 'USER',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. professionals
    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      specialty TEXT NOT NULL,
      category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
      bio TEXT NOT NULL DEFAULT '',
      experience_years INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL DEFAULT '',
      consultation_fee REAL NOT NULL DEFAULT 0,
      approval_status TEXT NOT NULL CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TEXT,
      rejection_reason TEXT NOT NULL DEFAULT '',
      rating_avg REAL NOT NULL DEFAULT 5.0,
      review_count INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. services
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL CHECK(duration_minutes >= 15 AND duration_minutes <= 480),
      price REAL NOT NULL CHECK(price >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. availability
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
      is_working INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '17:00',
      break_start TEXT DEFAULT '13:00',
      break_end TEXT DEFAULT '14:00',
      slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
      UNIQUE(professional_id, day_of_week)
    );

    -- 5. blocked_dates
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      blocked_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'Unavailable',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(professional_id, blocked_date)
    );

    -- 7. appointments (defined before blocked_slots foreign key reference)
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
      appointment_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Confirmed', 'Rejected', 'Completed', 'Cancelled', 'Checked In', 'No Show')) DEFAULT 'Pending',
      notes TEXT NOT NULL DEFAULT '',
      cancellation_reason TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL DEFAULT 0,
      qr_nonce TEXT NOT NULL,
      qr_token_hash TEXT NOT NULL UNIQUE,
      qr_verified_at TEXT,
      qr_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. blocked_slots
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      slot_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'Reserved',
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      channel TEXT NOT NULL CHECK(channel IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
      event_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      delivery_status TEXT NOT NULL CHECK(delivery_status IN ('SENT', 'DEMO_SIMULATED', 'FAILED', 'SKIPPED')),
      provider_detail TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. reviews
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. activity_logs
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. refresh_tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      user_agent TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. password_reset_tokens
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. notification_preferences
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      sms_enabled INTEGER NOT NULL DEFAULT 1,
      whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
      reminders_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 14. appointment_status_history
    CREATE TABLE IF NOT EXISTS appointment_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Supporting table for Contact Us inquiries
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. professional_applications (tracks every specialist onboarding & role upgrade request)
    CREATE TABLE IF NOT EXISTS professional_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
      requested_role TEXT NOT NULL DEFAULT 'PROFESSIONAL',
      title TEXT NOT NULL,
      specialty TEXT NOT NULL,
      category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL,
      bio TEXT NOT NULL DEFAULT '',
      experience_years INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL DEFAULT '',
      consultation_fee REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. device_push_tokens (mobile FCM push registration tied to central SQLite users)
    CREATE TABLE IF NOT EXISTS device_push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fcm_token TEXT NOT NULL UNIQUE,
      device_name TEXT NOT NULL DEFAULT 'Android Device',
      platform TEXT NOT NULL DEFAULT 'ANDROID',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Relational Indexes
    CREATE INDEX IF NOT EXISTS idx_professionals_approval ON professionals(approval_status);
    CREATE INDEX IF NOT EXISTS idx_professionals_category ON professionals(category_id);
    CREATE INDEX IF NOT EXISTS idx_prof_apps_status ON professional_applications(status);
    CREATE INDEX IF NOT EXISTS idx_prof_apps_user ON professional_applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_services_prof ON services(professional_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_appointments_prof_date ON appointments(professional_id, appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id, appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_blocked_slots_prof_date ON blocked_slots(professional_id, slot_date);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON device_push_tokens(user_id);
  `);

  // Safe, non-destructive migration: backfill professional_applications for any existing professionals rows
  db.exec(`
    INSERT INTO professional_applications (
      user_id, professional_id, requested_role, title, specialty, category_id,
      bio, experience_years, location, consultation_fee, status,
      rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
    )
    SELECT
      p.user_id,
      p.id,
      'PROFESSIONAL',
      p.title,
      p.specialty,
      p.category_id,
      p.bio,
      p.experience_years,
      p.location,
      p.consultation_fee,
      p.approval_status,
      p.rejection_reason,
      p.approved_by,
      p.approved_at,
      p.created_at,
      p.updated_at
    FROM professionals p
    WHERE NOT EXISTS (
      SELECT 1 FROM professional_applications pa WHERE pa.user_id = p.user_id
    );
  `);
}

