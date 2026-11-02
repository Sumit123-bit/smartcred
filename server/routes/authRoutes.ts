import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.ts';
import { CONFIG } from '../config.ts';
import {
  authenticate,
  isHttpsRequest,
  verifyCsrf,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  generateCsrfToken,
  generateOpaqueToken,
  hashPassword,
  logActivity,
  sha256Hex,
  signAccessToken,
  verifyPassword,
  verifySignedCsrfToken,
  type UserRole,
} from '../utils/security.ts';
import { dispatchNotifications } from '../services/notificationService.ts';

export const authRouter = Router();

function setRefreshCookie(req: Request, res: Response, rawRefreshToken: string): void {
  const https = isHttpsRequest(req);
  res.cookie('smartcred_refresh', rawRefreshToken, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: CONFIG.refreshTokenDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie('smartcred_refresh', {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    path: '/api/auth',
  });
}

function issueCsrfCookie(req: Request, res: Response): string {
  const existing = req.cookies?.smartcred_csrf as string | undefined;
  if (existing && verifySignedCsrfToken(existing)) {
    return existing;
  }
  const https = isHttpsRequest(req);
  const csrfToken = generateCsrfToken();
  res.cookie('smartcred_csrf', csrfToken, {
    httpOnly: false,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return csrfToken;
}

authRouter.get('/csrf', (req: Request, res: Response) => {
  const csrfToken = issueCsrfCookie(req, res);
  res.json({ csrfToken });
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  phone: z.string().trim().max(30).optional().default(''),
  role: z.enum(['USER', 'PROFESSIONAL']).default('USER'),
  title: z.string().trim().max(120).optional().default(''),
  specialty: z.string().trim().max(120).optional().default(''),
  categoryId: z.coerce.number().int().positive().optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).optional().default(3),
  location: z.string().trim().max(200).optional().default(''),
  consultationFee: z.coerce.number().min(0).max(50000).optional().default(120),
  bio: z.string().trim().max(1500).optional().default(''),
});

authRouter.post('/register', verifyCsrf, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid registration input.',
    });
    return;
  }

  const data = parsed.data;
  if (data.role === 'PROFESSIONAL' && (!data.title || !data.specialty)) {
    res.status(400).json({
      error: 'Professional registration requires both Professional Title and Specialty.',
    });
    return;
  }

  const db = getDb();
  const normalizedEmail = data.email.toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
    .get(normalizedEmail);

  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = await hashPassword(data.password);

  const created = db.transaction(() => {
    const userRes = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, phone, role, is_active, is_demo)
         VALUES (?, ?, ?, ?, ?, 1, 0)`
      )
      .run(data.fullName, normalizedEmail, passwordHash, data.phone || '', data.role);

    const userId = Number(userRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled)
       VALUES (?, 1, 1, 0, 1)`
    ).run(userId);

    let approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | undefined;
    let professionalId: number | undefined;
    let applicationId: number | undefined;

    if (data.role === 'PROFESSIONAL') {
      approvalStatus = 'PENDING';
      const profRes = db
        .prepare(
          `INSERT INTO professionals (
            user_id, title, specialty, category_id, bio, experience_years,
            location, consultation_fee, approval_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
        )
        .run(
          userId,
          data.title,
          data.specialty,
          data.categoryId ?? null,
          data.bio || '',
          data.experienceYears ?? 3,
          data.location || 'Main Practice Suite',
          data.consultationFee ?? 120
        );

      professionalId = Number(profRes.lastInsertRowid);

      const appRes = db
        .prepare(
          `INSERT INTO professional_applications (
            user_id, professional_id, requested_role, title, specialty, category_id,
            bio, experience_years, location, consultation_fee, status
          ) VALUES (?, ?, 'PROFESSIONAL', ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
        )
        .run(
          userId,
          professionalId,
          data.title,
          data.specialty,
          data.categoryId ?? null,
          data.bio || '',
          data.experienceYears ?? 3,
          data.location || 'Main Practice Suite',
          data.consultationFee ?? 120
        );

      applicationId = Number(appRes.lastInsertRowid);

      const insertAvail = db.prepare(
        `INSERT INTO availability (professional_id, day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes)
         VALUES (?, ?, ?, '09:00', '17:00', '13:00', '14:00', 30)`
      );
      for (let d = 0; d <= 6; d++) {
        insertAvail.run(professionalId, d, d === 0 ? 0 : 1);
      }
    }

    const rawRefresh = generateOpaqueToken(32);
    const refreshHash = sha256Hex(rawRefresh);
    db.prepare(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES (?, ?, datetime('now', '+7 days'), ?, ?)`
    ).run(
      userId,
      refreshHash,
      String(req.headers['user-agent'] || '').slice(0, 200),
      req.ip || ''
    );

    if (data.role === 'PROFESSIONAL') {
      logActivity({
        actorUserId: userId,
        actorRole: 'PROFESSIONAL',
        action: 'SUBMIT_PROFESSIONAL_APPLICATION',
        entityType: 'PROFESSIONAL_APPLICATION',
        entityId: applicationId,
        details: `Submitted professional application #${applicationId} for ${data.fullName} (${normalizedEmail}) — ${data.title} / ${data.specialty}`,
        ipAddress: req.ip,
      });
    } else {
      logActivity({
        actorUserId: userId,
        actorRole: 'USER',
        action: 'REGISTER_USER',
        entityType: 'USER',
        entityId: userId,
        details: `Registered client account #${userId} for ${data.fullName} (${normalizedEmail})`,
        ipAddress: req.ip,
      });
    }

    // Notify all active platform administrators in SQLite
    const admins = db
      .prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1")
      .all() as Array<{ id: number }>;

    const insertAdminNotif = db.prepare(
      `INSERT INTO notifications (
        user_id, channel, event_type, subject, message, delivery_status, provider_detail, is_read
      ) VALUES (?, 'IN_APP', ?, ?, ?, 'SENT', 'Admin Governance Alert', 0)`
    );

    for (const adm of admins) {
      if (data.role === 'PROFESSIONAL') {
        insertAdminNotif.run(
          adm.id,
          'NEW_PROFESSIONAL_APPLICATION',
          `New Pending Professional Application (#${applicationId})`,
          `${data.fullName} (${normalizedEmail}) applied as ${data.title} (${data.specialty}). Status: PENDING.`
        );
      } else {
        insertAdminNotif.run(
          adm.id,
          'NEW_USER_REGISTERED',
          `New Client Registration (#${userId})`,
          `${data.fullName} (${normalizedEmail}) created a client account.`
        );
      }
    }

    return { userId, rawRefresh, approvalStatus, professionalId, applicationId };
  })();

  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[SmartCred Auth] POST /api/auth/register -> role=${data.role}, userId=${created.userId}${
        created.applicationId ? `, applicationId=${created.applicationId}, status=PENDING` : ''
      }`
    );
  }

  await dispatchNotifications({
    userId: created.userId,
    eventType: 'REGISTRATION',
    subject: 'Welcome to SmartCred',
    message:
      data.role === 'PROFESSIONAL'
        ? `Welcome ${data.fullName}. Your professional application (#${created.applicationId}) has been received and is pending administrator verification.`
        : `Welcome ${data.fullName}. Your SmartCred account is active and ready to schedule appointments.`,
    channels: ['IN_APP', 'EMAIL'],
  });

  const accessToken = signAccessToken({
    id: created.userId,
    email: normalizedEmail,
    role: data.role,
    fullName: data.fullName,
  });

  setRefreshCookie(req, res, created.rawRefresh);
  const csrfToken = issueCsrfCookie(req, res);

  res.status(201).json({
    message:
      data.role === 'PROFESSIONAL'
        ? 'Professional application submitted and pending administrator approval.'
        : 'Client registration completed successfully.',
    recordId: created.applicationId ?? created.userId,
    userId: created.userId,
    applicationId: created.applicationId,
    professionalId: created.professionalId,
    approvalStatus: created.approvalStatus,
    accessToken,
    csrfToken,
    sessionBackup: created.rawRefresh,
    user: {
      id: created.userId,
      fullName: data.fullName,
      email: normalizedEmail,
      phone: data.phone || '',
      avatarUrl: '',
      role: data.role,
      approvalStatus: created.approvalStatus,
      professionalId: created.professionalId,
      applicationId: created.applicationId,
    },
  });
});

