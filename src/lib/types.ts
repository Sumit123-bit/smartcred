export type UserRole = 'USER' | 'PROFESSIONAL' | 'ADMIN';

export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  role: UserRole;
  professionalId?: number;
  applicationId?: number;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_active: number;
  professional_count?: number;
  service_count?: number;
}

export interface ProfessionalSummary {
  id: number;
  user_id: number;
  full_name: string;
  avatar_url: string;
  title: string;
  specialty: string;
  bio: string;
  experience_years: number;
  location: string;
  consultation_fee: number;
  rating_avg: number;
  review_count: number;
  is_featured: number;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  service_count?: number;
  approval_status?: string;
  email?: string;
  phone?: string;
  appointment_count?: number;
}

export interface ServiceItem {
  id: number;
  professional_id: number;
  category_id: number | null;
  category_name?: string | null;
  category_slug?: string | null;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  is_active?: number;
  booking_count?: number;
  professional_name?: string;
  professional_avatar?: string;
  professional_title?: string;
  specialty?: string;
  location?: string;
  rating_avg?: number;
}

export interface AvailabilityDay {
  day_of_week: number;
  is_working: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  slot_interval_minutes: number;
}

export interface AppointmentRecord {
  id: number;
  booking_code: string;
  professional_id?: number;
  service_id?: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled' | 'Checked In' | 'No Show';
  notes: string;
  cancellation_reason?: string;
  total_amount: number;
  qr_verified_at: string | null;
  created_at: string;
  service_name: string;
  duration_minutes?: number;
  professional_name?: string;
  professional_avatar?: string;
  professional_title?: string;
  professional_specialty?: string;
  professional_location?: string;
  customer_id?: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  review_id?: number | null;
  review_rating?: number | null;
}

export interface NotificationRecord {
  id: number;
  appointment_id: number | null;
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  event_type: string;
  subject: string;
  message: string;
  delivery_status: 'SENT' | 'DEMO_SIMULATED' | 'FAILED' | 'SKIPPED';
  provider_detail: string;
  is_read: number;
  created_at: string;
}

export interface ReviewItem {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  client_name: string;
  professional_name?: string;
  professional_specialty?: string;
  service_name?: string;
}

export interface ProfessionalApplicationRecord {
  id: number;
  user_id: number;
  professional_id: number | null;
  requested_role: string;
  title: string;
  specialty: string;
  category_id: number | null;
  category_name?: string | null;
  bio: string;
  experience_years: number;
  location: string;
  consultation_fee: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string;
  reviewed_by: number | null;
  reviewer_name?: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  full_name?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  current_user_role?: string;
  is_active?: number;
}

