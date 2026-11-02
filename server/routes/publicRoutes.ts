import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database.ts';
import { verifyCsrf } from '../middleware/auth.ts';
import { logActivity } from '../utils/security.ts';

export const publicRouter = Router();

publicRouter.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();
  const approvedProfessionals = (
    db
      .prepare("SELECT COUNT(*) as c FROM professionals WHERE approval_status = 'APPROVED'")
      .get() as { c: number }
  ).c;
  const activeServices = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM services s
         JOIN professionals p ON p.id = s.professional_id
         WHERE s.is_active = 1 AND p.approval_status = 'APPROVED'`
      )
      .get() as { c: number }
  ).c;
  const totalBookings = (
    db.prepare('SELECT COUNT(*) as c FROM appointments').get() as { c: number }
  ).c;
  const avgRatingRow = db
    .prepare(
      "SELECT ROUND(AVG(rating_avg), 2) as avg FROM professionals WHERE approval_status = 'APPROVED'"
    )
    .get() as { avg: number | null };

  res.json({
    approvedProfessionals,
    activeServices,
    totalBookings,
    averageRating: avgRatingRow.avg || 4.9,
  });
});

publicRouter.get('/categories', (_req: Request, res: Response) => {
  const db = getDb();
  const categories = db
    .prepare(
      `SELECT sc.*,
        (SELECT COUNT(*) FROM professionals p WHERE p.category_id = sc.id AND p.approval_status = 'APPROVED') as professional_count,
        (SELECT COUNT(*) FROM services s JOIN professionals p ON p.id = s.professional_id WHERE s.category_id = sc.id AND s.is_active = 1 AND p.approval_status = 'APPROVED') as service_count
       FROM service_categories sc
       WHERE sc.is_active = 1
       ORDER BY sc.name ASC`
    )
    .all();

  res.json({ categories });
});

publicRouter.get('/professionals', (req: Request, res: Response) => {
  const db = getDb();
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  const featured = req.query.featured === 'true';
  const sort = String(req.query.sort || 'rating');

  const conditions: string[] = ["p.approval_status = 'APPROVED'", 'u.is_active = 1'];
  const params: Array<string | number> = [];

  if (featured) {
    conditions.push('p.is_featured = 1');
  }

  if (category && category !== 'all') {
    conditions.push('(sc.slug = ? OR CAST(sc.id AS TEXT) = ?)');
    params.push(category, category);
  }

  if (search) {
    conditions.push(
      '(u.full_name LIKE ? OR p.title LIKE ? OR p.specialty LIKE ? OR p.location LIKE ? OR sc.name LIKE ?)'
    );
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }

  let orderBy = 'p.is_featured DESC, p.rating_avg DESC';
  if (sort === 'price_asc') orderBy = 'p.consultation_fee ASC';
  else if (sort === 'price_desc') orderBy = 'p.consultation_fee DESC';
  else if (sort === 'experience') orderBy = 'p.experience_years DESC';

  const professionals = db
    .prepare(
      `SELECT p.id, p.user_id, u.full_name, u.avatar_url, p.title, p.specialty,
              p.bio, p.experience_years, p.location, p.consultation_fee,
              p.rating_avg, p.review_count, p.is_featured,
              sc.id as category_id, sc.name as category_name, sc.slug as category_slug,
              (SELECT COUNT(*) FROM services s WHERE s.professional_id = p.id AND s.is_active = 1) as service_count
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}`
    )
    .all(...params);

  res.json({ professionals });
});

publicRouter.get('/professionals/:id', (req: Request, res: Response) => {
  const profId = Number(req.params.id);
  if (!Number.isInteger(profId) || profId <= 0) {
    res.status(400).json({ error: 'Invalid professional ID.' });
    return;
  }

  const db = getDb();
  const professional = db
    .prepare(
      `SELECT p.id, p.user_id, u.full_name, u.avatar_url, p.title, p.specialty,
              p.bio, p.experience_years, p.location, p.consultation_fee,
              p.rating_avg, p.review_count, p.is_featured,
              sc.id as category_id, sc.name as category_name, sc.slug as category_slug
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id
       WHERE p.id = ? AND p.approval_status = 'APPROVED' AND u.is_active = 1`
    )
    .get(profId);

  if (!professional) {
    res.status(404).json({ error: 'Professional not found.' });
    return;
  }

  const services = db
    .prepare(
      `SELECT s.*, sc.name as category_name
       FROM services s
       LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.professional_id = ? AND s.is_active = 1
       ORDER BY s.price ASC`
    )
    .all(profId);

  const availability = db
    .prepare(
      `SELECT day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes
       FROM availability
       WHERE professional_id = ?
       ORDER BY day_of_week ASC`
    )
    .all(profId);

  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name as client_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.professional_id = ?
       ORDER BY r.created_at DESC
       LIMIT 20`
    )
    .all(profId);

  res.json({ professional, services, availability, reviews });
});

publicRouter.get('/services', (req: Request, res: Response) => {
  const db = getDb();
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();

  const conditions: string[] = [
    's.is_active = 1',
    "p.approval_status = 'APPROVED'",
    'u.is_active = 1',
  ];
  const params: Array<string | number> = [];

  if (category && category !== 'all') {
    conditions.push('(sc.slug = ? OR CAST(sc.id AS TEXT) = ?)');
    params.push(category, category);
  }

  if (search) {
    const term = `%${search}%`;
    conditions.push('(s.name LIKE ? OR s.description LIKE ? OR u.full_name LIKE ? OR sc.name LIKE ?)');
    params.push(term, term, term, term);
  }

  const services = db
    .prepare(
      `SELECT s.id, s.professional_id, s.name, s.description, s.duration_minutes, s.price,
              u.full_name as professional_name, u.avatar_url as professional_avatar,
              p.title as professional_title, p.specialty, p.location, p.rating_avg,
              sc.id as category_id, sc.name as category_name, sc.slug as category_slug
       FROM services s
       JOIN professionals p ON p.id = s.professional_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = COALESCE(s.category_id, p.category_id)
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.is_featured DESC, s.price ASC`
    )
    .all(...params);

  res.json({ services });
});

publicRouter.get('/reviews', (_req: Request, res: Response) => {
  const db = getDb();
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.full_name as client_name,
              pu.full_name as professional_name,
              p.specialty as professional_specialty,
              s.name as service_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN professionals p ON p.id = r.professional_id
       JOIN users pu ON pu.id = p.user_id
       JOIN appointments a ON a.id = r.appointment_id
       JOIN services s ON s.id = a.service_id
       ORDER BY r.rating DESC, r.created_at DESC
       LIMIT 6`
    )
    .all();

  res.json({ reviews });
});

const contactSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  email: z.string().trim().email('Valid email address is required'),
  subject: z.string().trim().min(3, 'Subject is required').max(150),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000),
});

publicRouter.post('/contact', verifyCsrf, (req: Request, res: Response) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid contact message.' });
    return;
  }

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO contact_messages (full_name, email, subject, message)
       VALUES (?, ?, ?, ?)`
    )
    .run(parsed.data.fullName, parsed.data.email, parsed.data.subject, parsed.data.message);

  logActivity({
    actorRole: 'GUEST',
    action: 'SUBMIT_CONTACT_MESSAGE',
    entityType: 'CONTACT',
    entityId: Number(result.lastInsertRowid),
    details: `${parsed.data.email}: ${parsed.data.subject}`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    message: 'Your inquiry has been recorded. Our team will respond within one business day.',
  });
});

