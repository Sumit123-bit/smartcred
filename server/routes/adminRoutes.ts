import { Router, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.ts';
import {
  authenticate,
  authorize,
  verifyCsrf,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  BookingConflictError,
  transitionAppointmentStatus,
} from '../services/bookingEngine.ts';
import { dispatchNotifications } from '../services/notificationService.ts';
import { hashPassword, logActivity } from '../utils/security.ts';

export const adminRouter = Router();

adminRouter.use(authenticate, authorize('ADMIN'));

function buildAdminDashboardPayload() {
  const db = getDb();

  const totalUsers = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE UPPER(role) = 'USER'").get() as { c: number }
  ).c;
  const totalAccounts = (
    db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
  ).c;
  const totalProfessionals = (
    db.prepare('SELECT COUNT(*) as c FROM professionals').get() as { c: number }
  ).c;
  const approvedProfessionals = (
    db
      .prepare("SELECT COUNT(*) as c FROM professionals WHERE UPPER(approval_status) = 'APPROVED'")
      .get() as { c: number }
  ).c;
  const pendingApplications = (
    db
      .prepare("SELECT COUNT(*) as c FROM professional_applications WHERE UPPER(status) = 'PENDING'")
      .get() as { c: number }
  ).c;
  const approvedApplications = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM professional_applications WHERE UPPER(status) = 'APPROVED'"
      )
      .get() as { c: number }
  ).c;
  const rejectedApplications = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM professional_applications WHERE UPPER(status) = 'REJECTED'"
      )
      .get() as { c: number }
  ).c;
  const totalApplications = (
    db.prepare('SELECT COUNT(*) as c FROM professional_applications').get() as { c: number }
  ).c;

  const apptStats = db
    .prepare(
      `SELECT
         COUNT(*) as total_appointments,
         SUM(CASE WHEN appointment_date = date('now') THEN 1 ELSE 0 END) as today_appointments,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_appointments,
         SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_appointments,
         SUM(CASE WHEN status = 'Checked In' THEN 1 ELSE 0 END) as checked_in_appointments,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_appointments,
         SUM(CASE WHEN status IN ('Cancelled', 'Rejected') THEN 1 ELSE 0 END) as cancelled_appointments,
         COALESCE(SUM(CASE WHEN status IN ('Confirmed', 'Completed', 'Checked In') THEN total_amount ELSE 0 END), 0) as gross_revenue,
         COALESCE(SUM(CASE WHEN status IN ('Completed', 'Checked In') THEN total_amount ELSE 0 END), 0) as completed_revenue
       FROM appointments`
    )
    .get() as {
    total_appointments: number;
    today_appointments: number | null;
    pending_appointments: number | null;
    confirmed_appointments: number | null;
    checked_in_appointments: number | null;
    completed_appointments: number | null;
    cancelled_appointments: number | null;
    gross_revenue: number;
    completed_revenue: number;
  };

  const trendSeries = db
    .prepare(
      `SELECT appointment_date as date,
              COUNT(*) as bookings,
              COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN total_amount ELSE 0 END), 0) as revenue
       FROM appointments
       GROUP BY appointment_date
       ORDER BY appointment_date ASC
       LIMIT 14`
    )
    .all();

  const statusBreakdown = db
    .prepare(
      `SELECT status as name, COUNT(*) as count
       FROM appointments
       GROUP BY status
       ORDER BY count DESC`
    )
    .all();

  const categoryBreakdown = db
    .prepare(
      `SELECT sc.name,
              COUNT(a.id) as bookings,
              COALESCE(SUM(CASE WHEN a.status NOT IN ('Cancelled', 'Rejected') THEN a.total_amount ELSE 0 END), 0) as revenue
       FROM service_categories sc
       LEFT JOIN professionals p ON p.category_id = sc.id
       LEFT JOIN appointments a ON a.professional_id = p.id
       GROUP BY sc.id, sc.name
       ORDER BY bookings DESC`
    )
    .all();

  const recentUsers = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at
       FROM users u
       ORDER BY u.id DESC
       LIMIT 6`
    )
    .all();

  const recentApplications = db
    .prepare(
      `SELECT pa.id, pa.user_id, pa.requested_role, pa.title, pa.specialty, pa.status, pa.created_at,
              u.full_name, u.email, u.phone
       FROM professional_applications pa
       JOIN users u ON u.id = pa.user_id
       ORDER BY pa.id DESC
       LIMIT 6`
    )
    .all();

  return {
    stats: {
      totalUsers,
      totalAccounts,
      totalProfessionals,
      approvedProfessionals,
      pendingProfessionals: pendingApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      totalApplications,
      totalAppointments: apptStats.total_appointments || 0,
      todayAppointments: apptStats.today_appointments || 0,
      pendingAppointments: apptStats.pending_appointments || 0,
      confirmedAppointments: apptStats.confirmed_appointments || 0,
      checkedInAppointments: apptStats.checked_in_appointments || 0,
      completedAppointments: apptStats.completed_appointments || 0,
      cancelledAppointments: apptStats.cancelled_appointments || 0,
      grossRevenue: apptStats.gross_revenue || 0,
      completedRevenue: apptStats.completed_revenue || 0,
    },
    trendSeries,
    statusBreakdown,
    categoryBreakdown,
    recentUsers,
    recentApplications,
    syncedAt: new Date().toISOString(),
  };
}

adminRouter.get('/dashboard', (_req: AuthenticatedRequest, res: Response) => {
  res.json(buildAdminDashboardPayload());
});

adminRouter.get('/overview', (_req: AuthenticatedRequest, res: Response) => {
  res.json(buildAdminDashboardPayload());
});

// Manage Users
adminRouter.get('/users', (req: AuthenticatedRequest, res: Response) => {
  const search = String(req.query.search || '').trim();
  const role = String(req.query.role || 'all').trim();
  const conditions: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (role && role.toLowerCase() !== 'all') {
    conditions.push('UPPER(u.role) = UPPER(?)');
    params.push(role);
  }
  if (search) {
    const t = `%${search}%`;
    conditions.push(
      '(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR CAST(u.id AS TEXT) LIKE ?)'
    );
    params.push(t, t, t, t);
  }

  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.is_demo, u.created_at,
              (SELECT COUNT(*) FROM appointments a WHERE a.user_id = u.id) as booking_count
       FROM users u
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.id DESC`
    )
    .all(...params);

  res.json({ users });
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['USER', 'PROFESSIONAL', 'ADMIN']).optional(),
});

