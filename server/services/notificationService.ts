import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { CONFIG } from '../config.ts';
import { getDb } from '../db/database.ts';

export interface NotificationDeliveryResult {
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  status: 'SENT' | 'DEMO_SIMULATED' | 'FAILED' | 'SKIPPED';
  detail: string;
}

interface DispatchParams {
  userId: number;
  appointmentId?: number | null;
  eventType: string;
  subject: string;
  message: string;
  channels?: Array<'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP'>;
}

function hasRealSmtp(): boolean {
  return Boolean(
    CONFIG.smtp.host &&
      CONFIG.smtp.user &&
      CONFIG.smtp.pass &&
      !CONFIG.smtp.host.includes('example')
  );
}

function hasRealTwilio(): boolean {
  return Boolean(
    CONFIG.twilio.accountSid &&
      CONFIG.twilio.accountSid.startsWith('AC') &&
      CONFIG.twilio.authToken &&
      CONFIG.twilio.fromNumber
  );
}

function hasRealWhatsApp(): boolean {
  return Boolean(CONFIG.whatsapp.accessToken && CONFIG.whatsapp.phoneNumberId);
}

export async function dispatchNotifications(
  params: DispatchParams
): Promise<NotificationDeliveryResult[]> {
  const db = getDb();
  const user = db
    .prepare('SELECT id, full_name, email, phone FROM users WHERE id = ?')
    .get(params.userId) as
    | { id: number; full_name: string; email: string; phone: string }
    | undefined;

  if (!user) return [];

  const prefs = (db
    .prepare(
      'SELECT email_enabled, sms_enabled, whatsapp_enabled, reminders_enabled FROM notification_preferences WHERE user_id = ?'
    )
    .get(params.userId) as
    | {
        email_enabled: number;
        sms_enabled: number;
        whatsapp_enabled: number;
        reminders_enabled: number;
      }
    | undefined) ?? {
    email_enabled: 1,
    sms_enabled: 1,
    whatsapp_enabled: 0,
    reminders_enabled: 1,
  };

  if (params.eventType === 'REMINDER' && !prefs.reminders_enabled) {
    return [];
  }

  const targetChannels = params.channels ?? ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'];
  const results: NotificationDeliveryResult[] = [];

  const insertNotif = db.prepare(`
    INSERT INTO notifications (
      user_id, appointment_id, channel, event_type, subject, message, delivery_status, provider_detail, is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  for (const channel of targetChannels) {
    if (channel === 'IN_APP') {
      const detail = 'Delivered to SmartCred In-App Notification Center';
      insertNotif.run(
        user.id,
        params.appointmentId ?? null,
        'IN_APP',
        params.eventType,
        params.subject,
        params.message,
        'SENT',
        detail
      );
      results.push({ channel: 'IN_APP', status: 'SENT', detail });
      continue;
    }

    if (channel === 'EMAIL') {
      if (!prefs.email_enabled) {
        continue;
      }
      if (hasRealSmtp()) {
        try {
          const transporter = nodemailer.createTransport({
            host: CONFIG.smtp.host,
            port: CONFIG.smtp.port,
            secure: CONFIG.smtp.secure,
            auth: {
              user: CONFIG.smtp.user,
              pass: CONFIG.smtp.pass,
            },
          });
          await transporter.sendMail({
            from: CONFIG.smtp.from,
            to: user.email,
            subject: params.subject,
            text: params.message,
          });
          const detail = `Sent via SMTP (${CONFIG.smtp.host}) to ${user.email}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'EMAIL',
            params.eventType,
            params.subject,
            params.message,
            'SENT',
            detail
          );
          results.push({ channel: 'EMAIL', status: 'SENT', detail });
        } catch (err) {
          const detail = `SMTP Error: ${err instanceof Error ? err.message : 'Send failed'}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'EMAIL',
            params.eventType,
            params.subject,
            params.message,
            'FAILED',
            detail
          );
          results.push({ channel: 'EMAIL', status: 'FAILED', detail });
        }
      } else {
        const detail = `Demo Notification (SMTP not configured): Logged email for ${user.email}`;
        insertNotif.run(
          user.id,
          params.appointmentId ?? null,
          'EMAIL',
          params.eventType,
          params.subject,
          params.message,
          'DEMO_SIMULATED',
          detail
        );
        results.push({ channel: 'EMAIL', status: 'DEMO_SIMULATED', detail });
      }
      continue;
    }

    if (channel === 'SMS') {
      if (!prefs.sms_enabled || !user.phone) {
        continue;
      }
      if (hasRealTwilio()) {
        try {
          const client = twilio(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);
          await client.messages.create({
            body: `${params.subject}: ${params.message}`,
            from: CONFIG.twilio.fromNumber,
            to: user.phone,
          });
          const detail = `Sent via Twilio SMS to ${user.phone}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'SMS',
            params.eventType,
            params.subject,
            params.message,
            'SENT',
            detail
          );
          results.push({ channel: 'SMS', status: 'SENT', detail });
        } catch (err) {
          const detail = `Twilio Error: ${err instanceof Error ? err.message : 'SMS failed'}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'SMS',
            params.eventType,
            params.subject,
            params.message,
            'FAILED',
            detail
          );
          results.push({ channel: 'SMS', status: 'FAILED', detail });
        }
      } else {
        const detail = `Demo Notification (Twilio not configured): Logged SMS for ${user.phone}`;
        insertNotif.run(
          user.id,
          params.appointmentId ?? null,
          'SMS',
          params.eventType,
          params.subject,
          params.message,
          'DEMO_SIMULATED',
          detail
        );
        results.push({ channel: 'SMS', status: 'DEMO_SIMULATED', detail });
      }
      continue;
    }

    if (channel === 'WHATSAPP') {
      if (!prefs.whatsapp_enabled || !user.phone) {
        continue;
      }
      if (hasRealWhatsApp()) {
        try {
          const cleanPhone = user.phone.replace(/[^\d]/g, '');
          const waRes = await fetch(
            `https://graph.facebook.com/v20.0/${CONFIG.whatsapp.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${CONFIG.whatsapp.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanPhone,
                type: 'text',
                text: { body: `*${params.subject}*\n${params.message}` },
              }),
            }
          );
          if (!waRes.ok) {
            throw new Error(`WhatsApp Cloud API HTTP ${waRes.status}`);
          }
          const detail = `Sent via WhatsApp Business Cloud API to ${user.phone}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'WHATSAPP',
            params.eventType,
            params.subject,
            params.message,
            'SENT',
            detail
          );
          results.push({ channel: 'WHATSAPP', status: 'SENT', detail });
        } catch (err) {
          const detail = `WhatsApp API Error: ${err instanceof Error ? err.message : 'Failed'}`;
          insertNotif.run(
            user.id,
            params.appointmentId ?? null,
            'WHATSAPP',
            params.eventType,
            params.subject,
            params.message,
            'FAILED',
            detail
          );
          results.push({ channel: 'WHATSAPP', status: 'FAILED', detail });
        }
      } else {
        const detail = `Demo Notification (WhatsApp Cloud API not configured): Logged message for ${user.phone}`;
        insertNotif.run(
          user.id,
          params.appointmentId ?? null,
          'WHATSAPP',
          params.eventType,
          params.subject,
          params.message,
          'DEMO_SIMULATED',
          detail
        );
        results.push({ channel: 'WHATSAPP', status: 'DEMO_SIMULATED', detail });
      }
    }
  }

  return results;
}
