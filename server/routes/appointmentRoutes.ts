import { Router, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { getDb } from '../db/database.ts';
import {
  authenticate,
  verifyCsrf,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  BookingConflictError,
  createTransactionalBooking,
  getAvailableSlots,
  rescheduleTransactionalBooking,
  transitionAppointmentStatus,
} from '../services/bookingEngine.ts';
import { dispatchNotifications } from '../services/notificationService.ts';
import { deriveQrRawToken } from '../utils/security.ts';

export const appointmentRouter = Router();

// Public slot lookup so users can explore available times before or after signing in
appointmentRouter.get('/slots', (req: Request, res: Response) => {
  const professionalId = Number(req.query.professionalId);
  const serviceId = Number(req.query.serviceId);
  const date = String(req.query.date || '').trim();
  const excludeId = req.query.excludeAppointmentId
    ? Number(req.query.excludeAppointmentId)
    : undefined;

  if (!professionalId || !serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'professionalId, serviceId, and YYYY-MM-DD date are required.' });
    return;
  }

  const result = getAvailableSlots({
    professionalId,
    serviceId,
    date,
    excludeAppointmentId: excludeId,
  });

  res.json(result);
});

const createBookingSchema = z.object({
  professionalId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid YYYY-MM-DD date'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid HH:MM start time'),
  notes: z.string().max(1000).optional().default(''),
});

appointmentRouter.post(
  '/',
  authenticate,
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid booking parameters.',
      });
      return;
    }

    try {
      const booking = createTransactionalBooking({
        userId: req.user!.id,
        userRole: req.user!.role,
        professionalId: parsed.data.professionalId,
        serviceId: parsed.data.serviceId,
        appointmentDate: parsed.data.appointmentDate,
        startTime: parsed.data.startTime,
        notes: parsed.data.notes,
        ipAddress: req.ip,
      });

      const qrDataUrl = await QRCode.toDataURL(booking.qrPayload, {
        width: 340,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      const customerDeliveries = await dispatchNotifications({
        userId: req.user!.id,
        appointmentId: booking.appointmentId,
        eventType: 'BOOKING_CREATED',
        subject: `Appointment Booked: ${booking.bookingCode}`,
        message: `Your ${booking.serviceName} appointment with ${booking.professionalName} on ${parsed.data.appointmentDate} at ${parsed.data.startTime} (${booking.bookingCode}) is recorded.`,
        channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'],
      });

      await dispatchNotifications({
        userId: booking.professionalUserId,
        appointmentId: booking.appointmentId,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `New Booking Request: ${booking.bookingCode}`,
        message: `${req.user!.fullName} booked ${booking.serviceName} for ${parsed.data.appointmentDate} at ${parsed.data.startTime}.`,
        channels: ['IN_APP', 'EMAIL'],
      });

      res.status(201).json({
        message: 'Appointment booked successfully.',
        booking: {
          id: booking.appointmentId,
          bookingCode: booking.bookingCode,
          appointmentDate: parsed.data.appointmentDate,
          startTime: parsed.data.startTime,
          endTime: booking.endTime,
          totalAmount: booking.totalAmount,
          status: booking.status,
          serviceName: booking.serviceName,
          professionalName: booking.professionalName,
          qrDataUrl,
          qrVerificationToken: booking.qrPayload,
        },
        notifications: customerDeliveries,
      });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Booking error:', err);
      res.status(500).json({ error: 'Failed to create appointment.' });
    }
  }
);

appointmentRouter.get('/my', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const statusFilter = String(req.query.status || 'all');
  const conditions = ['a.user_id = ?'];
  const params: Array<string | number> = [req.user!.id];

  if (statusFilter !== 'all') {
    conditions.push('a.status = ?');
    params.push(statusFilter);
  }

  const appointments = db
    .prepare(
      `SELECT a.id, a.booking_code, a.professional_id, a.service_id,
              a.appointment_date, a.start_time, a.end_time, a.status,
              a.notes, a.cancellation_reason, a.total_amount, a.qr_verified_at, a.created_at,
              s.name as service_name, s.duration_minutes,
              pu.full_name as professional_name, pu.avatar_url as professional_avatar,
              p.title as professional_title, p.specialty as professional_specialty, p.location as professional_location,
              (SELECT r.id FROM reviews r WHERE r.appointment_id = a.id) as review_id,
              (SELECT r.rating FROM reviews r WHERE r.appointment_id = a.id) as review_rating
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.appointment_date DESC, a.start_time DESC`
    )
    .all(...params);

  res.json({ appointments });
});