adminRouter.patch('/users/:id', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user update payload.' });
    return;
  }

  if (targetId === req.user!.id && parsed.data.isActive === false) {
    res.status(400).json({ error: 'Administrators cannot deactivate their own active account.' });
    return;
  }

  const db = getDb();
  const current = db
    .prepare('SELECT id, email, role, is_active FROM users WHERE id = ?')
    .get(targetId) as
    | { id: number; email: string; role: string; is_active: number }
    | undefined;

  if (!current) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const nextActive =
    parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : current.is_active;
  const nextRole = parsed.data.role ?? current.role;

  db.prepare(
    `UPDATE users SET is_active = ?, role = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(nextActive, nextRole, targetId);

  logActivity({
    actorUserId: req.user!.id,
    actorRole: 'ADMIN',
    action: 'ADMIN_UPDATE_USER',
    entityType: 'USER',
    entityId: targetId,
    details: `Updated ${current.email}: role=${nextRole}, active=${Boolean(nextActive)}`,
    ipAddress: req.ip,
  });

  res.json({ message: 'User account updated.' });
});

// Dedicated Professional Applications & Role Access Requests Management
function getApplicationById(id: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT pa.*,
              u.full_name, u.email, u.phone, u.avatar_url, u.role as current_user_role, u.is_active,
              sc.name as category_name,
              rev.full_name as reviewer_name
       FROM professional_applications pa
       JOIN users u ON u.id = pa.user_id
       LEFT JOIN service_categories sc ON sc.id = pa.category_id
       LEFT JOIN users rev ON rev.id = pa.reviewed_by
       WHERE pa.id = ?`
    )
    .get(id) as
    | {
        id: number;
        user_id: number;
        professional_id: number | null;
        requested_role: string;
        title: string;
        specialty: string;
        category_id: number | null;
        category_name: string | null;
        bio: string;
        experience_years: number;
        location: string;
        consultation_fee: number;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        rejection_reason: string;
        reviewed_by: number | null;
        reviewer_name: string | null;
        reviewed_at: string | null;
        created_at: string;
        updated_at: string;
        full_name: string;
        email: string;
        phone: string;
        avatar_url: string;
        current_user_role: string;
        is_active: number;
      }
    | undefined;
}

