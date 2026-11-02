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
import {
  extractRawQrToken,
  logActivity,
  sha256Hex,
} from '../utils/security.ts';

export const professionalRouter = Router();

professionalRouter.use(authenticate, authorize('PROFESSIONAL', 'ADMIN'));

function getProfessionalForUser(userId: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT p.*, u.full_name, u.email, u.phone, u.avatar_url, sc.name as category_name
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id
       WHERE p.user_id = ?`
    )
    .get(userId) as
    | {
        id: number;
        user_id: number;
        title: string;
        specialty: string;
        category_id: number | null;
        category_name: string | null;
        bio: string;
        experience_years: number;
        location: string;
        consultation_fee: number;
        approval_status: string;
        rejection_reason: string;
        rating_avg: number;
        review_count: number;
        is_featured: number;
        full_name: string;
        email: string;
        phone: string;
        avatar_url: string;
      }
    | undefined;
}

professionalRouter.get('/dashboard', (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const db = getDb();
  const kpi = db
    .prepare(
      `SELECT
         COUNT(*) as total_bookings,
         SUM(CASE WHEN appointment_date = date('now') AND status IN ('Pending', 'Confirmed', 'Checked In') THEN 1 ELSE 0 END) as today_count,
         SUM(CASE WHEN appointment_date >= date('now') AND status IN ('Pending', 'Confirmed') THEN 1 ELSE 0 END) as upcoming_count,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
         SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
         SUM(CASE WHEN status IN ('Completed', 'Checked In') THEN 1 ELSE 0 END) as completed_count,
         SUM(CASE WHEN status IN ('Cancelled', 'Rejected') THEN 1 ELSE 0 END) as cancelled_count,
         COUNT(DISTINCT user_id) as total_customers,
         COALESCE(SUM(CASE WHEN status IN ('Completed', 'Checked In') THEN total_amount ELSE 0 END), 0) as realized_revenue,
         COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN total_amount ELSE 0 END), 0) as scheduled_revenue
       FROM appointments
       WHERE professional_id = ?`
    )
    .get(prof.id) as {
    total_bookings: number;
    today_count: number | null;
    upcoming_count: number | null;
    pending_count: number | null;
    confirmed_count: number | null;
    completed_count: number | null;
    cancelled_count: number | null;
    total_customers: number | null;
    realized_revenue: number;
    scheduled_revenue: number;
  };

  const dailySeries = db
    .prepare(
      `SELECT appointment_date as date,
              COUNT(*) as bookings,
              COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Rejected') THEN total_amount ELSE 0 END), 0) as revenue
       FROM appointments
       WHERE professional_id = ?
         AND appointment_date >= date('now', '-7 days')
         AND appointment_date <= date('now', '+7 days')
       GROUP BY appointment_date
       ORDER BY appointment_date ASC`
    )
    .all(prof.id);

  const activeServicesCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM services WHERE professional_id = ? AND is_active = 1')
      .get(prof.id) as { c: number }
  ).c;

  const recentActivity = db
    .prepare(
      `SELECT a.id, a.booking_code, a.appointment_date, a.start_time, a.status, a.updated_at,
              s.name as service_name, u.full_name as customer_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users u ON u.id = a.user_id
       WHERE a.professional_id = ?
       ORDER BY a.updated_at DESC, a.id DESC
       LIMIT 6`
    )
    .all(prof.id);

  res.json({
    professional: prof,
    stats: {
      totalBookings: kpi.total_bookings || 0,
      todayCount: kpi.today_count || 0,
      upcomingCount: kpi.upcoming_count || 0,
      pendingCount: kpi.pending_count || 0,
      confirmedCount: kpi.confirmed_count || 0,
      completedCount: kpi.completed_count || 0,
      cancelledCount: kpi.cancelled_count || 0,
      totalCustomers: kpi.total_customers || 0,
      realizedRevenue: kpi.realized_revenue || 0,
      scheduledRevenue: kpi.scheduled_revenue || 0,
      activeServicesCount,
      ratingAvg: prof.rating_avg,
      reviewCount: prof.review_count,
    },
    dailySeries,
    recentActivity,
  });
});

const profProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).default(''),
  title: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  categoryId: z.number().int().positive().nullable().optional(),
  bio: z.string().trim().max(2000).default(''),
  experienceYears: z.number().int().min(0).max(60),
  location: z.string().trim().max(200).default(''),
  consultationFee: z.number().min(0).max(50000),
});

professionalRouter.put('/profile', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const parsed = profProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile fields.' });
    return;
  }

  const db = getDb();
  const d = parsed.data;

  db.transaction(() => {
    db.prepare(
      `UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(d.fullName, d.phone, req.user!.id);

    db.prepare(
      `UPDATE professionals
       SET title = ?, specialty = ?, category_id = ?, bio = ?,
           experience_years = ?, location = ?, consultation_fee = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      d.title,
      d.specialty,
      d.categoryId ?? null,
      d.bio,
      d.experienceYears,
      d.location,
      d.consultationFee,
      prof.id
    );
  })();

  logActivity({
    actorUserId: req.user!.id,
    actorRole: 'PROFESSIONAL',
    action: 'UPDATE_PROFESSIONAL_PROFILE',
    entityType: 'PROFESSIONAL',
    entityId: prof.id,
    details: 'Updated professional practice details',
    ipAddress: req.ip,
  });

  res.json({
    message: 'Professional profile saved.',
    professional: getProfessionalForUser(req.user!.id),
  });
});

// Services CRUD
professionalRouter.get('/services', (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }
  const db = getDb();
  const services = db
    .prepare(
      `SELECT s.*, sc.name as category_name,
        (SELECT COUNT(*) FROM appointments a WHERE a.service_id = s.id) as booking_count
       FROM services s
       LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.professional_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(prof.id);
  res.json({ services });
});

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Service name is required').max(150),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(1500).default(''),
  durationMinutes: z.number().int().min(15).max(480),
  price: z.number().min(0).max(50000),
  isActive: z.boolean().optional().default(true),
});