appointmentRouter.get('/:id/qr', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const apptId = Number(req.params.id);
  const db = getDb();

  const appt = db
    .prepare(
      `SELECT a.id, a.booking_code, a.user_id, a.appointment_date, a.start_time, a.end_time,
              a.status, a.qr_nonce, a.qr_verified_at,
              s.name as service_name,
              pu.full_name as professional_name, p.user_id as prof_user_id, p.location
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE a.id = ?`
    )
    .get(apptId) as
    | {
        id: number;
        booking_code: string;
        user_id: number;
        appointment_date: string;
        start_time: string;
        end_time: string;
        status: string;
        qr_nonce: string;
        qr_verified_at: string | null;
        service_name: string;
        professional_name: string;
        prof_user_id: number;
        location: string;
      }
    | undefined;

  if (!appt) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }

  const isOwner = appt.user_id === req.user!.id;
  const isProf = appt.prof_user_id === req.user!.id;
  const isAdmin = req.user!.role === 'ADMIN';

  if (!isOwner && !isProf && !isAdmin) {
    res.status(403).json({ error: 'Not authorized to access this QR pass.' });
    return;
  }

  if (['Cancelled', 'Rejected'].includes(appt.status)) {
    res.status(400).json({
      error: `QR pass is inactive because this appointment is ${appt.status}.`,
    });
    return;
  }

  const rawToken = deriveQrRawToken(appt.booking_code, appt.qr_nonce);
  const qrPayload = `SCQR.v1.${rawToken}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 360,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  res.json({
    bookingCode: appt.booking_code,
    status: appt.status,
    appointmentDate: appt.appointment_date,
    startTime: appt.start_time,
    endTime: appt.end_time,
    serviceName: appt.service_name,
    professionalName: appt.professional_name,
    location: appt.location,
    qrVerifiedAt: appt.qr_verified_at,
    qrDataUrl,
    qrVerificationToken: qrPayload,
  });
});

appointmentRouter.get('/:id/history', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const apptId = Number(req.params.id);
  const db = getDb();

  const appt = db
    .prepare(
      `SELECT a.user_id, p.user_id as prof_user_id
       FROM appointments a
       JOIN professionals p ON p.id = a.professional_id
       WHERE a.id = ?`
    )
    .get(apptId) as { user_id: number; prof_user_id: number } | undefined;

  if (!appt) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }

  if (
    req.user!.role !== 'ADMIN' &&
    appt.user_id !== req.user!.id &&
    appt.prof_user_id !== req.user!.id
  ) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const history = db
    .prepare(
      `SELECT h.id, h.old_status, h.new_status, h.note, h.created_at,
              u.full_name as changed_by_name, u.role as changed_by_role
       FROM appointment_status_history h
       LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.appointment_id = ?
       ORDER BY h.created_at ASC, h.id ASC`
    )
    .all(apptId);

  res.json({ history });
});

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional().default('Cancelled by client'),
});

appointmentRouter.post(
  '/:id/cancel',
  authenticate,
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const apptId = Number(req.params.id);
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cancellation payload.' });
      return;
    }

    try {
      const updated = transitionAppointmentStatus({
        appointmentId: apptId,
        newStatus: 'Cancelled',
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        reason: parsed.data.reason || 'Cancelled by client',
        ipAddress: req.ip,
      });

      await dispatchNotifications({
        userId: updated.userId,
        appointmentId: apptId,
        eventType: 'BOOKING_CANCELLED',
        subject: `Appointment Cancelled: ${updated.bookingCode}`,
        message: `Your appointment (${updated.bookingCode}) for ${updated.serviceName} on ${updated.appointmentDate} at ${updated.startTime} has been cancelled and the slot has been released.`,
        channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'],
      });

      await dispatchNotifications({
        userId: updated.professionalUserId,
        appointmentId: apptId,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `Client Cancelled Booking: ${updated.bookingCode}`,
        message: `Booking ${updated.bookingCode} on ${updated.appointmentDate} at ${updated.startTime} was cancelled. Reason: ${parsed.data.reason}`,
        channels: ['IN_APP', 'EMAIL'],
      });

      res.json({ message: 'Appointment cancelled and time slot released.' });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to cancel appointment.' });
    }
  }
);

const rescheduleSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid YYYY-MM-DD date'),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid HH:MM time'),
  note: z.string().trim().max(500).optional(),
});

appointmentRouter.post(
  '/:id/reschedule',
  authenticate,
  verifyCsrf,
  async (req: AuthenticatedRequest, res: Response) => {
    const apptId = Number(req.params.id);
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid reschedule parameters.',
      });
      return;
    }

    try {
      const updated = rescheduleTransactionalBooking({
        appointmentId: apptId,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        newDate: parsed.data.newDate,
        newStartTime: parsed.data.newStartTime,
        note: parsed.data.note,
        ipAddress: req.ip,
      });

      await dispatchNotifications({
        userId: updated.userId,
        appointmentId: apptId,
        eventType: 'BOOKING_RESCHEDULED',
        subject: `Appointment Rescheduled: ${updated.bookingCode}`,
        message: `Your ${updated.serviceName} session with ${updated.professionalName} (${updated.bookingCode}) is rescheduled to ${updated.newDate} at ${updated.newStartTime}. A fresh QR verification token has been issued.`,
        channels: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'],
      });

      await dispatchNotifications({
        userId: updated.professionalUserId,
        appointmentId: apptId,
        eventType: 'PROFESSIONAL_UPDATE',
        subject: `Booking Rescheduled: ${updated.bookingCode}`,
        message: `Appointment ${updated.bookingCode} moved to ${updated.newDate} at ${updated.newStartTime}.`,
        channels: ['IN_APP'],
      });

      res.json({
        message: 'Appointment rescheduled successfully.',
        booking: updated,
      });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to reschedule appointment.' });
    }
  }
);