adminRouter.get('/professional-applications', (req: AuthenticatedRequest, res: Response) => {
  const status = String(req.query.status || 'all').trim();
  const search = String(req.query.search || '').trim();
  const conditions: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (status && status.toLowerCase() !== 'all') {
    conditions.push('UPPER(pa.status) = UPPER(?)');
    params.push(status);
  }

  if (search) {
    const t = `%${search}%`;
    conditions.push(
      `(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR pa.title LIKE ? OR pa.specialty LIKE ? OR CAST(pa.id AS TEXT) LIKE ? OR CAST(pa.user_id AS TEXT) LIKE ?)`
    );
    params.push(t, t, t, t, t, t, t);
  }

  const db = getDb();
  const applications = db
    .prepare(
      `SELECT pa.*,
              u.full_name, u.email, u.phone, u.avatar_url, u.role as current_user_role, u.is_active,
              sc.name as category_name,
              rev.full_name as reviewer_name
       FROM professional_applications pa
       JOIN users u ON u.id = pa.user_id
       LEFT JOIN service_categories sc ON sc.id = pa.category_id
       LEFT JOIN users rev ON rev.id = pa.reviewed_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE UPPER(pa.status) WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
         pa.id DESC`
    )
    .all(...params);

  res.json({ applications });
});

adminRouter.get('/professional-applications/:id', (req: AuthenticatedRequest, res: Response) => {
  const appId = Number(req.params.id);
  if (!Number.isInteger(appId) || appId <= 0) {
    res.status(400).json({ error: 'Invalid application ID.' });
    return;
  }

  const application = getApplicationById(appId);
  if (!application) {
    res.status(404).json({ error: 'Professional application not found.' });
    return;
  }

  res.json({ application });
});

function ensureProfessionalScheduleAndInitialService(params: {
  profId: number;
  categoryId: number | null;
  specialty: string;
  fullName: string;
  consultationFee: number;
}) {
  const db = getDb();
  const insertAvail = db.prepare(
    `INSERT OR IGNORE INTO availability (
      professional_id, day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes
    ) VALUES (?, ?, ?, '09:00', '17:00', '13:00', '14:00', 30)`
  );
  for (let day = 0; day <= 6; day++) {
    insertAvail.run(params.profId, day, day === 0 ? 0 : 1);
  }

  const existingServices = (
    db
      .prepare('SELECT COUNT(*) as c FROM services WHERE professional_id = ?')
      .get(params.profId) as { c: number }
  ).c;

  if (existingServices === 0) {
    db.prepare(
      `INSERT INTO services (professional_id, category_id, name, description, duration_minutes, price, is_active)
       VALUES (?, ?, ?, ?, 45, ?, 1)`
    ).run(
      params.profId,
      params.categoryId,
      `${params.specialty} Consultation`,
      `45-minute specialist consultation with ${params.fullName}.`,
      params.consultationFee
    );
  }
}