professionalRouter.post('/services', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid service fields.' });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const result = db
    .prepare(
      `INSERT INTO services (professional_id, category_id, name, description, duration_minutes, price, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      prof.id,
      d.categoryId ?? prof.category_id ?? null,
      d.name,
      d.description,
      d.durationMinutes,
      d.price,
      d.isActive ? 1 : 0
    );

  logActivity({
    actorUserId: req.user!.id,
    actorRole: 'PROFESSIONAL',
    action: 'CREATE_SERVICE',
    entityType: 'SERVICE',
    entityId: Number(result.lastInsertRowid),
    details: `Created service "${d.name}" ($${d.price}, ${d.durationMinutes}m)`,
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Service added to your catalog.' });
});

professionalRouter.put('/services/:id', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const serviceId = Number(req.params.id);
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid service fields.' });
    return;
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM services WHERE id = ? AND professional_id = ?')
    .get(serviceId, prof.id);

  if (!existing) {
    res.status(404).json({ error: 'Service not found.' });
    return;
  }

  const d = parsed.data;
  db.prepare(
    `UPDATE services
     SET name = ?, category_id = ?, description = ?, duration_minutes = ?,
         price = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ? AND professional_id = ?`
  ).run(
    d.name,
    d.categoryId ?? prof.category_id ?? null,
    d.description,
    d.durationMinutes,
    d.price,
    d.isActive ? 1 : 0,
    serviceId,
    prof.id
  );

  res.json({ message: 'Service updated.' });
});

professionalRouter.delete(
  '/services/:id',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }

    const serviceId = Number(req.params.id);
    const db = getDb();

    const apptRef = db
      .prepare('SELECT COUNT(*) as c FROM appointments WHERE service_id = ?')
      .get(serviceId) as { c: number };

    if (apptRef.c > 0) {
      // Soft deactivate to preserve relational history integrity
      db.prepare(
        `UPDATE services SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND professional_id = ?`
      ).run(serviceId, prof.id);
      res.json({
        message: 'Service archived (deactivated) because historical appointments reference it.',
      });
      return;
    }

    const del = db
      .prepare('DELETE FROM services WHERE id = ? AND professional_id = ?')
      .run(serviceId, prof.id);

    if (del.changes === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    res.json({ message: 'Service deleted permanently.' });
  }
);

// Availability & Breaks
professionalRouter.get('/availability', (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }
  const db = getDb();
  const availability = db
    .prepare(
      `SELECT day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes
       FROM availability
       WHERE professional_id = ?
       ORDER BY day_of_week ASC`
    )
    .all(prof.id);

  res.json({ availability });
});

const availabilityListSchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isWorking: z.boolean(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        breakStart: z.string().regex(/^(\d{2}:\d{2})?$/).nullable().optional(),
        breakEnd: z.string().regex(/^(\d{2}:\d{2})?$/).nullable().optional(),
        slotIntervalMinutes: z.number().int().min(15).max(120).default(30),
      })
    )
    .length(7),
});

professionalRouter.put('/availability', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const parsed = availabilityListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid weekly availability schedule.' });
    return;
  }

  for (const day of parsed.data.days) {
    if (day.isWorking && day.startTime >= day.endTime) {
      res.status(400).json({
        error: `End time must be after start time on working days.`,
      });
      return;
    }
    if (day.breakStart && day.breakEnd && day.breakStart >= day.breakEnd) {
      res.status(400).json({
        error: `Break end time must be after break start time.`,
      });
      return;
    }
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO availability (
       professional_id, day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(professional_id, day_of_week) DO UPDATE SET
       is_working = excluded.is_working,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       break_start = excluded.break_start,
       break_end = excluded.break_end,
       slot_interval_minutes = excluded.slot_interval_minutes`
  );

  db.transaction(() => {
    for (const day of parsed.data.days) {
      upsert.run(
        prof.id,
        day.dayOfWeek,
        day.isWorking ? 1 : 0,
        day.startTime,
        day.endTime,
        day.breakStart || null,
        day.breakEnd || null,
        day.slotIntervalMinutes
      );
    }
  })();

  logActivity({
    actorUserId: req.user!.id,
    actorRole: 'PROFESSIONAL',
    action: 'UPDATE_AVAILABILITY',
    entityType: 'PROFESSIONAL',
    entityId: prof.id,
    details: 'Updated weekly working hours and break schedule',
    ipAddress: req.ip,
  });

  res.json({ message: 'Weekly schedule and break periods saved.' });
});

