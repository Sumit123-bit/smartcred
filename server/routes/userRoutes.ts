import { Router, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.ts';
import {
  authenticate,
  verifyCsrf,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { avatarUpload } from '../middleware/upload.ts';
import { hashPassword, logActivity, verifyPassword } from '../utils/security.ts';
import { dispatchNotifications } from '../services/notificationService.ts';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/dashboard', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;

  const stats = db
    .prepare(
      `SELECT
         COUNT(*) as total_bookings,
         SUM(CASE WHEN status IN ('Pending', 'Confirmed') AND appointment_date >= date('now') THEN 1 ELSE 0 END) as upcoming_count,
         SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
         SUM(CASE WHEN status IN ('Completed', 'Checked In') THEN 1 ELSE 0 END) as completed_count,
         COALESCE(SUM(CASE WHEN status IN ('Confirmed', 'Completed', 'Checked In') THEN total_amount ELSE 0 END), 0) as total_spent
       FROM appointments
       WHERE user_id = ?`
    )
    .get(userId) as {
    total_bookings: number;
    upcoming_count: number | null;
    confirmed_count: number | null;
    completed_count: number | null;
    total_spent: number;
  };

  const unreadNotifications = (
    db
      .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(userId) as { c: number }
  ).c;

  const upcomingAppointments = db
    .prepare(
      `SELECT a.*, s.name as service_name, s.duration_minutes,
              pu.full_name as professional_name, pu.avatar_url as professional_avatar,
              p.title as professional_title, p.location as professional_location
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE a.user_id = ?
         AND a.status IN ('Pending', 'Confirmed', 'Checked In')
         AND a.appointment_date >= date('now', '-1 day')
       ORDER BY a.appointment_date ASC, a.start_time ASC
       LIMIT 5`
    )
    .all(userId);

  const recentActivities = db
    .prepare(
      `SELECT id, action, entity_type, entity_id, details, created_at
       FROM activity_logs
       WHERE actor_user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 8`
    )
    .all(userId);

  res.json({
    stats: {
      totalBookings: stats.total_bookings || 0,
      upcomingCount: stats.upcoming_count || 0,
      confirmedCount: stats.confirmed_count || 0,
      completedCount: stats.completed_count || 0,
      totalSpent: stats.total_spent || 0,
      unreadNotifications,
    },
    upcomingAppointments,
    recentActivities,
  });
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().max(30).default(''),
});

userRouter.put('/profile', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile fields.' });
    return;
  }

  const db = getDb();
  db.prepare(
    `UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(parsed.data.fullName, parsed.data.phone, req.user!.id);

  logActivity({
    actorUserId: req.user!.id,
    actorRole: req.user!.role,
    action: 'UPDATE_PROFILE',
    entityType: 'USER',
    entityId: req.user!.id,
    details: 'Updated user profile details',
    ipAddress: req.ip,
  });

  const updated = db
    .prepare('SELECT id, full_name, email, phone, avatar_url, role FROM users WHERE id = ?')
    .get(req.user!.id) as {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string;
    role: string;
  };

  res.json({
    message: 'Profile updated successfully.',
    user: {
      id: updated.id,
      fullName: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatar_url,
      role: updated.role,
    },
  });
});

userRouter.post(
  '/profile/avatar',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Image upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No image file provided.' });
        return;
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      const db = getDb();
      db.prepare(`UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`).run(
        avatarUrl,
        req.user!.id
      );

      logActivity({
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        action: 'UPLOAD_AVATAR',
        entityType: 'USER',
        entityId: req.user!.id,
        details: `Uploaded profile avatar ${req.file.filename}`,
        ipAddress: req.ip,
      });

      res.json({ avatarUrl, message: 'Profile photo updated.' });
    });
  }
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(100),
});

userRouter.post('/change-password', verifyCsrf, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input.' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const matches = await verifyPassword(parsed.data.currentPassword, row.password_hash);
  if (!matches) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    newHash,
    req.user!.id
  );

  logActivity({
    actorUserId: req.user!.id,
    actorRole: req.user!.role,
    action: 'CHANGE_PASSWORD',
    entityType: 'USER',
    entityId: req.user!.id,
    details: 'Changed account password',
    ipAddress: req.ip,
  });

  res.json({ message: 'Password changed successfully.' });
});

userRouter.get('/preferences', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  let prefs = db
    .prepare(
      'SELECT email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled FROM notification_preferences WHERE user_id = ?'
    )
    .get(req.user!.id) as
    | {
        email_enabled: number;
        sms_enabled: number;
        whatsapp_enabled: number;
        reminders_enabled: number;
      }
    | undefined;

  if (!prefs) {
    db.prepare(
      'INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled) VALUES (?, 1, 1, 0, 1)'
    ).run(req.user!.id);
    prefs = { email_enabled: 1, sms_enabled: 1, whatsapp_enabled: 0, reminders_enabled: 1 };
  }

  res.json({
    preferences: {
      emailEnabled: Boolean(prefs.email_enabled),
      smsEnabled: Boolean(prefs.sms_enabled),
      whatsappEnabled: Boolean(prefs.whatsapp_enabled),
      remindersEnabled: Boolean(prefs.reminders_enabled),
    },
  });
});

const prefsSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
});

userRouter.put('/preferences', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid notification preference payload.' });
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       email_enabled = excluded.email_enabled,
       sms_enabled = excluded.sms_enabled,
       whatsapp_enabled = excluded.whatsapp_enabled,
       reminders_enabled = excluded.reminders_enabled,
       updated_at = datetime('now')`
  ).run(
    req.user!.id,
    parsed.data.emailEnabled ? 1 : 0,
    parsed.data.smsEnabled ? 1 : 0,
    parsed.data.whatsappEnabled ? 1 : 0,
    parsed.data.remindersEnabled ? 1 : 0
  );

  res.json({ message: 'Notification preferences saved.' });
});