adminRouter.put(
  '/professional-applications/:id/approve',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const appId = Number(req.params.id);
    if (!Number.isInteger(appId) || appId <= 0) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }

    const existing = getApplicationById(appId);
    if (!existing) {
      res.status(404).json({ error: 'Professional application not found.' });
      return;
    }

    const db = getDb();
    const adminId = req.user!.id;

    const approveTx = db.transaction(() => {
      // 1. Elevate user role to PROFESSIONAL
      db.prepare(
        `UPDATE users SET role = 'PROFESSIONAL', updated_at = datetime('now') WHERE id = ?`
      ).run(existing.user_id);

      // 2. Create or update linked professionals record
      const existingProf = db
        .prepare('SELECT id FROM professionals WHERE user_id = ?')
        .get(existing.user_id) as { id: number } | undefined;

      let profId: number;
      if (existingProf) {
        profId = existingProf.id;
        db.prepare(
          `UPDATE professionals
           SET title = ?,
               specialty = ?,
               category_id = ?,
               bio = ?,
               experience_years = ?,
               location = ?,
               consultation_fee = ?,
               approval_status = 'APPROVED',
               approved_by = ?,
               approved_at = datetime('now'),
               rejection_reason = '',
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          existing.title,
          existing.specialty,
          existing.category_id,
          existing.bio,
          existing.experience_years,
          existing.location,
          existing.consultation_fee,
          adminId,
          profId
        );
      } else {
        const insProf = db
          .prepare(
            `INSERT INTO professionals (
              user_id, title, specialty, category_id, bio, experience_years,
              location, consultation_fee, approval_status, approved_by, approved_at, is_featured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, datetime('now'), 0)`
          )
          .run(
            existing.user_id,
            existing.title,
            existing.specialty,
            existing.category_id,
            existing.bio,
            existing.experience_years,
            existing.location,
            existing.consultation_fee,
            adminId
          );
        profId = Number(insProf.lastInsertRowid);
      }

      // 3. Ensure working availability and initial bookable service exist
      ensureProfessionalScheduleAndInitialService({
        profId,
        categoryId: existing.category_id,
        specialty: existing.specialty,
        fullName: existing.full_name,
        consultationFee: existing.consultation_fee,
      });

      // 4. Mark application APPROVED & link professional_id
      db.prepare(
        `UPDATE professional_applications
         SET status = 'APPROVED',
             professional_id = ?,
             rejection_reason = '',
             reviewed_by = ?,
             reviewed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(profId, adminId, appId);

      // 5. Log administrative audit event
      logActivity({
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action: 'APPROVE_PROFESSIONAL_APPLICATION',
        entityType: 'PROFESSIONAL_APPLICATION',
        entityId: appId,
        details: `Approved application #${appId} for ${existing.full_name} (${existing.email}); professionalId=${profId}`,
        ipAddress: req.ip,
      });

      return profId;
    });

    const profId = approveTx.immediate();

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[SmartCred Admin] PUT /api/admin/professional-applications/${appId}/approve -> APPROVED (userId=${existing.user_id}, profId=${profId})`
      );
    }

    await dispatchNotifications({
      userId: existing.user_id,
      eventType: 'PROFESSIONAL_UPDATE',
      subject: `Professional Application #${appId} Approved`,
      message: `Congratulations ${existing.full_name}! Your SmartCred specialist application has been approved and your profile is now live for client bookings.`,
      channels: ['IN_APP', 'EMAIL'],
    });

    const updatedApplication = getApplicationById(appId);
    res.json({
      message: `Application #${appId} for ${existing.full_name} approved.`,
      professionalId: profId,
      application: updatedApplication,
    });
  }
);

const rejectApplicationSchema = z.object({
  rejectionReason: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
});

adminRouter.put(
  '/professional-applications/:id/reject',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const appId = Number(req.params.id);
    if (!Number.isInteger(appId) || appId <= 0) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }

    const parsed = rejectApplicationSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rejection payload.' });
      return;
    }

    const existing = getApplicationById(appId);
    if (!existing) {
      res.status(404).json({ error: 'Professional application not found.' });
      return;
    }

    const finalReason =
      parsed.data.rejectionReason ||
      parsed.data.reason ||
      'Application did not meet verification requirements.';

    const db = getDb();
    const adminId = req.user!.id;

    const rejectTx = db.transaction(() => {
      db.prepare(
        `UPDATE professional_applications
         SET status = 'REJECTED',
             rejection_reason = ?,
             reviewed_by = ?,
             reviewed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(finalReason, adminId, appId);

      const linkedProf = db
        .prepare('SELECT id FROM professionals WHERE user_id = ?')
        .get(existing.user_id) as { id: number } | undefined;

      if (linkedProf) {
        db.prepare(
          `UPDATE professionals
           SET approval_status = 'REJECTED',
               rejection_reason = ?,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(finalReason, linkedProf.id);
      }

      logActivity({
        actorUserId: adminId,
        actorRole: 'ADMIN',
        action: 'REJECT_PROFESSIONAL_APPLICATION',
        entityType: 'PROFESSIONAL_APPLICATION',
        entityId: appId,
        details: `Rejected application #${appId} for ${existing.full_name} (${existing.email}). Reason: ${finalReason}`,
        ipAddress: req.ip,
      });
    });

    rejectTx.immediate();

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[SmartCred Admin] PUT /api/admin/professional-applications/${appId}/reject -> REJECTED (userId=${existing.user_id})`
      );
    }

    await dispatchNotifications({
      userId: existing.user_id,
      eventType: 'PROFESSIONAL_UPDATE',
      subject: `Professional Application #${appId} Update`,
      message: `Hello ${existing.full_name}, your SmartCred specialist application was not approved at this time. Reason: ${finalReason}`,
      channels: ['IN_APP', 'EMAIL'],
    });

    const updatedApplication = getApplicationById(appId);
    res.json({
      message: `Application #${appId} marked as Rejected.`,
      application: updatedApplication,
    });
  }
);

