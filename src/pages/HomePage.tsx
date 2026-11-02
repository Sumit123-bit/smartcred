import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Clock,
  QrCode,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ProfessionalSummary, ReviewItem, ServiceItem } from '../lib/types';
import { AvatarImage } from '../components/AvatarImage';

const HERO_IMAGE = '/src/assets/images/hero_smartcred_studio_1793623652120.jpg';

const FAQS = [
  {
    q: 'How does SmartCred prevent double bookings and overlapping appointments?',
    a: 'Every booking request runs inside an atomic SQLite transaction that validates working hours, daily break windows, blocked dates, and existing active reservations before issuing a booking code.',
  },
  {
    q: 'What information is stored inside the appointment QR code?',
    a: 'Zero personal customer data is placed inside the QR code. The QR image encodes only an opaque cryptographic token (SCQR.v1), whose SHA-256 hash is verified server-side against SQLite when scanned by the assigned professional.',
  },
  {
    q: 'Can I reschedule or cancel an appointment after booking?',
    a: 'Yes. From your User Dashboard, you can reschedule to any open time slot (which automatically rotates your QR verification token) or cancel an appointment to immediately release the reserved slot.',
  },
  {
    q: 'How do professionals join the SmartCred directory?',
    a: 'Specialists submit a Professional Registration application with their credentials, category, and consultation details. Once reviewed and approved by a platform administrator, their schedule becomes live.',
  },
];

