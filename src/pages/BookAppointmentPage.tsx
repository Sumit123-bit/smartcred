import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Lock,
  Printer,
  Search,
  Share2,
  Star,
} from 'lucide-react';
import { api, extractApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ProfessionalSummary, ServiceCategory, ServiceItem } from '../lib/types';
import { AvatarImage } from '../components/AvatarImage';
import { StatusIndicator } from '../components/StatusIndicator';

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface ConfirmedBookingResponse {
  id: number;
  bookingCode: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: string;
  serviceName: string;
  professionalName: string;
  qrDataUrl: string;
  qrVerificationToken: string;
}

interface DeliveryInfo {
  channel: string;
  status: string;
  detail: string;
}

function formatDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function getTodayIso(): string {
  return formatDateIso(new Date());
}

function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateIso(d);
}

function getUpcomingDays(count = 7): Array<{ iso: string; dayLabel: string; numLabel: string }> {
  const days: Array<{ iso: string; dayLabel: string; numLabel: string }> = [];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      iso: formatDateIso(d),
      dayLabel: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayNames[d.getDay()],
      numLabel: `${monthNames[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return days;
}

export const BookAppointmentPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const preselectedProfId = Number(searchParams.get('professionalId')) || null;
  const preselectedServiceId = Number(searchParams.get('serviceId')) || null;

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [proSearch, setProSearch] = useState<string>('');
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<number | null>(preselectedProfId);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(preselectedServiceId);
  const [selectedDate, setSelectedDate] = useState<string>(getTomorrowIso());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [blockedReason, setBlockedReason] = useState<string>('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<ConfirmedBookingResponse | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryInfo[]>([]);
  const [copiedToken, setCopiedToken] = useState(false);
  const [shareStatus, setShareStatus] = useState('');

  const quickDates = useMemo(() => getUpcomingDays(7), []);

  // Load categories and approved professionals
  useEffect(() => {
    Promise.all([
      api.get<{ categories: ServiceCategory[] }>('/public/categories'),
      api.get<{ professionals: ProfessionalSummary[] }>('/public/professionals'),
    ])
      .then(([catRes, proRes]) => {
        setCategories(catRes.data.categories || []);
        const pros = proRes.data.professionals || [];
        setProfessionals(pros);
        if (!selectedProfId && pros.length > 0) {
          setSelectedProfId(pros[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Filter specialists by category & search
  const visibleProfessionals = useMemo(() => {
    return professionals.filter((p) => {
      const catMatch =
        selectedCategory === 'all' ||
        String(p.category_id) === selectedCategory ||
        p.category_slug === selectedCategory;
      const q = proSearch.trim().toLowerCase();
      const searchMatch =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.specialty.toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [professionals, selectedCategory, proSearch]);

  // Load services when professional changes
  useEffect(() => {
    if (!selectedProfId) {
      setServices([]);
      return;
    }
    api
      .get<{ services: ServiceItem[] }>(`/public/professionals/${selectedProfId}`)
      .then((res) => {
        const list = res.data.services || [];
        setServices(list);
        if (list.length > 0) {
          const exists = list.some((s) => s.id === selectedServiceId);
          if (!exists) {
            setSelectedServiceId(list[0].id);
          }
        } else {
          setSelectedServiceId(null);
        }
      })
      .catch(() => setServices([]));
  }, [selectedProfId]);

  // Load real-time slots from SQLite when professional, service, or date changes
  useEffect(() => {
    if (!selectedProfId || !selectedServiceId || !selectedDate) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    setSelectedTime('');
    setBlockedReason('');

    api
      .get<{ slots: TimeSlot[]; blockedReason?: string }>(
        `/appointments/slots?professionalId=${selectedProfId}&serviceId=${selectedServiceId}&date=${selectedDate}`
      )
      .then((res) => {
        setSlots(res.data.slots || []);
        setBlockedReason(res.data.blockedReason || '');
      })
      .catch((err) => {
        setSlots([]);
        setBlockedReason(extractApiError(err, 'Unable to load slots.'));
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedProfId, selectedServiceId, selectedDate]);

  const currentProf = professionals.find((p) => p.id === selectedProfId) || null;
  const currentService = services.find((s) => s.id === selectedServiceId) || null;
  const currentSlot = slots.find((s) => s.startTime === selectedTime) || null;

  const activeStepNumber = confirmed
    ? 7
    : selectedTime
    ? 6
    : selectedDate && currentService
    ? 4
    : currentService
    ? 3
    : selectedProfId
    ? 2
    : 1;

  const handleConfirmBooking = async () => {
    if (!user) {
      const returnUrl = `/book?professionalId=${selectedProfId || ''}&serviceId=${selectedServiceId || ''}`;
      navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

    if (!selectedProfId || !selectedServiceId || !selectedDate || !selectedTime) {
      setError('Please select a specialist, service, date, and available time slot.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await api.post<{
        booking: ConfirmedBookingResponse;
        notifications: DeliveryInfo[];
      }>('/appointments', {
        professionalId: selectedProfId,
        serviceId: selectedServiceId,
        appointmentDate: selectedDate,
        startTime: selectedTime,
        notes,
      });

      setConfirmed(res.data.booking);
      setDeliveries(res.data.notifications || []);
    } catch (err) {
      setError(extractApiError(err, 'Failed to confirm appointment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadQr = () => {
    if (!confirmed) return;
    const a = document.createElement('a');
    a.href = confirmed.qrDataUrl;
    a.download = `${confirmed.bookingCode}-smartcred-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyToken = async () => {
    if (!confirmed) return;
    try {
      await navigator.clipboard.writeText(confirmed.qrVerificationToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleShareConfirmedPass = async () => {
    if (!confirmed) return;
    const summary = `SmartCred Appointment (${confirmed.bookingCode}) — ${confirmed.serviceName} with ${confirmed.professionalName} on ${confirmed.appointmentDate} at ${confirmed.startTime}. Token: ${confirmed.qrVerificationToken}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `SmartCred Pass — ${confirmed.bookingCode}`,
          text: summary,
        });
        setShareStatus('Pass shared.');
      } else {
        await navigator.clipboard.writeText(summary);
        setShareStatus('Booking & token copied to clipboard.');
      }
      setTimeout(() => setShareStatus(''), 2500);
    } catch {
      // Dismissed
    }
  };

  if (confirmed) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="glass-panel rounded-2xl p-6 sm:p-10 space-y-8">
          <div className="flex items-start gap-4 pb-6 border-b border-white/10">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-mono text-emerald-400 mb-1">Step 07 of 07 · Confirmed</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                Appointment Recorded in SQLite
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Booking Reference{' '}
                <span className="font-mono font-semibold text-white">{confirmed.bookingCode}</span>{' '}
                has been reserved and your encrypted QR pass is ready.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="p-3 bg-white rounded-xl">
                <img
                  src={confirmed.qrDataUrl}
                  alt={`QR Pass for ${confirmed.bookingCode}`}
                  referrerPolicy="no-referrer"
                  className="w-48 h-48 object-contain"
                />
              </div>
              <p className="mt-2.5 text-xs text-slate-400 text-center">
                Zero-PII cryptographic check-in token
              </p>
              {shareStatus && (
                <p className="mt-1.5 text-xs text-emerald-300 text-center">{shareStatus}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 w-full no-print">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PNG</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareConfirmedPass}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-medium whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-medium whitespace-nowrap"
                >
                  {copiedToken ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedToken ? 'Copied' : 'Token'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-medium whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-7 space-y-3 text-sm">
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <span className="text-slate-400">Booking ID</span>
                <span className="font-mono font-semibold text-white">{confirmed.bookingCode}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <span className="text-slate-400">Status</span>
                <StatusIndicator status={confirmed.status} />
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <span className="text-slate-400">Specialist</span>
                <span className="text-white font-medium text-right">
                  {confirmed.professionalName}
                </span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <span className="text-slate-400">Service</span>
                <span className="text-slate-200 text-right">{confirmed.serviceName}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <span className="text-slate-400">Date & Time</span>
                <span className="font-mono tabular-nums text-white">
                  {confirmed.appointmentDate} · {confirmed.startTime}–{confirmed.endTime}
                </span>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <span className="text-slate-400">Consultation Fee</span>
                <span className="font-mono tabular-nums font-bold text-white">
                  ${Number(confirmed.totalAmount).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Notification Dispatch Transparency */}
          {deliveries.length > 0 && (
            <div className="pt-6 border-t border-white/10 no-print">
              <h3 className="text-xs font-semibold text-slate-300 mb-3">
                Notification Dispatch Log (Saved in SQLite)
              </h3>
              <div className="space-y-2">
                {deliveries.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-2 px-3 rounded-lg bg-slate-900/70 border border-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-slate-200">{d.channel}</span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-400">{d.detail}</span>
                    </div>
                    <StatusIndicator status={d.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 flex flex-wrap gap-3 no-print">
            <Link
              to="/dashboard/user"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold"
            >
              Open My Appointments Dashboard
            </Link>
            <button
              type="button"
              onClick={() => {
                setConfirmed(null);
                setSelectedTime('');
                setNotes('');
              }}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-sm font-medium"
            >
              Book Another Slot
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-indigo-400 tracking-wide mb-2">
            7-Step Real-Time SQLite Booking Engine
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Schedule an Appointment</h1>
          <p className="mt-2 text-sm text-slate-400">
            Filter by category, choose an approved specialist and consultation service, pick a date
            and conflict-free slot, and receive your instant cryptographic QR pass.
          </p>
        </div>

        {/* Clean 7-Step Progress Indicator */}
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 overflow-x-auto pb-1">
          {[
            { n: 1, label: 'Specialist' },
            { n: 2, label: 'Service' },
            { n: 3, label: 'Date' },
            { n: 4, label: 'Slot' },
            { n: 5, label: 'Notes' },
            { n: 6, label: 'Review' },
            { n: 7, label: 'QR Pass' },
          ].map((s, idx) => (
            <React.Fragment key={s.n}>
              <span
                className={`whitespace-nowrap ${
                  activeStepNumber >= s.n ? 'text-indigo-300 font-semibold' : 'text-slate-500'
                }`}
              >
                0{s.n} {s.label}
              </span>
              {idx < 6 && <span className="text-slate-700">/</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Category Filter + Select Specialist */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white">
                01. Choose Category & Approved Specialist
              </h2>
              <div className="relative sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={proSearch}
                  onChange={(e) => setProSearch(e.target.value)}
                  placeholder="Search name or specialty..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/80 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(String(cat.id))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      selectedCategory === String(cat.id)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900/80 text-slate-300 hover:text-white border border-white/10'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {visibleProfessionals.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                No approved specialists match this filter. Try selecting All Categories.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {visibleProfessionals.map((pro) => {
                  const active = pro.id === selectedProfId;
                  return (
                    <button
                      key={pro.id}
                      type="button"
                      onClick={() => setSelectedProfId(pro.id)}
                      className={`p-4 rounded-xl border text-left flex items-center gap-3.5 transition-colors ${
                        active
                          ? 'bg-indigo-600/15 border-indigo-500'
                          : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <AvatarImage
                        src={pro.avatar_url}
                        name={pro.full_name}
                        sizeClass="w-12 h-12"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{pro.full_name}</p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{pro.specialty}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span className="text-slate-200">
                            {Number(pro.rating_avg).toFixed(1)}
                          </span>
                          <span>·</span>
                          <span>${pro.consultation_fee}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Select Service */}
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-4">
              02. Select Consultation Service
            </h2>
            {services.length === 0 ? (
              <p className="text-sm text-slate-400">
                Select a professional above to view bookable consultation services.
              </p>
            ) : (
              <div className="space-y-3">
                {services.map((srv) => {
                  const active = srv.id === selectedServiceId;
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => setSelectedServiceId(srv.id)}
                      className={`w-full p-4 rounded-xl border text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        active
                          ? 'bg-indigo-600/15 border-indigo-500'
                          : 'bg-slate-900/60 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{srv.name}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {srv.description}
                        </p>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 font-mono tabular-nums">
                        <span className="text-base font-bold text-white">
                          ${Number(srv.price).toFixed(0)}
                        </span>
                        <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {srv.duration_minutes}m
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Steps 3 & 4: Date Strip + Live SQLite Time Slots */}
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  03 & 04. Select Date & Available SQLite Time Slot
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Computed dynamically from working hours, breaks, blocked dates, and active bookings
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <input
                  type="date"
                  min={getTodayIso()}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/15 text-sm text-white font-mono tabular-nums focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Quick 7-Day Date Strip */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {quickDates.map((d) => {
                const active = selectedDate === d.iso;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => setSelectedDate(d.iso)}
                    className={`py-2 px-2 rounded-xl border text-center transition-colors ${
                      active
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <p className="text-[11px] text-slate-400">{d.dayLabel}</p>
                    <p className="text-xs font-mono font-semibold mt-0.5">{d.numLabel}</p>
                  </button>
                );
              })}
            </div>

            {slotsLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Querying SQLite slot availability...
              </div>
            ) : blockedReason ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                {blockedReason}
              </div>
            ) : slots.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/70 border border-white/10 text-xs text-slate-400">
                No remaining slots available for this date. Please select another day.
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-3">
                  Select an open start time (greyed-out times are already reserved):
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  {slots.map((slot) => {
                    const isSelected = selectedTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.startTime)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-mono tabular-nums font-medium border transition-colors ${
                          !slot.available
                            ? 'bg-slate-950/60 border-white/5 text-slate-600 line-through cursor-not-allowed'
                            : isSelected
                            ? 'bg-indigo-600 border-indigo-400 text-white'
                            : 'bg-slate-900/80 border-white/10 text-slate-200 hover:border-indigo-500/60'
                        }`}
                      >
                        {slot.startTime}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 5: Optional Notes */}
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-2">
              05. Consultation Notes & Preferences (Optional)
            </h2>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Share context, objectives, or questions for your specialist..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Step 6: Review & Confirm Sticky Summary */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <div className="glass-panel rounded-2xl p-6 space-y-5">
            <div>
              <p className="text-xs font-mono text-indigo-400 mb-1">Step 06 of 07</p>
              <h2 className="text-lg font-bold text-white">Review Booking Summary</h2>
            </div>

            <div className="space-y-3 text-sm border-t border-white/10 pt-4">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Professional</span>
                <span className="text-white font-medium text-right">
                  {currentProf?.full_name || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Location</span>
                <span className="text-slate-300 text-right text-xs">
                  {currentProf?.location || 'Main Practice Suite'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Service</span>
                <span className="text-slate-200 text-right">{currentService?.name || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Duration</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {currentService ? `${currentService.duration_minutes} min` : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Date</span>
                <span className="font-mono tabular-nums text-slate-200">{selectedDate || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Time Window</span>
                <span className="font-mono tabular-nums text-white font-medium">
                  {currentSlot ? `${currentSlot.startTime} – ${currentSlot.endTime}` : 'Select slot'}
                </span>
              </div>
              <div className="flex justify-between gap-4 pt-3 border-t border-white/10">
                <span className="text-slate-300 font-medium">Total Consultation Fee</span>
                <span className="text-xl font-bold text-white font-mono tabular-nums">
                  ${currentService ? Number(currentService.price).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            {!user ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Sign in as a Client to confirm and generate your QR pass.</span>
                </p>
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  Sign In to Confirm Booking
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={submitting || !selectedTime}
                onClick={handleConfirmBooking}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
              >
                {submitting ? 'Confirming in SQLite...' : 'Confirm & Issue QR Pass'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