// Manage Professionals & Applications
adminRouter.get('/professionals', (req: AuthenticatedRequest, res: Response) => {
  const status = String(req.query.status || 'all').trim();
  const conditions: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (status && status.toLowerCase() !== 'all') {
    conditions.push('UPPER(p.approval_status) = UPPER(?)');
    params.push(status);
  }

  const db = getDb();
  const professionals = db
    .prepare(
      `SELECT p.*, u.full_name, u.email, u.phone, u.avatar_url, u.is_active,
              sc.name as category_name,
              (SELECT pa.id FROM professional_applications pa WHERE pa.user_id = p.user_id ORDER BY pa.id DESC LIMIT 1) as application_id,
              (SELECT COUNT(*) FROM services s WHERE s.professional_id = p.id) as service_count,
              (SELECT COUNT(*) FROM appointments a WHERE a.professional_id = p.id) as appointment_count
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE UPPER(p.approval_status) WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
         p.id DESC`
    )
    .all(...params);

  res.json({ professionals });
});

const createProfSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
  phone: z.string().trim().max(30).default(''),
  title: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(5),
  location: z.string().trim().max(200).default(''),
  consultationFee: z.coerce.number().min(0).max(50000).default(150),
  bio: z.string().trim().max(2000).default(''),
});

adminRouter.post('/professionals', verifyCsrf, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createProfSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid professional details.' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const exists = db
    .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
    .get(d.email.toLowerCase());

  if (exists) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const passwordHash = await hashPassword(d.password);

  const profId = db.transaction(() => {
    const uRes = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, phone, role, is_active, is_demo)
         VALUES (?, ?, ?, ?, 'PROFESSIONAL', 1, 0)`
      )
      .run(d.fullName, d.email.toLowerCase(), passwordHash, d.phone);

    const userId = Number(uRes.lastInsertRowid);

    db.prepare(
      'INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled) VALUES (?, 1, 1, 0, 1)'
    ).run(userId);

    const pRes = db
      .prepare(
        `INSERT INTO professionals (
          user_id, title, specialty, category_id, bio, experience_years,
          location, consultation_fee, approval_status, approved_by, approved_at, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, datetime('now'), 0)`
      )
      .run(
        userId,
        d.title,
        d.specialty,
        d.categoryId ?? null,
        d.bio,
        d.experienceYears,
        d.location,
        d.consultationFee,
        req.user!.id
      );

    const newProfId = Number(pRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO professional_applications (
        user_id, professional_id, requested_role, title, specialty, category_id,
        bio, experience_years, location, consultation_fee, status, reviewed_by, reviewed_at
      ) VALUES (?, ?, 'PROFESSIONAL', ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, datetime('now'))`
    ).run(
      userId,
      newProfId,
      d.title,
      d.specialty,
      d.categoryId ?? null,
      d.bio,
      d.experienceYears,
      d.location,
      d.consultationFee,
      req.user!.id
    );

    ensureProfessionalScheduleAndInitialService({
      profId: newProfId,
      categoryId: d.categoryId ?? null,
      specialty: d.specialty,
      fullName: d.fullName,
      consultationFee: d.consultationFee,
    });

    logActivity({
      actorUserId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'ADMIN_CREATE_PROFESSIONAL',
      entityType: 'PROFESSIONAL',
      entityId: newProfId,
      details: `Created & approved professional ${d.fullName} (${d.email})`,
      ipAddress: req.ip,
    });

    return newProfId;
  })();

  res.status(201).json({
    message: 'Professional account created and approved.',
    professionalId: profId,
  });
});

const approvalSchema = z.object({
  approvalStatus: z.enum(['APPROVED', 'REJECTED', 'PENDING']).optional(),
  rejectionReason: z.string().trim().max(500).optional(),
  isFeatured: z.boolean().optional(),
});