userRouter.get('/notifications', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const notifications = db
    .prepare(
      `SELECT id, appointment_id, channel, event_type, subject, message, delivery_status, provider_detail, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 60`
    )
    .all(req.user!.id);

  res.json({ notifications });
});

userRouter.patch('/notifications/:id/read', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    id,
    req.user!.id
  );
  res.json({ message: 'Marked as read.' });
});

userRouter.post('/notifications/read-all', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ message: 'All notifications marked as read.' });
});

const reviewSchema = z.object({
  appointmentId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, 'Please write a brief review (min 5 characters)').max(1000),
});

userRouter.post('/reviews', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review input.' });
    return;
  }

  const db = getDb();
  const appt = db
    .prepare('SELECT id, user_id, professional_id, status FROM appointments WHERE id = ?')
    .get(parsed.data.appointmentId) as
    | { id: number; user_id: number; professional_id: number; status: string }
    | undefined;

  if (!appt || appt.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }

  if (!['Completed', 'Checked In'].includes(appt.status)) {
    res.status(400).json({
      error: 'Reviews can only be submitted for Checked In or Completed appointments.',
    });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM reviews WHERE appointment_id = ?')
    .get(appt.id);
  if (existing) {
    res.status(409).json({ error: 'A review has already been submitted for this appointment.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO reviews (appointment_id, user_id, professional_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`
    ).run(appt.id, req.user!.id, appt.professional_id, parsed.data.rating, parsed.data.comment);

    const agg = db
      .prepare(
        'SELECT ROUND(AVG(rating), 2) as avg_rating, COUNT(*) as cnt FROM reviews WHERE professional_id = ?'
      )
      .get(appt.professional_id) as { avg_rating: number; cnt: number };

    db.prepare(
      'UPDATE professionals SET rating_avg = ?, review_count = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(agg.avg_rating || 5.0, agg.cnt || 1, appt.professional_id);
  })();

  res.status(201).json({ message: 'Thank you! Your verified review has been saved.' });
});

// Authenticated User -> Professional Access Application
const professionalApplicationSchema = z.object({
  title: z.string().trim().min(2, 'Professional title is required').max(120),
  specialty: z.string().trim().min(2, 'Primary specialty is required').max(120),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(3),
  location: z.string().trim().max(200).default('Main Practice Suite'),
  consultationFee: z.coerce.number().min(0).max(50000).default(120),
  bio: z.string().trim().max(2000).default(''),
});

userRouter.get('/professional-application', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id; // Verified JWT identity only

  const application = db
    .prepare(
      `SELECT pa.*, sc.name as category_name, rev.full_name as reviewer_name
       FROM professional_applications pa
       LEFT JOIN service_categories sc ON sc.id = pa.category_id
       LEFT JOIN users rev ON rev.id = pa.reviewed_by
       WHERE pa.user_id = ?
       ORDER BY pa.id DESC
       LIMIT 1`
    )
    .get(userId);

  res.json({ application: application || null });
});