// Blocked Dates & Custom Blocked Slots
professionalRouter.get('/blocked', (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }
  const db = getDb();
  const blockedDates = db
    .prepare(
      'SELECT id, blocked_date, reason, created_at FROM blocked_dates WHERE professional_id = ? ORDER BY blocked_date ASC'
    )
    .all(prof.id);

  const blockedSlots = db
    .prepare(
      `SELECT id, slot_date, start_time, end_time, reason, created_at
       FROM blocked_slots
       WHERE professional_id = ? AND appointment_id IS NULL
       ORDER BY slot_date ASC, start_time ASC`
    )
    .all(prof.id);

  res.json({ blockedDates, blockedSlots });
});

professionalRouter.post(
  '/blocked-dates',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }

    const schema = z.object({
      blockedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid YYYY-MM-DD date required'),
      reason: z.string().trim().min(2).max(200).default('Unavailable'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid date.' });
      return;
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO blocked_dates (professional_id, blocked_date, reason)
       VALUES (?, ?, ?)
       ON CONFLICT(professional_id, blocked_date) DO UPDATE SET reason = excluded.reason`
    ).run(prof.id, parsed.data.blockedDate, parsed.data.reason);

    res.status(201).json({ message: 'Date blocked on your calendar.' });
  }
);

professionalRouter.delete(
  '/blocked-dates/:id',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }
    const db = getDb();
    db.prepare('DELETE FROM blocked_dates WHERE id = ? AND professional_id = ?').run(
      Number(req.params.id),
      prof.id
    );
    res.json({ message: 'Blocked date removed.' });
  }
);

professionalRouter.post(
  '/blocked-slots',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }

    const schema = z.object({
      slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      reason: z.string().trim().min(2).max(200).default('Custom Block'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
      res.status(400).json({ error: 'Valid date and start/end times required.' });
      return;
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO blocked_slots (professional_id, slot_date, start_time, end_time, reason, appointment_id)
       VALUES (?, ?, ?, ?, ?, NULL)`
    ).run(
      prof.id,
      parsed.data.slotDate,
      parsed.data.startTime,
      parsed.data.endTime,
      parsed.data.reason
    );

    res.status(201).json({ message: 'Custom time window blocked.' });
  }
);

professionalRouter.delete(
  '/blocked-slots/:id',
  verifyCsrf,
  (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }
    const db = getDb();
    db.prepare(
      'DELETE FROM blocked_slots WHERE id = ? AND professional_id = ? AND appointment_id IS NULL'
    ).run(Number(req.params.id), prof.id);
    res.json({ message: 'Blocked slot removed.' });
  }
);