adminRouter.patch(
  '/professionals/:id/approval',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const profId = Number(req.params.id);
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval update.' });
      return;
    }

    const db = getDb();
    const prof = db
      .prepare(
        `SELECT p.id, p.user_id, p.category_id, p.specialty, p.consultation_fee,
                p.approval_status, p.is_featured, u.full_name
         FROM professionals p
         JOIN users u ON u.id = p.user_id
         WHERE p.id = ?`
      )
      .get(profId) as
      | {
          id: number;
          user_id: number;
          category_id: number | null;
          specialty: string;
          consultation_fee: number;
          approval_status: string;
          is_featured: number;
          full_name: string;
        }
      | undefined;

    if (!prof) {
      res.status(404).json({ error: 'Professional not found.' });
      return;
    }

    const nextStatus = parsed.data.approvalStatus ?? prof.approval_status;
    const nextFeatured =
      parsed.data.isFeatured !== undefined ? (parsed.data.isFeatured ? 1 : 0) : prof.is_featured;
    const reasonStr = parsed.data.rejectionReason || '';

    db.transaction(() => {
      db.prepare(
        `UPDATE professionals
         SET approval_status = ?,
             approved_by = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_by END,
             approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE approved_at END,
             rejection_reason = ?,
             is_featured = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        nextStatus,
        nextStatus,
        req.user!.id,
        nextStatus,
        reasonStr,
        nextFeatured,
        profId
      );

      if (nextStatus === 'APPROVED') {
        db.prepare(
          `UPDATE users SET role = 'PROFESSIONAL', updated_at = datetime('now') WHERE id = ?`
        ).run(prof.user_id);

        ensureProfessionalScheduleAndInitialService({
          profId: prof.id,
          categoryId: prof.category_id,
          specialty: prof.specialty,
          fullName: prof.full_name,
          consultationFee: prof.consultation_fee,
        });
      }

      const latestApp = db
        .prepare(
          'SELECT id FROM professional_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1'
        )
        .get(prof.user_id) as { id: number } | undefined;

      if (latestApp) {
        db.prepare(
          `UPDATE professional_applications
           SET status = ?,
               professional_id = ?,
               rejection_reason = ?,
               reviewed_by = ?,
               reviewed_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(nextStatus, profId, reasonStr, req.user!.id, latestApp.id);
      }

      logActivity({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: `PROFESSIONAL_${nextStatus}`,
        entityType: 'PROFESSIONAL',
        entityId: profId,
        details: `${prof.full_name}: status=${nextStatus}, featured=${Boolean(nextFeatured)}${
          reasonStr ? `, reason=${reasonStr}` : ''
        }`,
        ipAddress: req.ip,
      });
    }).immediate();

    if (parsed.data.approvalStatus && parsed.data.approvalStatus !== prof.approval_status) {
      await dispatchNotifications({
        userId: prof.user_id,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `Professional Application ${nextStatus}`,
        message:
          nextStatus === 'APPROVED'
            ? `Congratulations ${prof.full_name}! Your SmartCred professional profile has been approved and is now live for client bookings.`
            : `Your SmartCred professional application status was updated to ${nextStatus}.${
                reasonStr ? ` Reason: ${reasonStr}` : ''
              }`,
        channels: ['IN_APP', 'EMAIL'],
      });
    }

    res.json({ message: 'Professional status updated.' });
  }
);

