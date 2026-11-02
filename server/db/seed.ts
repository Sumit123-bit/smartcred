import bcrypt from 'bcrypt';
import { getDb } from './database.ts';
import { CONFIG } from '../config.ts';
import { createQrCredentials } from '../utils/security.ts';

function formatLocalDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function seedDatabaseIfEmpty(force = false): { seeded: boolean; message: string } {
  const db = getDb();

  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0 && !force) {
    return { seeded: false, message: 'Database already contains persistent records; skipping seed.' };
  }

  // Always seed baseline categories if none exist
  const catCount = db.prepare('SELECT COUNT(*) as count FROM service_categories').get() as { count: number };
  if (catCount.count === 0) {
    const insertCat = db.prepare(
      'INSERT INTO service_categories (name, slug, description) VALUES (?, ?, ?)'
    );
    insertCat.run(
      'Medical & Executive Health',
      'medical-executive-health',
      'Preventive cardiology, diagnostic evaluations, and comprehensive executive health consultations.'
    );
    insertCat.run(
      'Corporate & Tax Advisory',
      'corporate-tax-advisory',
      'Cross-border entity structuring, regulatory compliance, and strategic corporate legal counsel.'
    );
    insertCat.run(
      'Architecture & Spatial Design',
      'architecture-spatial-design',
      'Commercial studio planning, residential feasibility studies, and sustainable architectural reviews.'
    );
    insertCat.run(
      'Dermatology & Wellness',
      'dermatology-wellness',
      'Clinical skin diagnostics, restorative dermatology, and personalized longevity protocols.'
    );
    insertCat.run(
      'Financial & Wealth Strategy',
      'financial-wealth-strategy',
      'Fiduciary portfolio audits, retirement modeling, and capital allocation advisory.'
    );
  }

  if (!CONFIG.enableDemoSeed && !force) {
    return {
      seeded: false,
      message: 'ENABLE_DEMO_SEED is disabled; skipped demo account creation.',
    };
  }

  if (existingUsers.count > 0) {
    return { seeded: false, message: 'Users already exist; skipping demo account insertion.' };
  }

  const demoPasswordHash = bcrypt.hashSync('demo123', 10);

  const runSeed = db.transaction(() => {
    const categories = db
      .prepare('SELECT id, slug FROM service_categories')
      .all() as Array<{ id: number; slug: string }>;
    const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

    const insertUser = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, phone, avatar_url, role, is_active, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    `);

    const insertPrefs = db.prepare(`
      INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled)
      VALUES (?, 1, 1, 1, 1)
    `);

    // 1. Mandatory Demo Admin Account
    const adminRes = insertUser.run(
      'Vikramaditya Sen',
      'admin@smartcred.demo',
      demoPasswordHash,
      '+919810011001',
      '',
      'ADMIN'
    );
    const adminId = Number(adminRes.lastInsertRowid);
    insertPrefs.run(adminId);

    // 2. Mandatory Demo User Account
    const userRes = insertUser.run(
      'Aarav Kulkarni',
      'user@smartcred.demo',
      demoPasswordHash,
      '+919820022002',
      '',
      'USER'
    );
    const demoUserId = Number(userRes.lastInsertRowid);
    insertPrefs.run(demoUserId);

    // Additional realistic client accounts for rich booking history & reviews
    const client2Res = insertUser.run(
      'Meera Subramanian',
      'meera.s@smartcred.demo',
      demoPasswordHash,
      '+919820033003',
      '',
      'USER'
    );
    const client2Id = Number(client2Res.lastInsertRowid);
    insertPrefs.run(client2Id);

    const client3Res = insertUser.run(
      'Kabir Malhotra',
      'kabir.m@smartcred.demo',
      demoPasswordHash,
      '+919820044004',
      '',
      'USER'
    );
    const client3Id = Number(client3Res.lastInsertRowid);
    insertPrefs.run(client3Id);

    // 3. Mandatory Demo Professional Account (Dr. Arjun Mehta, MD)
    const prof1UserRes = insertUser.run(
      'Dr. Arjun Mehta, MD',
      'professional@smartcred.demo',
      demoPasswordHash,
      '+919830055001',
      '/src/assets/images/avatar_dr_arjun_mehta_1793623651638.jpg',
      'PROFESSIONAL'
    );
    const prof1UserId = Number(prof1UserRes.lastInsertRowid);
    insertPrefs.run(prof1UserId);

    // Additional Professionals
    const prof2UserRes = insertUser.run(
      'Elena Rostova, JD',
      'elena.rostova@smartcred.demo',
      demoPasswordHash,
      '+919830055002',
      '/src/assets/images/avatar_elena_rostova_1793623656504.jpg',
      'PROFESSIONAL'
    );
    const prof2UserId = Number(prof2UserRes.lastInsertRowid);
    insertPrefs.run(prof2UserId);

    const prof3UserRes = insertUser.run(
      'Marcus Vance, AIA',
      'marcus.vance@smartcred.demo',
      demoPasswordHash,
      '+919830055003',
      '/src/assets/images/avatar_marcus_vance_1793623654281.jpg',
      'PROFESSIONAL'
    );
    const prof3UserId = Number(prof3UserRes.lastInsertRowid);
    insertPrefs.run(prof3UserId);

    const prof4UserRes = insertUser.run(
      'Dr. Priya Nair, MD',
      'priya.nair@smartcred.demo',
      demoPasswordHash,
      '+919830055004',
      '/src/assets/images/avatar_priya_nair_1793623655112.jpg',
      'PROFESSIONAL'
    );
    const prof4UserId = Number(prof4UserRes.lastInsertRowid);
    insertPrefs.run(prof4UserId);

    // Pending Professional Application (so Admin can test Approve/Reject immediately)
    const prof5UserRes = insertUser.run(
      'Rohan Deshmukh, CFA',
      'rohan.deshmukh@smartcred.demo',
      demoPasswordHash,
      '+919830055005',
      '',
      'PROFESSIONAL'
    );
    const prof5UserId = Number(prof5UserRes.lastInsertRowid);
    insertPrefs.run(prof5UserId);

    const insertProf = db.prepare(`
      INSERT INTO professionals (
        user_id, title, specialty, category_id, bio, experience_years,
        location, consultation_fee, approval_status, approved_by, approved_at,
        rating_avg, review_count, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `);

    const prof1Id = Number(
      insertProf.run(
        prof1UserId,
        'Senior Consultant Cardiologist & Executive Physician',
        'Preventive Cardiology & Diagnostics',
        catBySlug['medical-executive-health'],
        'Board-certified cardiologist with 16 years of clinical leadership in preventive heart health, metabolic risk stratification, and comprehensive executive diagnostics.',
        16,
        'Suite 402, Nariman Point Medical Pavilion, Mumbai',
        180,
        'APPROVED',
        adminId,
        4.9,
        2,
        1
      ).lastInsertRowid
    );

    const prof2Id = Number(
      insertProf.run(
        prof2UserId,
        'Principal Corporate & Regulatory Counsel',
        'Corporate Structuring & Tax Law',
        catBySlug['corporate-tax-advisory'],
        'Advises technology founders, family offices, and cross-border enterprises on corporate governance, SaaS licensing contracts, and tax-efficient entity architecture.',
        12,
        'Tower B, Bandra Kurla Complex, Mumbai',
        240,
        'APPROVED',
        adminId,
        4.95,
        1,
        1
      ).lastInsertRowid
    );

    const prof3Id = Number(
      insertProf.run(
        prof3UserId,
        'Principal Architect & Workspace Strategist',
        'Commercial & Sustainable Architecture',
        catBySlug['architecture-spatial-design'],
        'Leads architectural feasibility, acoustic workspace planning, and sustainable material engineering for clinics, creative studios, and modern residences.',
        14,
        'Indiranagar Design Quarter, Bengaluru',
        210,
        'APPROVED',
        adminId,
        4.85,
        1,
        1
      ).lastInsertRowid
    );

    const prof4Id = Number(
      insertProf.run(
        prof4UserId,
        'Consultant Clinical Dermatologist',
        'Clinical Dermatology & Skin Diagnostics',
        catBySlug['dermatology-wellness'],
        'Specializes in evidence-based dermatological diagnostics, dermoscopy screenings, barrier restoration, and long-term therapeutic skin protocols.',
        10,
        'Jubilee Hills Clinical Suite, Hyderabad',
        150,
        'APPROVED',
        adminId,
        5.0,
        1,
        1
      ).lastInsertRowid
    );

    // Pending application (not approved yet)
    const prof5Id = Number(
      db.prepare(`
        INSERT INTO professionals (
          user_id, title, specialty, category_id, bio, experience_years,
          location, consultation_fee, approval_status, rating_avg, review_count, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 5.0, 0, 0)
      `).run(
        prof5UserId,
        'Chartered Financial Analyst & Fiduciary Advisor',
        'Institutional Portfolio & Tax Planning',
        catBySlug['financial-wealth-strategy'],
        'Independent fiduciary advisor specializing in multi-asset allocation, equity compensation taxation, and risk-adjusted treasury management.',
        9,
        'Connaught Place Financial Center, New Delhi',
        165
      ).lastInsertRowid
    );

    db.prepare(`
      INSERT INTO professional_applications (
        user_id, professional_id, requested_role, title, specialty, category_id,
        bio, experience_years, location, consultation_fee, status, reviewed_by, reviewed_at
      )
      SELECT
        p.user_id, p.id, 'PROFESSIONAL', p.title, p.specialty, p.category_id,
        p.bio, p.experience_years, p.location, p.consultation_fee, p.approval_status,
        p.approved_by, p.approved_at
      FROM professionals p
      WHERE p.id IN (?, ?, ?, ?, ?)
    `).run(prof1Id, prof2Id, prof3Id, prof4Id, prof5Id);

    // Seed Services
    const insertService = db.prepare(`
      INSERT INTO services (professional_id, category_id, name, description, duration_minutes, price, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    const s1 = Number(
      insertService.run(
        prof1Id,
        catBySlug['medical-executive-health'],
        'Comprehensive Executive Cardiac Assessment',
        'Full 60-minute cardiovascular risk review, lipid & biomarker interpretation, ECG analysis, and personalized preventive roadmap.',
        60,
        180
      ).lastInsertRowid
    );
    const s2 = Number(
      insertService.run(
        prof1Id,
        catBySlug['medical-executive-health'],
        'Preventive Follow-Up & Diagnostic Review',
        'Focused 30-minute consultation to review lab panels, blood pressure trends, and medication or lifestyle adjustments.',
        30,
        110
      ).lastInsertRowid
    );
    insertService.run(
      prof1Id,
      catBySlug['medical-executive-health'],
      'Metabolic & Longevity Screening Consultation',
      '45-minute diagnostic planning session covering VO2 max targets, insulin sensitivity markers, and sleep recovery.',
      45,
      150
    );

    const s4 = Number(
      insertService.run(
        prof2Id,
        catBySlug['corporate-tax-advisory'],
        'Founder Entity & Cross-Border Structuring',
        '60-minute legal consultation on incorporation structure, IP assignment, shareholder agreements, and regulatory compliance.',
        60,
        240
      ).lastInsertRowid
    );
    insertService.run(
      prof2Id,
      catBySlug['corporate-tax-advisory'],
      'Commercial SaaS Contract &MSA Audit',
      '45-minute line-by-line risk review of enterprise master service agreements, liability caps, and data protection clauses.',
      45,
      195
    );

    const s6 = Number(
      insertService.run(
        prof3Id,
        catBySlug['architecture-spatial-design'],
        'Architectural Site & Spatial Feasibility Review',
        '60-minute consultation evaluating floorplans, natural daylighting, zoning constraints, and preliminary construction budgets.',
        60,
        210
      ).lastInsertRowid
    );
    insertService.run(
      prof3Id,
      catBySlug['architecture-spatial-design'],
      'Acoustic & Executive Studio Layout Session',
      '45-minute ergonomic and acoustic interior planning session for hybrid offices and private consultation suites.',
      45,
      165
    );

    const s8 = Number(
      insertService.run(
        prof4Id,
        catBySlug['dermatology-wellness'],
        'Clinical Dermoscopy & Skin Health Evaluation',
        '45-minute diagnostic skin examination, mole mapping review, and evidence-based prescription regimen.',
        45,
        150
      ).lastInsertRowid
    );
    insertService.run(
      prof4Id,
      catBySlug['dermatology-wellness'],
      'Targeted Therapeutic Follow-Up',
      '30-minute progress review and seasonal protocol calibration.',
      30,
      95
    );

    // Seed 7-day Availability for all 4 approved professionals (work Mon-Sat, Sunday off; also make sure today & tomorrow are working days so live demo slots are always open!)
    const insertAvail = db.prepare(`
      INSERT INTO availability (professional_id, day_of_week, is_working, start_time, end_time, break_start, break_end, slot_interval_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 30)
    `);

    for (const pId of [prof1Id, prof2Id, prof3Id, prof4Id]) {
      for (let day = 0; day <= 6; day++) {
        // Make Monday-Saturday (1..6) working + Sunday (0) working from 10:00-15:00 for Dr. Arjun Mehta so demo works any day of the week
        const isWorking = day === 0 ? (pId === prof1Id ? 1 : 0) : 1;
        const start = day === 0 ? '10:00' : '09:00';
        const end = day === 0 ? '15:00' : '18:00';
        const breakStart = day === 0 ? '12:30' : '13:00';
        const breakEnd = day === 0 ? '13:00' : '14:00';
        insertAvail.run(pId, day, isWorking, start, end, breakStart, breakEnd);
      }
    }

    // Add 1 sample blocked date +14 days ahead for Dr. Arjun Mehta
    db.prepare(`
      INSERT INTO blocked_dates (professional_id, blocked_date, reason)
      VALUES (?, ?, ?)
    `).run(prof1Id, formatLocalDateOffset(14), 'Annual Cardiology Symposium');

    // Seed Realistic Appointments (Past Completed, Today Confirmed, Tomorrow Confirmed, +2d Pending, -1d Checked In)
    const insertAppt = db.prepare(`
      INSERT INTO appointments (
        booking_code, user_id, professional_id, service_id,
        appointment_date, start_time, end_time, status, notes,
        total_amount, qr_nonce, qr_token_hash, qr_verified_at, qr_verified_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);

    const insertSlotBlock = db.prepare(`
      INSERT INTO blocked_slots (professional_id, slot_date, start_time, end_time, reason, appointment_id)
      VALUES (?, ?, ?, ?, 'Booked Appointment', ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO appointment_status_history (appointment_id, old_status, new_status, changed_by_user_id, note)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Appointment 1: Completed (-5 days) - Aarav with Dr. Arjun Mehta
    const dPast5 = formatLocalDateOffset(-5);
    const code1 = `SC-${dPast5.replace(/-/g, '')}-4101AA`;
    const qr1 = createQrCredentials(code1);
    const appt1Id = Number(
      insertAppt.run(
        code1,
        demoUserId,
        prof1Id,
        s1,
        dPast5,
        '10:00',
        '11:00',
        'Completed',
        'Annual executive cardiac checkup and lipid panel review.',
        180,
        qr1.qrNonce,
        qr1.qrTokenHash,
        `${dPast5} 09:54:00`,
        prof1UserId,
        '-5 days'
      ).lastInsertRowid
    );
    insertHistory.run(appt1Id, null, 'Pending', demoUserId, 'Appointment booked by client');
    insertHistory.run(appt1Id, 'Pending', 'Confirmed', prof1UserId, 'Confirmed by Dr. Arjun Mehta');
    insertHistory.run(appt1Id, 'Confirmed', 'Checked In', prof1UserId, 'Verified via QR check-in');
    insertHistory.run(appt1Id, 'Checked In', 'Completed', prof1UserId, 'Consultation completed');

    // Appointment 2: Completed (-3 days) - Meera with Elena Rostova
    const dPast3 = formatLocalDateOffset(-3);
    const code2 = `SC-${dPast3.replace(/-/g, '')}-5208BB`;
    const qr2 = createQrCredentials(code2);
    const appt2Id = Number(
      insertAppt.run(
        code2,
        client2Id,
        prof2Id,
        s4,
        dPast3,
        '11:00',
        '12:00',
        'Completed',
        'Delaware & India subsidiary structuring consultation.',
        240,
        qr2.qrNonce,
        qr2.qrTokenHash,
        `${dPast3} 10:55:00`,
        prof2UserId,
        '-3 days'
      ).lastInsertRowid
    );
    insertHistory.run(appt2Id, null, 'Confirmed', prof2UserId, 'Confirmed and completed');

    // Appointment 3: Completed (-2 days) - Kabir with Marcus Vance
    const dPast2 = formatLocalDateOffset(-2);
    const code3 = `SC-${dPast2.replace(/-/g, '')}-6312CC`;
    const qr3 = createQrCredentials(code3);
    const appt3Id = Number(
      insertAppt.run(
        code3,
        client3Id,
        prof3Id,
        s6,
        dPast2,
        '14:30',
        '15:30',
        'Completed',
        'Commercial studio acoustic partitioning review.',
        210,
        qr3.qrNonce,
        qr3.qrTokenHash,
        `${dPast2} 14:25:00`,
        prof3UserId,
        '-2 days'
      ).lastInsertRowid
    );
    insertHistory.run(appt3Id, null, 'Completed', prof3UserId, 'Completed consultation');

    // Appointment 4: Completed (-1 day) - Meera with Dr. Priya Nair
    const dPast1 = formatLocalDateOffset(-1);
    const code4 = `SC-${dPast1.replace(/-/g, '')}-7419DD`;
    const qr4 = createQrCredentials(code4);
    const appt4Id = Number(
      insertAppt.run(
        code4,
        client2Id,
        prof4Id,
        s8,
        dPast1,
        '15:00',
        '15:45',
        'Completed',
        'Annual dermoscopy screening and barrier protocol.',
        150,
        qr4.qrNonce,
        qr4.qrTokenHash,
        `${dPast1} 14:52:00`,
        prof4UserId,
        '-1 day'
      ).lastInsertRowid
    );
    insertHistory.run(appt4Id, null, 'Completed', prof4UserId, 'Completed skin evaluation');

    // Appointment 5: Confirmed (+1 day / Tomorrow) - Aarav with Dr. Arjun Mehta (Ready for QR Download & QR Scanner Check-In!)
    const dTomorrow = formatLocalDateOffset(1);
    const code5 = `SC-${dTomorrow.replace(/-/g, '')}-8520EE`;
    const qr5 = createQrCredentials(code5);
    const appt5Id = Number(
      insertAppt.run(
        code5,
        demoUserId,
        prof1Id,
        s2,
        dTomorrow,
        '10:30',
        '11:00',
        'Confirmed',
        'Follow-up biomarker review and blood pressure calibration.',
        110,
        qr5.qrNonce,
        qr5.qrTokenHash,
        null,
        null,
        '-6 hours'
      ).lastInsertRowid
    );
    insertSlotBlock.run(prof1Id, dTomorrow, '10:30', '11:00', appt5Id);
    insertHistory.run(appt5Id, null, 'Pending', demoUserId, 'Booked via SmartCred portal');
    insertHistory.run(appt5Id, 'Pending', 'Confirmed', prof1UserId, 'Approved by Dr. Arjun Mehta');

    // Appointment 6: Pending (+2 days) - Kabir with Dr. Arjun Mehta (Ready for Professional Accept/Reject demo!)
    const dPlus2 = formatLocalDateOffset(2);
    const code6 = `SC-${dPlus2.replace(/-/g, '')}-9631FF`;
    const qr6 = createQrCredentials(code6);
    const appt6Id = Number(
      insertAppt.run(
        code6,
        client3Id,
        prof1Id,
        s1,
        dPlus2,
        '11:30',
        '12:30',
        'Pending',
        'First-time executive cardiovascular baseline assessment.',
        180,
        qr6.qrNonce,
        qr6.qrTokenHash,
        null,
        null,
        '-2 hours'
      ).lastInsertRowid
    );
    insertSlotBlock.run(prof1Id, dPlus2, '11:30', '12:30', appt6Id);
    insertHistory.run(appt6Id, null, 'Pending', client3Id, 'Awaiting professional confirmation');

    // Appointment 7: Confirmed (+3 days) - Aarav with Elena Rostova
    const dPlus3 = formatLocalDateOffset(3);
    const code7 = `SC-${dPlus3.replace(/-/g, '')}-3142GG`;
    const qr7 = createQrCredentials(code7);
    const appt7Id = Number(
      insertAppt.run(
        code7,
        demoUserId,
        prof2Id,
        s4,
        dPlus3,
        '15:00',
        '16:00',
        'Confirmed',
        'Advisory session on software IP holding structure.',
        240,
        qr7.qrNonce,
        qr7.qrTokenHash,
        null,
        null,
        '-1 day'
      ).lastInsertRowid
    );
    insertSlotBlock.run(prof2Id, dPlus3, '15:00', '16:00', appt7Id);
    insertHistory.run(appt7Id, null, 'Confirmed', prof2UserId, 'Confirmed corporate legal slot');

    // Seed Verified Reviews
    const insertReview = db.prepare(`
      INSERT INTO reviews (appointment_id, user_id, professional_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertReview.run(
      appt1Id,
      demoUserId,
      prof1Id,
      5,
      'Before SmartCred, coordinating diagnostic reviews took four phone calls. Booking Dr. Mehta took under two minutes, QR check-in at reception was instant, and we completed a full 60-minute cardiac roadmap on schedule.'
    );
    insertReview.run(
      appt2Id,
      client2Id,
      prof2Id,
      5,
      'Elena reviewed our cross-border subsidiary terms with remarkable precision. Real-time slot availability eliminated a week of email back-and-forth across time zones.'
    );
    insertReview.run(
      appt3Id,
      client3Id,
      prof3Id,
      5,
      'Marcus identified two structural daylighting changes during our 60-minute feasibility session that reduced our studio buildout estimate by 18%.'
    );
    insertReview.run(
      appt4Id,
      client2Id,
      prof4Id,
      5,
      'Zero waiting room delay—scanned my appointment QR pass on arrival and went straight into my dermoscopy evaluation with Dr. Nair.'
    );

    // Seed Notifications
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, appointment_id, channel, event_type, subject, message, delivery_status, provider_detail, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertNotif.run(
      demoUserId,
      appt5Id,
      'IN_APP',
      'BOOKING_CONFIRMED',
      'Appointment Confirmed: Dr. Arjun Mehta, MD',
      `Your Preventive Follow-Up (${code5}) on ${dTomorrow} at 10:30 is confirmed. Your QR check-in pass is ready for download.`,
      'SENT',
      'In-App Notification Center',
      0
    );
    insertNotif.run(
      demoUserId,
      appt5Id,
      'EMAIL',
      'BOOKING_CONFIRMED',
      'SmartCred Booking Confirmation ' + code5,
      `Confirmed appointment with Dr. Arjun Mehta, MD on ${dTomorrow} at 10:30.`,
      'DEMO_SIMULATED',
      'Demo Notification: SMTP credentials not configured — logged in SQLite',
      1
    );
    insertNotif.run(
      prof1UserId,
      appt6Id,
      'IN_APP',
      'BOOKING_CREATED',
      'New Pending Booking Request',
      `Kabir Malhotra requested Comprehensive Executive Cardiac Assessment (${code6}) on ${dPlus2} at 11:30.`,
      'SENT',
      'In-App Notification Center',
      0
    );

    // Seed Activity Logs
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, '127.0.0.1')
    `);
    insertLog.run(adminId, 'ADMIN', 'SYSTEM_SEED', 'DATABASE', 1, 'Initialized SmartCred persistent SQLite database and baseline records');
    insertLog.run(adminId, 'ADMIN', 'APPROVE_PROFESSIONAL', 'PROFESSIONAL', prof1Id, 'Approved Dr. Arjun Mehta, MD');
    insertLog.run(demoUserId, 'USER', 'BOOK_APPOINTMENT', 'APPOINTMENT', appt5Id, `Created booking ${code5}`);
    insertLog.run(prof1UserId, 'PROFESSIONAL', 'CONFIRM_APPOINTMENT', 'APPOINTMENT', appt5Id, `Confirmed booking ${code5}`);
  });

  runSeed();
  return { seeded: true, message: 'SmartCred SQLite database seeded successfully with demo accounts and relational records.' };
}