const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/login', verifyCsrf, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid login payload.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare(
      `SELECT u.*, p.id as professional_id, p.approval_status
       FROM users u
       LEFT JOIN professionals p ON p.user_id = u.id
       WHERE u.email = ? COLLATE NOCASE`
    )
    .get(parsed.data.email.toLowerCase()) as
    | {
        id: number;
        full_name: string;
        email: string;
        password_hash: string;
        phone: string;
        avatar_url: string;
        role: UserRole;
        is_active: number;
        professional_id: number | null;
        approval_status: string | null;
      }
    | undefined;

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({
      error: 'Your account has been suspended. Please contact platform administration.',
    });
    return;
  }

  const valid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const rawRefresh = generateOpaqueToken(32);
  const refreshHash = sha256Hex(rawRefresh);

  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, datetime('now', '+7 days'), ?, ?)`
  ).run(
    user.id,
    refreshHash,
    String(req.headers['user-agent'] || '').slice(0, 200),
    req.ip || ''
  );

  logActivity({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'LOGIN',
    entityType: 'USER',
    entityId: user.id,
    details: `${user.email} signed in`,
    ipAddress: req.ip,
  });

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
  });

  setRefreshCookie(req, res, rawRefresh);
  const csrfToken = issueCsrfCookie(req, res);

  res.json({
    accessToken,
    csrfToken,
    sessionBackup: rawRefresh,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      role: user.role,
      professionalId: user.professional_id ?? undefined,
      approvalStatus: user.approval_status ?? undefined,
    },
  });
});

authRouter.post('/refresh', (req: Request, res: Response) => {
  const cookieRefresh = req.cookies?.smartcred_refresh as string | undefined;
  const fallbackHeader = req.headers['x-session-backup'];
  const fallbackRefresh = Array.isArray(fallbackHeader) ? fallbackHeader[0] : fallbackHeader;
  // Prioritize tab-scoped sessionBackup first so multi-tab sessions (e.g. Admin + Client tabs) never hijack each other
  const rawToken = fallbackRefresh || cookieRefresh;

  if (!rawToken) {
    res.status(401).json({ error: 'No active session.' });
    return;
  }

  const db = getDb();
  const tokenHash = sha256Hex(rawToken);

  const tokenRecord = db
    .prepare(
      `SELECT rt.id, rt.user_id, u.full_name, u.email, u.phone, u.avatar_url, u.role, u.is_active,
              p.id as professional_id,
              COALESCE(p.approval_status, (
                SELECT pa.status FROM professional_applications pa
                WHERE pa.user_id = u.id ORDER BY pa.id DESC LIMIT 1
              )) as approval_status,
              (SELECT pa.id FROM professional_applications pa
               WHERE pa.user_id = u.id ORDER BY pa.id DESC LIMIT 1) as application_id
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN professionals p ON p.user_id = u.id
       WHERE rt.token_hash = ?
         AND rt.revoked_at IS NULL
         AND rt.expires_at > datetime('now')`
    )
    .get(tokenHash) as
    | {
        id: number;
        user_id: number;
        full_name: string;
        email: string;
        phone: string;
        avatar_url: string;
        role: UserRole;
        is_active: number;
        professional_id: number | null;
        approval_status: string | null;
        application_id: number | null;
      }
    | undefined;

  if (!tokenRecord || !tokenRecord.is_active) {
    if (!fallbackRefresh || fallbackRefresh === cookieRefresh) {
      clearRefreshCookie(req, res);
    }
    res.status(401).json({ error: 'Session expired or revoked.' });
    return;
  }

  // Rotate refresh token securely
  const newRawRefresh = generateOpaqueToken(32);
  const newRefreshHash = sha256Hex(newRawRefresh);

  db.transaction(() => {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(
      tokenRecord.id
    );
    db.prepare(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES (?, ?, datetime('now', '+7 days'), ?, ?)`
    ).run(
      tokenRecord.user_id,
      newRefreshHash,
      String(req.headers['user-agent'] || '').slice(0, 200),
      req.ip || ''
    );
  })();

  const accessToken = signAccessToken({
    id: tokenRecord.user_id,
    email: tokenRecord.email,
    role: tokenRecord.role,
    fullName: tokenRecord.full_name,
  });

  if (!cookieRefresh || cookieRefresh === rawToken) {
    setRefreshCookie(req, res, newRawRefresh);
  }
  const csrfToken = issueCsrfCookie(req, res);

  res.json({
    accessToken,
    csrfToken,
    sessionBackup: newRawRefresh,
    user: {
      id: tokenRecord.user_id,
      fullName: tokenRecord.full_name,
      email: tokenRecord.email,
      phone: tokenRecord.phone,
      avatarUrl: tokenRecord.avatar_url,
      role: tokenRecord.role,
      professionalId: tokenRecord.professional_id ?? undefined,
      approvalStatus: (tokenRecord.approval_status as 'PENDING' | 'APPROVED' | 'REJECTED' | null) ?? undefined,
      applicationId: tokenRecord.application_id ?? undefined,
    },
  });
});