// Manage All Appointments
adminRouter.get('/appointments', (req: AuthenticatedRequest, res: Response) => {
  const status = String(req.query.status || 'all');
  const search = String(req.query.search || '').trim();
  const dateFilter = String(req.query.date || '').trim();
  const customerFilter = String(req.query.customer || '').trim();
  const professionalFilter = String(req.query.professional || '').trim();
  const conditions: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (status !== 'all') {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (dateFilter) {
    conditions.push('a.appointment_date = ?');
    params.push(dateFilter);
  }
  if (customerFilter) {
    const ct = `%${customerFilter}%`;
    conditions.push('(cu.full_name LIKE ? OR cu.email LIKE ?)');
    params.push(ct, ct);
  }
  if (professionalFilter) {
    const pt = `%${professionalFilter}%`;
    conditions.push('(pu.full_name LIKE ? OR CAST(p.id AS TEXT) = ?)');
    params.push(pt, professionalFilter);
  }
  if (search) {
    const t = `%${search}%`;
    conditions.push(
      '(a.booking_code LIKE ? OR cu.full_name LIKE ? OR pu.full_name LIKE ? OR s.name LIKE ?)'
    );
    params.push(t, t, t, t);
  }

  const db = getDb();
  const appointments = db
    .prepare(
      `SELECT a.id, a.booking_code, a.appointment_date, a.start_time, a.end_time,
              a.status, a.total_amount, a.qr_verified_at, a.created_at,
              s.name as service_name,
              cu.full_name as customer_name, cu.email as customer_email,
              pu.full_name as professional_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users cu ON cu.id = a.user_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.appointment_date DESC, a.start_time DESC
       LIMIT 200`
    )
    .all(...params);

  res.json({ appointments });
});

adminRouter.patch(
  '/appointments/:id/status',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const apptId = Number(req.params.id);
    const schema = z.object({
      status: z.enum([
        'Pending',
        'Confirmed',
        'Rejected',
        'Completed',
        'Cancelled',
        'Checked In',
        'No Show',
      ]),
      reason: z.string().trim().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }

    try {
      const updated = transitionAppointmentStatus({
        appointmentId: apptId,
        newStatus: parsed.data.status,
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        reason: parsed.data.reason || 'Administrative status update',
        ipAddress: req.ip,
      });

      await dispatchNotifications({
        userId: updated.userId,
        appointmentId: apptId,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `Booking ${updated.bookingCode} Updated to ${parsed.data.status}`,
        message: `Platform administration updated booking ${updated.bookingCode} to "${parsed.data.status}".`,
        channels: ['IN_APP'],
      });

      res.json({ message: `Appointment updated to ${parsed.data.status}.` });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to update appointment.' });
    }
  }
);

// Service Categories CRUD
adminRouter.get('/categories', (_req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const categories = db
    .prepare(
      `SELECT sc.*,
        (SELECT COUNT(*) FROM professionals p WHERE p.category_id = sc.id) as professional_count,
        (SELECT COUNT(*) FROM services s WHERE s.category_id = sc.id) as service_count
       FROM service_categories sc
       ORDER BY sc.name ASC`
    )
    .all();
  res.json({ categories });
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
});

adminRouter.post('/categories', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid category.' });
    return;
  }

  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const db = getDb();
  try {
    const result = db
      .prepare(
        'INSERT INTO service_categories (name, slug, description, is_active) VALUES (?, ?, ?, ?)'
      )
      .run(parsed.data.name, slug, parsed.data.description, parsed.data.isActive ? 1 : 0);

    logActivity({
      actorUserId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'CREATE_CATEGORY',
      entityType: 'CATEGORY',
      entityId: Number(result.lastInsertRowid),
      details: `Created category "${parsed.data.name}"`,
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Service category created.' });
  } catch {
    res.status(409).json({ error: 'A category with that name already exists.' });
  }
});

adminRouter.put('/categories/:id', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const catId = Number(req.params.id);
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid category payload.' });
    return;
  }

  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const db = getDb();
  db.prepare(
    'UPDATE service_categories SET name = ?, slug = ?, description = ?, is_active = ? WHERE id = ?'
  ).run(parsed.data.name, slug, parsed.data.description, parsed.data.isActive ? 1 : 0, catId);

  res.json({ message: 'Service category updated.' });
});

// Activity Logs & Contact Inquiries
adminRouter.get('/activities', (_req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const logs = db
    .prepare(
      `SELECT l.*, u.full_name as actor_name, u.email as actor_email
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 100`
    )
    .all();

  const contacts = db
    .prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 50')
    .all();

  res.json({ logs, contacts });
});