// Professional Appointments & Customer Details
professionalRouter.get('/appointments', (req: AuthenticatedRequest, res: Response) => {
  const prof = getProfessionalForUser(req.user!.id);
  if (!prof) {
    res.status(404).json({ error: 'Professional profile not found.' });
    return;
  }

  const statusFilter = String(req.query.status || 'all');
  const dateFilter = String(req.query.date || '');
  const conditions = ['a.professional_id = ?'];
  const params: Array<string | number> = [prof.id];

  if (statusFilter !== 'all') {
    conditions.push('a.status = ?');
    params.push(statusFilter);
  }
  if (dateFilter) {
    conditions.push('a.appointment_date = ?');
    params.push(dateFilter);
  }

  const db = getDb();
  const appointments = db
    .prepare(
      `SELECT a.id, a.booking_code, a.appointment_date, a.start_time, a.end_time,
              a.status, a.notes, a.cancellation_reason, a.total_amount, a.qr_verified_at, a.created_at,
              s.name as service_name, s.duration_minutes,
              u.id as customer_id, u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users u ON u.id = a.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.appointment_date DESC, a.start_time ASC`
    )
    .all(...params);

  res.json({ appointments });
});

const statusUpdateSchema = z.object({
  status: z.enum(['Confirmed', 'Rejected', 'Completed', 'Cancelled', 'No Show']),
  reason: z.string().trim().max(500).optional(),
});

professionalRouter.patch(
  '/appointments/:id/status',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const apptId = Number(req.params.id);
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status transition.' });
      return;
    }

    try {
      const updated = transitionAppointmentStatus({
        appointmentId: apptId,
        newStatus: parsed.data.status,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        reason: parsed.data.reason,
        ipAddress: req.ip,
      });

      const eventMap: Record<string, string> = {
        Confirmed: 'BOOKING_CONFIRMED',
        Rejected: 'BOOKING_CANCELLED',
        Cancelled: 'BOOKING_CANCELLED',
        Completed: 'PROFESSIONAL_UPDATE',
        'No Show': 'PROFESSIONAL_UPDATE',
      };

      await dispatchNotifications({
        userId: updated.userId,
        appointmentId: apptId,
        eventType: eventMap[parsed.data.status] || 'PROFESSIONAL_UPDATE',
        subject: `Appointment ${parsed.data.status}: ${updated.bookingCode}`,
        message: `Your ${updated.serviceName} appointment with ${updated.professionalName} on ${updated.appointmentDate} at ${updated.startTime} is now marked "${parsed.data.status}".${
          parsed.data.reason ? ` Note: ${parsed.data.reason}` : ''
        }`,
        channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'],
      });

      res.json({ message: `Appointment marked as ${parsed.data.status}.` });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to update appointment status.' });
    }
  }
);

// QR Code Scanner Verification & Authorized Check-In
const qrScanSchema = z.object({
  qrToken: z.string().trim().min(10, 'Invalid QR verification payload'),
});