authRouter.post('/logout', verifyCsrf, (req: Request, res: Response) => {
  const cookieRefresh = req.cookies?.smartcred_refresh as string | undefined;
  const fallbackHeader = req.headers['x-session-backup'];
  const fallbackRefresh = Array.isArray(fallbackHeader) ? fallbackHeader[0] : fallbackHeader;
  const rawToken = fallbackRefresh || cookieRefresh;

  if (rawToken) {
    const db = getDb();
    const tokenHash = sha256Hex(rawToken);
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?`).run(
      tokenHash
    );
  }

  if (!fallbackRefresh || fallbackRefresh === cookieRefresh) {
    clearRefreshCookie(req, res);
  }
  res.json({ message: 'Signed out successfully.' });
});

authRouter.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, u.role,
              p.id as professional_id,
              COALESCE(p.approval_status, (
                SELECT pa.status FROM professional_applications pa
                WHERE pa.user_id = u.id ORDER BY pa.id DESC LIMIT 1
              )) as approval_status,
              (SELECT pa.id FROM professional_applications pa
               WHERE pa.user_id = u.id ORDER BY pa.id DESC LIMIT 1) as application_id
       FROM users u
       LEFT JOIN professionals p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(req.user!.id) as
    | {
        id: number;
        full_name: string;
        email: string;
        phone: string;
        avatar_url: string;
        role: UserRole;
        professional_id: number | null;
        approval_status: string | null;
        application_id: number | null;
      }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      role: user.role,
      professionalId: user.professional_id ?? undefined,
      approvalStatus: (user.approval_status as 'PENDING' | 'APPROVED' | 'REJECTED' | null) ?? undefined,
      applicationId: user.application_id ?? undefined,
    },
  });
});

const forgotSchema = z.object({
  email: z.string().trim().email('Valid email address required'),
});

authRouter.post('/forgot-password', verifyCsrf, async (req: Request, res: Response) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, full_name, email FROM users WHERE email = ? COLLATE NOCASE')
    .get(parsed.data.email.toLowerCase()) as
    | { id: number; full_name: string; email: string }
    | undefined;

  if (!user) {
    res.json({
      message: 'If an account matches that email, password reset instructions have been processed.',
    });
    return;
  }

  const rawResetToken = generateOpaqueToken(24);
  const tokenHash = sha256Hex(rawResetToken);

  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, datetime('now', '+30 minutes'))`
  ).run(user.id, tokenHash);

  const delivery = await dispatchNotifications({
    userId: user.id,
    eventType: 'PASSWORD_RESET',
    subject: 'SmartCred Password Reset Token',
    message: `Hello ${user.full_name}, use reset token ${rawResetToken} within 30 minutes to set a new password.`,
    channels: ['IN_APP', 'EMAIL'],
  });

  const isDemoMail = delivery.some((d) => d.channel === 'EMAIL' && d.status === 'DEMO_SIMULATED');

  res.json({
    message: 'Password reset token generated and logged.',
    demoResetToken: isDemoMail ? rawResetToken : undefined,
    delivery,
  });
});

const resetSchema = z.object({
  token: z.string().trim().min(10, 'Valid reset token is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(100),
});

authRouter.post('/reset-password', verifyCsrf, async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid password reset request.',
    });
    return;
  }

  const db = getDb();
  const tokenHash = sha256Hex(parsed.data.token);

  const resetRow = db
    .prepare(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(tokenHash) as { id: number; user_id: number } | undefined;

  if (!resetRow) {
    res.status(400).json({ error: 'Invalid, expired, or already used password reset token.' });
    return;
  }

  const newHash = await hashPassword(parsed.data.newPassword);

  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      newHash,
      resetRow.user_id
    );
    db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(
      resetRow.id
    );
    db.prepare(
      `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`
    ).run(resetRow.user_id);
  })();

  logActivity({
    actorUserId: resetRow.user_id,
    actorRole: 'USER',
    action: 'RESET_PASSWORD',
    entityType: 'USER',
    entityId: resetRow.user_id,
    details: 'Password reset completed via token verification',
    ipAddress: req.ip,
  });

  res.json({ message: 'Password updated successfully. You may now sign in.' });
});