// Daily, Weekly, and Monthly SQLite Reports + CSV Export
function buildReportQuery(period: string) {
  let groupExpr = 'a.appointment_date';
  if (period === 'weekly') {
    groupExpr = "strftime('%Y-W%W', a.appointment_date)";
  } else if (period === 'monthly') {
    groupExpr = "strftime('%Y-%m', a.appointment_date)";
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         ${groupExpr} as period_label,
         COUNT(*) as total_bookings,
         SUM(CASE WHEN a.status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
         SUM(CASE WHEN a.status IN ('Completed', 'Checked In') THEN 1 ELSE 0 END) as completed_count,
         SUM(CASE WHEN a.status = 'Checked In' OR a.qr_verified_at IS NOT NULL THEN 1 ELSE 0 END) as qr_verified_count,
         SUM(CASE WHEN a.status IN ('Cancelled', 'Rejected') THEN 1 ELSE 0 END) as cancelled_count,
         COALESCE(SUM(CASE WHEN a.status NOT IN ('Cancelled', 'Rejected') THEN a.total_amount ELSE 0 END), 0) as gross_revenue,
         COALESCE(SUM(CASE WHEN a.status IN ('Completed', 'Checked In') THEN a.total_amount ELSE 0 END), 0) as realized_revenue
       FROM appointments a
       GROUP BY period_label
       ORDER BY period_label DESC`
    )
    .all() as Array<{
    period_label: string;
    total_bookings: number;
    confirmed_count: number;
    completed_count: number;
    qr_verified_count: number;
    cancelled_count: number;
    gross_revenue: number;
    realized_revenue: number;
  }>;

  return rows;
}

adminRouter.get('/reports', (req: AuthenticatedRequest, res: Response) => {
  const period = ['daily', 'weekly', 'monthly'].includes(String(req.query.period))
    ? String(req.query.period)
    : 'daily';

  const summaryRows = buildReportQuery(period);
  const db = getDb();

  const professionalPerformance = db
    .prepare(
      `SELECT p.id, u.full_name as professional_name, p.specialty, p.rating_avg,
              COUNT(a.id) as total_bookings,
              SUM(CASE WHEN a.status IN ('Completed', 'Checked In') THEN 1 ELSE 0 END) as completed_count,
              COALESCE(SUM(CASE WHEN a.status NOT IN ('Cancelled', 'Rejected') THEN a.total_amount ELSE 0 END), 0) as revenue
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN appointments a ON a.professional_id = p.id
       WHERE p.approval_status = 'APPROVED'
       GROUP BY p.id
       ORDER BY total_bookings DESC, revenue DESC
       LIMIT 10`
    )
    .all();

  const servicePopularity = db
    .prepare(
      `SELECT s.id, s.name as service_name, u.full_name as professional_name, s.price,
              COUNT(a.id) as booking_count,
              COALESCE(SUM(CASE WHEN a.status NOT IN ('Cancelled', 'Rejected') THEN a.total_amount ELSE 0 END), 0) as revenue
       FROM services s
       JOIN professionals p ON p.id = s.professional_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN appointments a ON a.service_id = s.id
       GROUP BY s.id
       ORDER BY booking_count DESC, revenue DESC
       LIMIT 10`
    )
    .all();

  const cancellationStats = db
    .prepare(
      `SELECT
         COUNT(*) as total_appointments,
         SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count,
         SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected_count,
         SUM(CASE WHEN status = 'No Show' THEN 1 ELSE 0 END) as no_show_count
       FROM appointments`
    )
    .get() as {
    total_appointments: number;
    cancelled_count: number | null;
    rejected_count: number | null;
    no_show_count: number | null;
  };

  res.json({
    period,
    rows: summaryRows,
    professionalPerformance,
    servicePopularity,
    cancellationStats: {
      totalAppointments: cancellationStats.total_appointments || 0,
      cancelledCount: cancellationStats.cancelled_count || 0,
      rejectedCount: cancellationStats.rejected_count || 0,
      noShowCount: cancellationStats.no_show_count || 0,
    },
  });
});

adminRouter.get('/reports/export', (req: AuthenticatedRequest, res: Response) => {
  const period = ['daily', 'weekly', 'monthly'].includes(String(req.query.period))
    ? String(req.query.period)
    : 'daily';

  const rows = buildReportQuery(period);

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Period',
    'Total Bookings',
    'Confirmed',
    'Completed / Checked In',
    'QR Verified Check-Ins',
    'Cancelled / Rejected',
    'Gross Scheduled Revenue (USD)',
    'Realized Revenue (USD)',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.period_label,
        r.total_bookings,
        r.confirmed_count,
        r.completed_count,
        r.qr_verified_count,
        r.cancelled_count,
        r.gross_revenue.toFixed(2),
        r.realized_revenue.toFixed(2),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  logActivity({
    actorUserId: req.user!.id,
    actorRole: 'ADMIN',
    action: 'EXPORT_CSV_REPORT',
    entityType: 'REPORT',
    details: `Exported ${period} SQLite report CSV (${rows.length} rows)`,
    ipAddress: req.ip,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="smartcred-${period}-report-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(lines.join('\n'));
});