professionalRouter.post('/qr/verify', verifyCsrf, (req: AuthenticatedRequest, res: Response) => {
  const parsed = qrScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please scan or paste a valid SmartCred QR verification token.' });
    return;
  }

  const rawToken = extractRawQrToken(parsed.data.qrToken);
  const tokenHash = sha256Hex(rawToken);
  const db = getDb();

  const appt = db
    .prepare(
      `SELECT a.id, a.booking_code, a.professional_id, a.appointment_date, a.start_time, a.end_time,
              a.status, a.notes, a.total_amount, a.qr_verified_at,
              s.name as service_name, s.duration_minutes,
              u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone,
              p.user_id as prof_user_id, pu.full_name as professional_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN users u ON u.id = a.user_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE a.qr_token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: number;
        booking_code: string;
        professional_id: number;
        appointment_date: string;
        start_time: string;
        end_time: string;
        status: string;
        notes: string;
        total_amount: number;
        qr_verified_at: string | null;
        service_name: string;
        duration_minutes: number;
        customer_name: string;
        customer_email: string;
        customer_phone: string;
        prof_user_id: number;
        professional_name: string;
      }
    | undefined;

  if (!appt) {
    res.status(404).json({
      valid: false,
      error: 'Cryptographic token not recognized. No matching appointment found.',
    });
    return;
  }

  if (req.user!.role === 'PROFESSIONAL' && appt.prof_user_id !== req.user!.id) {
    res.status(403).json({
      valid: false,
      error: `This appointment belongs to ${appt.professional_name}, not your practice.`,
    });
    return;
  }

  const alreadyVerified = Boolean(appt.qr_verified_at) || appt.status === 'Checked In';
  const canCheckIn =
    !alreadyVerified && ['Confirmed', 'Pending'].includes(appt.status);

  res.json({
    valid: true,
    canCheckIn,
    alreadyVerified,
    verificationWarning: alreadyVerified
      ? `Duplicate scan blocked: Customer already checked in at ${appt.qr_verified_at || 'earlier today'}.`
      : !canCheckIn
      ? `Appointment cannot be checked in because current status is "${appt.status}".`
      : null,
    appointment: {
      id: appt.id,
      bookingCode: appt.booking_code,
      appointmentDate: appt.appointment_date,
      startTime: appt.start_time,
      endTime: appt.end_time,
      status: appt.status,
      notes: appt.notes,
      totalAmount: appt.total_amount,
      qrVerifiedAt: appt.qr_verified_at,
      serviceName: appt.service_name,
      durationMinutes: appt.duration_minutes,
      customerName: appt.customer_name,
      customerEmail: appt.customer_email,
      customerPhone: appt.customer_phone,
      professionalName: appt.professional_name,
    },
  });
});

professionalRouter.post(
  '/qr/check-in',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = qrScanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid QR verification token.' });
      return;
    }

    const rawToken = extractRawQrToken(parsed.data.qrToken);
    const tokenHash = sha256Hex(rawToken);
    const db = getDb();

    const appt = db
      .prepare(
        `SELECT a.id, a.booking_code, a.user_id, a.status, a.qr_verified_at,
                p.user_id as prof_user_id
         FROM appointments a
         JOIN professionals p ON p.id = a.professional_id
         WHERE a.qr_token_hash = ?`
      )
      .get(tokenHash) as
      | {
          id: number;
          booking_code: string;
          user_id: number;
          status: string;
          qr_verified_at: string | null;
          prof_user_id: number;
        }
      | undefined;

    if (!appt) {
      res.status(404).json({ error: 'Invalid QR token.' });
      return;
    }

    if (req.user!.role === 'PROFESSIONAL' && appt.prof_user_id !== req.user!.id) {
      res.status(403).json({ error: 'You are not authorized to check in this appointment.' });
      return;
    }

    if (appt.qr_verified_at || appt.status === 'Checked In' || appt.status === 'Completed') {
      res.status(409).json({
        error: `Duplicate verification prevented: Appointment ${appt.booking_code} was already verified (${appt.status}).`,
      });
      return;
    }

    if (!['Confirmed', 'Pending'].includes(appt.status)) {
      res.status(400).json({
        error: `Cannot check in an appointment with status "${appt.status}".`,
      });
      return;
    }

    try {
      const updated = transitionAppointmentStatus({
        appointmentId: appt.id,
        newStatus: 'Checked In',
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        reason: 'Verified via SmartCred QR Code Scanner',
        ipAddress: req.ip,
      });

      await dispatchNotifications({
        userId: updated.userId,
        appointmentId: appt.id,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `Checked In: ${updated.bookingCode}`,
        message: `You have been verified and checked in for ${updated.serviceName} with ${updated.professionalName}.`,
        channels: ['IN_APP'],
      });

      res.json({
        message: `Booking ${updated.bookingCode} verified and checked in successfully.`,
        bookingCode: updated.bookingCode,
        status: 'Checked In',
      });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'QR check-in failed.' });
    }
  }
);

professionalRouter.post(
  '/send-reminders',
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const prof = getProfessionalForUser(req.user!.id);
    if (!prof) {
      res.status(404).json({ error: 'Professional profile not found.' });
      return;
    }
    const db = getDb();
    const upcoming = db
      .prepare(
        `SELECT a.id, a.booking_code, a.user_id, a.appointment_date, a.start_time, s.name as service_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         WHERE a.professional_id = ?
           AND a.status = 'Confirmed'
           AND a.appointment_date >= date('now')
           AND a.appointment_date <= date('now', '+3 days')`
      )
      .all(prof.id) as Array<{
      id: number;
      booking_code: string;
      user_id: number;
      appointment_date: string;
      start_time: string;
      service_name: string;
    }>;

    let count = 0;
    for (const appt of upcoming) {
      await dispatchNotifications({
        userId: appt.user_id,
        appointmentId: appt.id,
        eventType: 'REMINDER',
        subject: `Upcoming Appointment Reminder: ${appt.booking_code}`,
        message: `Reminder: Your ${appt.service_name} session with ${prof.full_name} is scheduled for ${appt.appointment_date} at ${appt.start_time}. Bring your QR pass for check-in.`,
        channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'],
      });
      count++;
    }

    res.json({
      message:
        count > 0
          ? `Dispatched upcoming reminders for ${count} confirmed appointment(s).`
          : 'No confirmed appointments in the next 3 days require reminders.',
      remindedCount: count,
    });
  }
);