userRouter.post(
  '/professional-application',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = professionalApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid professional application details.',
      });
      return;
    }

    // Security: Always derive applicant userId from verified JWT, never from req.body
    const authenticatedUserId = req.user!.id;
    const db = getDb();

    const userRow = db
      .prepare('SELECT id, full_name, email, phone, role FROM users WHERE id = ?')
      .get(authenticatedUserId) as
      | { id: number; full_name: string; email: string; phone: string; role: string }
      | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'Authenticated user record not found.' });
      return;
    }

    const existingPending = db
      .prepare(
        "SELECT id FROM professional_applications WHERE user_id = ? AND UPPER(status) = 'PENDING'"
      )
      .get(authenticatedUserId) as { id: number } | undefined;

    if (existingPending) {
      res.status(409).json({
        error: `You already have a pending professional application (#${existingPending.id}) awaiting admin review.`,
      });
      return;
    }

    const existingApproved = db
      .prepare(
        "SELECT id FROM professionals WHERE user_id = ? AND UPPER(approval_status) = 'APPROVED'"
      )
      .get(authenticatedUserId) as { id: number } | undefined;

    if (existingApproved) {
      res.status(409).json({
        error: 'Your account already holds an approved professional profile.',
      });
      return;
    }

    const data = parsed.data;

    const applicationId = db.transaction(() => {
      const linkedProf = db
        .prepare('SELECT id FROM professionals WHERE user_id = ?')
        .get(authenticatedUserId) as { id: number } | undefined;

      if (linkedProf) {
        db.prepare(
          `UPDATE professionals
           SET title = ?, specialty = ?, category_id = ?, bio = ?,
               experience_years = ?, location = ?, consultation_fee = ?,
               approval_status = 'PENDING', rejection_reason = '', updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          data.title,
          data.specialty,
          data.categoryId ?? null,
          data.bio,
          data.experienceYears,
          data.location || 'Main Practice Suite',
          data.consultationFee,
          linkedProf.id
        );
      }

      const appRes = db
        .prepare(
          `INSERT INTO professional_applications (
            user_id, professional_id, requested_role, title, specialty, category_id,
            bio, experience_years, location, consultation_fee, status
          ) VALUES (?, ?, 'PROFESSIONAL', ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
        )
        .run(
          authenticatedUserId,
          linkedProf?.id ?? null,
          data.title,
          data.specialty,
          data.categoryId ?? null,
          data.bio,
          data.experienceYears,
          data.location || 'Main Practice Suite',
          data.consultationFee
        );

      const newAppId = Number(appRes.lastInsertRowid);

      logActivity({
        actorUserId: authenticatedUserId,
        actorRole: userRow.role,
        action: 'SUBMIT_PROFESSIONAL_APPLICATION',
        entityType: 'PROFESSIONAL_APPLICATION',
        entityId: newAppId,
        details: `Submitted professional access request #${newAppId} (${data.title} — ${data.specialty})`,
        ipAddress: req.ip,
      });

      const admins = db
        .prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1")
        .all() as Array<{ id: number }>;

      const insertAdminNotif = db.prepare(
        `INSERT INTO notifications (
          user_id, channel, event_type, subject, message, delivery_status, provider_detail, is_read
        ) VALUES (?, 'IN_APP', 'NEW_PROFESSIONAL_APPLICATION', ?, ?, 'SENT', 'Admin Governance Alert', 0)`
      );

      for (const adm of admins) {
        insertAdminNotif.run(
          adm.id,
          `New Pending Professional Application (#${newAppId})`,
          `${userRow.full_name} (${userRow.email}) requested specialist access: ${data.title} — ${data.specialty}.`
        );
      }

      return newAppId;
    })();

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[SmartCred Request] POST /api/users/professional-application -> userId=${authenticatedUserId}, applicationId=${applicationId}, status=PENDING`
      );
    }

    await dispatchNotifications({
      userId: authenticatedUserId,
      eventType: 'PROFESSIONAL_APPLICATION_SUBMITTED',
      subject: `Professional Application #${applicationId} Received`,
      message: `Hello ${userRow.full_name}, your specialist application (${data.title}) has been logged with status PENDING and sent to Admin Governance.`,
      channels: ['IN_APP', 'EMAIL'],
    });

    const createdApplication = db
      .prepare(
        `SELECT pa.*, sc.name as category_name
         FROM professional_applications pa
         LEFT JOIN service_categories sc ON sc.id = pa.category_id
         WHERE pa.id = ?`
      )
      .get(applicationId);

    res.status(201).json({
      message: 'Professional application submitted successfully and is pending admin approval.',
      recordId: applicationId,
      applicationId,
      status: 'PENDING',
      application: createdApplication,
    });
  }
);

const pushTokenSchema = z.object({
  fcmToken: z.string().trim().min(16, 'Valid FCM device token is required').max(1024),
  deviceName: z.string().trim().max(120).optional().default('Android Device'),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']).optional().default('ANDROID'),
});

userRouter.post('/push-token', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid push token payload.' });
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO device_push_tokens (user_id, fcm_token, device_name, platform, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(fcm_token) DO UPDATE SET
       user_id = excluded.user_id,
       device_name = excluded.device_name,
       platform = excluded.platform,
       updated_at = datetime('now')`
  ).run(req.user!.id, parsed.data.fcmToken, parsed.data.deviceName, parsed.data.platform);

  res.json({ message: 'Device push token registered.' });
});

userRouter.delete('/push-token', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const fcmToken = String(req.body?.fcmToken || req.query.fcmToken || '').trim();
  const db = getDb();
  if (fcmToken) {
    db.prepare('DELETE FROM device_push_tokens WHERE user_id = ? AND fcm_token = ?').run(
      req.user!.id,
      fcmToken
    );
  } else {
    db.prepare('DELETE FROM device_push_tokens WHERE user_id = ?').run(req.user!.id);
  }
  res.json({ message: 'Device push token removed.' });
});