export const HomePage: React.FC = () => {
  const [stats, setStats] = useState({
    approvedProfessionals: 4,
    activeServices: 9,
    totalBookings: 7,
    averageRating: 4.93,
  });
  const [featuredPros, setFeaturedPros] = useState<ProfessionalSummary[]>([]);
  const [popularServices, setPopularServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    Promise.all([
      api.get('/public/stats'),
      api.get<{ professionals: ProfessionalSummary[] }>('/public/professionals?featured=true'),
      api.get<{ services: ServiceItem[] }>('/public/services'),
      api.get<{ reviews: ReviewItem[] }>('/public/reviews'),
    ])
      .then(([statsRes, prosRes, servRes, revRes]) => {
        setStats(statsRes.data);
        setFeaturedPros(prosRes.data.professionals.slice(0, 4));
        setPopularServices(servRes.data.services.slice(0, 6));
        setReviews(revRes.data.reviews.slice(0, 4));
      })
      .catch(() => {
        // Fallback gracefully if initial load races
      });
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium text-indigo-400 tracking-wide mb-4">
              Verified Practice Directory · Real-Time Slot Engine · QR Check-In
            </p>
            <h1
              style={{ textWrap: 'balance' }}
              className="text-4xl sm:text-5xl lg:text-[3.35rem] font-bold text-white leading-[1.12] tracking-tight"
            >
              Book Smarter. Schedule Better. Save Time.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              Discover trusted professionals, schedule appointments, and manage all your bookings in
              one place with SmartCred.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/book"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-indigo-950/50 transition-all whitespace-nowrap shrink-0"
              >
                <span>Book Appointment</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
              <Link
                to="/explore"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 text-slate-100 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                <span>Explore Professionals</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[300px] lg:min-h-[410px] rounded-2xl overflow-hidden border border-white/10 bg-slate-900">
              {!heroImgFailed ? (
                <img
                  src={HERO_IMAGE}
                  alt="Modern executive consultation lounge and architectural practice reception"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 flex items-center justify-center p-8 text-center">
                  <div>
                    <Calendar className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                    <p className="text-lg font-semibold text-white">SmartCred Consultation Suite</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#080c16]/85 via-[#080c16]/25 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400">Arrival Verification Protocol</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    Instant Cryptographic QR Pass Check-In
                  </p>
                </div>
                <QrCode className="w-8 h-8 text-indigo-400 shrink-0" />
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Live SQLite Metrics Row below Hero Split */}
        <div className="mt-10 glass-panel rounded-2xl p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
              {stats.approvedProfessionals}
            </p>
            <p className="text-xs text-slate-400 mt-1">Verified Active Specialists</p>
          </div>
          <div className="lg:border-l lg:border-white/10 lg:pl-6">
            <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
              {stats.activeServices}
            </p>
            <p className="text-xs text-slate-400 mt-1">Bookable Consultation Services</p>
          </div>
          <div className="lg:border-l lg:border-white/10 lg:pl-6">
            <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
              {stats.totalBookings}
            </p>
            <p className="text-xs text-slate-400 mt-1">SQLite Recorded Appointments</p>
          </div>
          <div className="lg:border-l lg:border-white/10 lg:pl-6">
            <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">
              {Number(stats.averageRating).toFixed(2)} / 5.0
            </p>
            <p className="text-xs text-slate-400 mt-1">Verified Client Satisfaction</p>
          </div>
        </div>
      </section>

      {/* Featured Professionals */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Featured Professionals</h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Administrator-verified specialists with live calendar availability
            </p>
          </div>
          <Link
            to="/explore"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300 whitespace-nowrap shrink-0"
          >
            <span>View Full Directory</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredPros.map((pro) => (
            <div
              key={pro.id}
              className="glass-panel rounded-2xl p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-4">
                  <AvatarImage
                    src={pro.avatar_url}
                    name={pro.full_name}
                    sizeClass="w-14 h-14"
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">
                      {pro.full_name}
                    </h3>
                    <p className="text-xs text-indigo-300 truncate mt-0.5">{pro.specialty}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {Number(pro.rating_avg).toFixed(1)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{pro.experience_years} yrs exp</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-200">${pro.consultation_fee}</span>
                </div>

                <p className="mt-3 text-sm text-slate-300 line-clamp-3 leading-relaxed">
                  {pro.bio}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                <Link
                  to={`/professionals/${pro.id}`}
                  className="text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                >
                  View Profile
                </Link>
                <Link
                  to={`/book?professionalId=${pro.id}`}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  Book Slot
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popular Services */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Popular Services</h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Transparent durations and consultation fees retrieved directly from SQLite
            </p>
          </div>
          <Link
            to="/services"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300 whitespace-nowrap shrink-0"
          >
            <span>Browse All Services</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {popularServices.map((srv) => (
            <div
              key={srv.id}
              className="glass-panel rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                  <span>{srv.category_name || 'Consultation'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    {srv.duration_minutes} min
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white">{srv.name}</h3>
                <p className="mt-2 text-sm text-slate-400 line-clamp-2">{srv.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 truncate">With {srv.professional_name}</p>
                  <p className="text-lg font-bold text-white font-mono tabular-nums mt-0.5">
                    ${Number(srv.price).toFixed(0)}
                  </p>
                </div>
                <Link
                  to={`/book?professionalId=${srv.professional_id}&serviceId=${srv.id}`}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  Schedule Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-2xl mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">How SmartCred Works</h2>
          <p className="text-sm text-slate-400 mt-2">
            From discovery to verified reception check-in in four deterministic steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              step: '01. Select Specialist & Service',
              desc: 'Filter verified professionals by domain, compare consultation durations and fees, and inspect real client reviews.',
            },
            {
              step: '02. Pick Real-Time Slot',
              desc: 'Our booking engine queries working hours, break windows, and blocked dates in SQLite to show conflict-free times.',
            },
            {
              step: '03. Receive Encrypted QR Pass',
              desc: 'Upon confirmation, receive multi-channel notifications and download a zero-PII QR verification pass.',
            },
            {
              step: '04. Scan & Check In',
              desc: 'At the appointment, the professional scans your QR pass inside their dashboard to verify ownership and check you in.',
            },
          ].map((item) => (
            <div key={item.step} className="glass-panel rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white">{item.step}</h3>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Key Platform Features (Asymmetric Bento Grid) */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-2xl mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Engineered for Multi-Role Practice Operations
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Every workflow connects directly to persistent relational tables with role-based JWT
            access control.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-8 flex flex-col justify-between">
            <div>
              <ShieldCheck className="w-7 h-7 text-indigo-400 mb-4" />
              <h3 className="text-xl font-semibold text-white">
                Transactional Conflict Prevention & Slot Governance
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-2xl">
                SmartCred executes bookings inside immediate SQLite transactions. Custom service
                durations, daily break intervals, blocked dates, and concurrent client bookings are
                validated server-side so two clients can never claim overlapping slots.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
              <span>Atomic SQLite WAL Mode</span>
              <span aria-hidden="true">·</span>
              <span>Instant Cancellation Slot Release</span>
              <span aria-hidden="true">·</span>
              <span>Automated Status Audit Trail</span>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-8 flex flex-col justify-between">
            <div>
              <QrCode className="w-7 h-7 text-blue-400 mb-4" />
              <h3 className="text-xl font-semibold text-white">Zero-PII QR Verification</h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Appointment QR codes carry only an HMAC-derived token. Only SHA-256 token hashes are
                stored in SQLite, preventing duplicate check-ins and protecting client privacy.
              </p>
            </div>
            <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-400">
              Camera & Image File QR Scanner Built In
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-8">
            <h3 className="text-lg font-semibold text-white">Multi-Channel Dispatch</h3>
            <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">
              Configurable Nodemailer SMTP, Twilio SMS, and WhatsApp Business Cloud API dispatchers
              log every delivery status transparently in SQLite.
            </p>
          </div>

          <div className="lg:col-span-2 glass-panel rounded-2xl p-8">
            <h3 className="text-lg font-semibold text-white">
              Dedicated Client, Professional & Administrator Portals
            </h3>
            <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">
              HttpOnly refresh-token rotation, signed CSRF headers, and bcrypt password security
              isolate client bookings, specialist schedules, and platform-wide CSV analytics
              reporting.
            </p>
          </div>
        </div>
      </section>

      {/* Verified Client Testimonials */}
      {reviews.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.06]">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Verified Client Outcomes
            </h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Submitted exclusively by clients with completed or QR-verified appointments
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((rev) => (
              <div key={rev.id} className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 text-amber-400 mb-3">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">“{rev.comment}”</p>
                </div>
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">{rev.client_name}</span>
                  <span>
                    Booked {rev.professional_name} · {rev.professional_specialty}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Frequently Asked Questions</h2>
          <p className="text-sm text-slate-400 mt-2">
            Clear answers on scheduling, security, and verification workflows.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={item.q} className="glass-panel rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left text-sm sm:text-base font-medium text-white hover:bg-white/[0.02] transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-slate-300 leading-relaxed border-t border-white/[0.06] pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
