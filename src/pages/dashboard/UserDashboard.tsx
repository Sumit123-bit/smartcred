import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  Calendar,
  CalendarPlus,
  Compass,
  History,
  LayoutDashboard,
  Palette,
  QrCode,
  RefreshCw,
  Search,
  Star,
  Upload,
  User,
  X,
} from 'lucide-react';
import { DashboardShell } from '../../components/DashboardShell';
import { api, extractApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useGlassTheme, type GlassThemeId } from '../../context/ThemeContext';
import type {
  AppointmentRecord,
  NotificationRecord,
  ProfessionalApplicationRecord,
  ProfessionalSummary,
  ServiceCategory,
} from '../../lib/types';
import { StatusIndicator } from '../../components/StatusIndicator';
import { QrPassModal } from '../../components/QrPassModal';
import { AvatarImage } from '../../components/AvatarImage';

interface HistoryItem {
  id: number;
  old_status: string | null;
  new_status: string;
  note: string;
  created_at: string;
  changed_by_name: string | null;
}

interface ActivityRecord {
  id: number;
  action: string;
  entity_type: string;
  details: string;
  created_at: string;
}

const GLASS_THEME_OPTIONS: Array<{
  id: GlassThemeId;
  label: string;
  description: string;
  swatchClass: string;
}> = [
  {
    id: 'navy',
    label: 'Deep Navy Glass',
    description: 'Signature SmartCred dark navy canvas with indigo-blue accents.',
    swatchClass: 'from-slate-950 via-indigo-950 to-blue-900',
  },
  {
    id: 'violet',
    label: 'Midnight Violet Glass',
    description: 'Deep amethyst-indigo frosted glass surfaces with crisp contrast.',
    swatchClass: 'from-[#09071a] via-purple-950 to-indigo-900',
  },
  {
    id: 'slate',
    label: 'Obsidian Slate Glass',
    description: 'Neutral charcoal-slate executive workspace with subtle glass borders.',
    swatchClass: 'from-slate-950 via-slate-900 to-slate-800',
  },
];

export const UserDashboard: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { theme, setTheme } = useGlassTheme();
  const [activeTab, setActiveTab] = useState('overview');

  // Overview & Bookings
  const [stats, setStats] = useState({
    totalBookings: 0,
    upcomingCount: 0,
    confirmedCount: 0,
    completedCount: 0,
    totalSpent: 0,
    unreadNotifications: 0,
  });
  const [upcoming, setUpcoming] = useState<AppointmentRecord[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  // Browse directory inside dashboard
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [dirSearch, setDirSearch] = useState('');

  // Notifications & Preferences
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [prefs, setPrefs] = useState({
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: false,
    remindersEnabled: true,
  });

  // Profile & Password
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Modals & Banners
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [qrModalApptId, setQrModalApptId] = useState<number | null>(null);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<AppointmentRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<
    Array<{ startTime: string; endTime: string; available: boolean }>
  >([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<AppointmentRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Status history modal
  const [historyModalAppt, setHistoryModalAppt] = useState<AppointmentRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryItem[]>([]);

  // Professional access request state
  const [myApplication, setMyApplication] = useState<ProfessionalApplicationRecord | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [appForm, setAppForm] = useState({
    title: '',
    specialty: '',
    categoryId: '' as number | '',
    experienceYears: 5,
    location: '',
    consultationFee: 150,
    bio: '',
  });
  const [submittingApp, setSubmittingApp] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [dashRes, apptRes, notifRes, prefRes, proRes, appRes, catRes] = await Promise.all([
        api.get('/users/dashboard'),
        api.get<{ appointments: AppointmentRecord[] }>(
          `/appointments/my?status=${encodeURIComponent(statusFilter)}`
        ),
        api.get<{ notifications: NotificationRecord[] }>('/users/notifications'),
        api.get('/users/preferences'),
        api.get<{ professionals: ProfessionalSummary[] }>('/public/professionals'),
        api.get<{ application: ProfessionalApplicationRecord | null }>(
          '/users/professional-application'
        ),
        api.get<{ categories: ServiceCategory[] }>('/public/categories'),
      ]);
      setStats(dashRes.data.stats);
      setUpcoming(dashRes.data.upcomingAppointments || []);
      setRecentActivities(dashRes.data.recentActivities || []);
      setAppointments(apptRes.data.appointments || []);
      setNotifications(notifRes.data.notifications || []);
      setPrefs(prefRes.data.preferences);
      setProfessionals(proRes.data.professionals || []);
      setMyApplication(appRes.data.application || null);
      const cats = catRes.data.categories || [];
      setCategories(cats);
      if (cats.length > 0) {
        setAppForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || cats[0].id,
        }));
      }
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to load dashboard data.') });
    } finally {
      setLoadingData(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone || '');
    }
  }, [user]);

  // Load slots when rescheduling date changes
  useEffect(() => {
    if (
      !rescheduleTarget ||
      !rescheduleDate ||
      !rescheduleTarget.professional_id ||
      !rescheduleTarget.service_id
    ) {
      return;
    }
    setSlotsLoading(true);
    setRescheduleTime('');
    api
      .get(
        `/appointments/slots?professionalId=${rescheduleTarget.professional_id}&serviceId=${rescheduleTarget.service_id}&date=${rescheduleDate}&excludeAppointmentId=${rescheduleTarget.id}`
      )
      .then((res) => setRescheduleSlots(res.data.slots || []))
      .catch(() => setRescheduleSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [rescheduleTarget, rescheduleDate]);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    try {
      await api.post(`/appointments/${cancelTarget.id}/cancel`, {
        reason: cancelReason || 'Cancelled from client dashboard',
      });
      setBanner({
        type: 'success',
        text: `Booking ${cancelTarget.booking_code} cancelled and slot released.`,
      });
      setCancelTarget(null);
      setCancelReason('');
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    try {
      await api.post(`/appointments/${rescheduleTarget.id}/reschedule`, {
        newDate: rescheduleDate,
        newStartTime: rescheduleTime,
      });
      setBanner({
        type: 'success',
        text: `Booking ${rescheduleTarget.booking_code} rescheduled to ${rescheduleDate} at ${rescheduleTime}.`,
      });
      setRescheduleTarget(null);
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    try {
      await api.post('/users/reviews', {
        appointmentId: reviewTarget.id,
        rating: reviewRating,
        comment: reviewComment,
      });
      setBanner({ type: 'success', text: 'Verified review saved to SQLite.' });
      setReviewTarget(null);
      setReviewComment('');
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const openHistoryModal = async (appt: AppointmentRecord) => {
    setHistoryModalAppt(appt);
    setHistoryRows([]);
    try {
      const res = await api.get<{ history: HistoryItem[] }>(`/appointments/${appt.id}/history`);
      setHistoryRows(res.data.history || []);
    } catch {
      setHistoryRows([]);
    }
  };

  const handleMarkAllRead = async () => {
    await api.post('/users/notifications/read-all', {});
    loadAll();
  };

  const handleSavePrefs = async () => {
    try {
      await api.put('/users/preferences', prefs);
      setBanner({ type: 'success', text: 'Notification preferences saved.' });
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/users/profile', { fullName, phone });
      await refreshProfile();
      setBanner({ type: 'success', text: 'Profile updated in SQLite.' });
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      await api.post('/users/profile/avatar', formData);
      await refreshProfile();
      setBanner({ type: 'success', text: 'Profile photo uploaded and saved.' });
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Avatar upload failed.') });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setBanner({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSubmitProfessionalApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApp(true);
    try {
      const res = await api.post<{
        message: string;
        applicationId: number;
        application: ProfessionalApplicationRecord;
      }>('/users/professional-application', {
        title: appForm.title.trim(),
        specialty: appForm.specialty.trim(),
        categoryId: appForm.categoryId ? Number(appForm.categoryId) : categories[0]?.id,
        experienceYears: Number.isFinite(Number(appForm.experienceYears))
          ? Number(appForm.experienceYears)
          : 3,
        location: appForm.location.trim() || 'Main Practice Suite',
        consultationFee: Number.isFinite(Number(appForm.consultationFee))
          ? Number(appForm.consultationFee)
          : 120,
        bio: appForm.bio.trim(),
      });
      setMyApplication(res.data.application);
      await refreshProfile();
      setBanner({
        type: 'success',
        text: `Request #${res.data.applicationId} submitted! Status is now PENDING administrator review.`,
      });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to submit application.') });
    } finally {
      setSubmittingApp(false);
    }
  };

  const filteredAppointments = appointments.filter((a) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      a.booking_code.toLowerCase().includes(q) ||
      (a.professional_name || '').toLowerCase().includes(q) ||
      a.service_name.toLowerCase().includes(q)
    );
  });

  const filteredPros = professionals.filter((p) => {
    if (!dirSearch.trim()) return true;
    const q = dirSearch.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.specialty.toLowerCase().includes(q) ||
      (p.category_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <DashboardShell
      portalLabel="Client Portal"
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      navItems={[
        { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
        {
          id: 'appointments',
          label: 'My Appointments',
          icon: <Calendar className="w-4 h-4" />,
          badgeCount: stats.upcomingCount,
        },
        { id: 'browse', label: 'Browse Specialists', icon: <Compass className="w-4 h-4" /> },
        {
          id: 'application',
          label: 'Specialist Access',
          icon: <Briefcase className="w-4 h-4" />,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: <Bell className="w-4 h-4" />,
          badgeCount: stats.unreadNotifications,
        },
        { id: 'profile', label: 'Profile & Security', icon: <User className="w-4 h-4" /> },
      ]}
      primaryAction={
        <Link
          to="/book"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          <span>Book Appointment</span>
        </Link>
      }
    >
      {banner && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between gap-4 text-sm ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-xs opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Upcoming Bookings</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.upcomingCount}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Confirmed Passes</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.confirmedCount}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Completed Sessions</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.completedCount}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Total Consultation Spend</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                ${Number(stats.totalSpent).toFixed(0)}
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Upcoming Appointments</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download your QR pass for instant arrival check-in
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('appointments')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
              >
                View Full History
              </button>
            </div>

            {loadingData ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading appointments...</p>
            ) : upcoming.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-300">No upcoming appointments scheduled.</p>
                <Link
                  to="/book"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                >
                  Schedule Your Next Session
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {upcoming.map((appt) => (
                  <div
                    key={appt.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <AvatarImage
                        src={appt.professional_avatar}
                        name={appt.professional_name || 'Specialist'}
                        sizeClass="w-12 h-12"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                          <span>{appt.booking_code}</span>
                          <span aria-hidden="true">·</span>
                          <StatusIndicator status={appt.status} />
                        </div>
                        <p className="text-base font-semibold text-white truncate mt-0.5">
                          {appt.service_name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {appt.professional_name} · {appt.appointment_date} at {appt.start_time}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!['Cancelled', 'Rejected'].includes(appt.status) && (
                        <button
                          type="button"
                          onClick={() => setQrModalApptId(appt.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium whitespace-nowrap"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QR Pass</span>
                        </button>
                      )}
                      {['Pending', 'Confirmed'].includes(appt.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget(appt);
                            setRescheduleDate(appt.appointment_date);
                          }}
                          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-medium whitespace-nowrap"
                        >
                          Reschedule
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Recent Account Activity</h2>
                <p className="text-xs text-slate-400">
                  Live audit trail of your bookings, reschedules, QR passes, and profile updates
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap"
              >
                Notification Center
              </button>
            </div>

            {recentActivities.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Your recent booking actions and status updates will appear here automatically.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentActivities.map((act) => (
                  <div
                    key={act.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-indigo-300">
                          {act.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          · {act.entity_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 truncate">
                        {act.details || 'Recorded in SmartCred SQLite ledger'}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                      {act.created_at}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MY APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search booking code, specialist, or service..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 overflow-x-auto">
              {['all', 'Pending', 'Confirmed', 'Checked In', 'Completed', 'Cancelled'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'All' : st}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            {filteredAppointments.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No appointments match the selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3.5 px-5 font-medium">Booking</th>
                      <th className="py-3.5 px-5 font-medium">Specialist & Service</th>
                      <th className="py-3.5 px-5 font-medium">Date & Time</th>
                      <th className="py-3.5 px-5 font-medium text-right">Fee</th>
                      <th className="py-3.5 px-5 font-medium">Status</th>
                      <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredAppointments.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 px-5 font-mono text-xs text-slate-200 whitespace-nowrap">
                          {a.booking_code}
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-medium text-white">{a.professional_name}</p>
                          <p className="text-xs text-slate-400">{a.service_name}</p>
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-200 whitespace-nowrap">
                          {a.appointment_date}
                          <span className="block text-slate-400">
                            {a.start_time} – {a.end_time}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-right text-white whitespace-nowrap">
                          ${Number(a.total_amount).toFixed(0)}
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          <StatusIndicator status={a.status} />
                        </td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {!['Cancelled', 'Rejected'].includes(a.status) && (
                              <button
                                type="button"
                                onClick={() => setQrModalApptId(a.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 text-xs font-medium"
                              >
                                QR Pass
                              </button>
                            )}
                            {['Pending', 'Confirmed'].includes(a.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRescheduleTarget(a);
                                    setRescheduleDate(a.appointment_date);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCancelTarget(a)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {['Completed', 'Checked In'].includes(a.status) && !a.review_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewTarget(a);
                                  setReviewRating(5);
                                  setReviewComment('');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium"
                              >
                                Review
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openHistoryModal(a)}
                              title="Audit History"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BROWSE SPECIALISTS */}
      {activeTab === 'browse' && (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Search specialists by name, specialty, or domain..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPros.map((pro) => (
              <div key={pro.id} className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3.5">
                    <AvatarImage src={pro.avatar_url} name={pro.full_name} sizeClass="w-12 h-12" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{pro.full_name}</h3>
                      <p className="text-xs text-indigo-300 truncate">{pro.specialty}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-400 line-clamp-2">{pro.bio}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-sm font-bold text-white font-mono tabular-nums">
                    ${Number(pro.consultation_fee).toFixed(0)}
                  </span>
                  <div className="flex gap-2">
                    <Link
                      to={`/professionals/${pro.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200"
                    >
                      Profile
                    </Link>
                    <Link
                      to={`/book?professionalId=${pro.id}`}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-xs text-white font-medium"
                    >
                      Book
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3B: SPECIALIST ACCESS REQUEST */}
      {activeTab === 'application' && (
        <div className="max-w-3xl space-y-6">
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">Apply for Specialist Access</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Submit your professional credentials to list consultation services on SmartCred. Your
              verified account identity is attached automatically and sent to Admin Governance for
              approval.
            </p>

            {myApplication && (
              <div className="mt-4 p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <span>Request #{myApplication.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>Submitted {myApplication.created_at}</span>
                  </div>
                  <StatusIndicator status={myApplication.status} />
                </div>
                <p className="text-sm font-semibold text-white">
                  {myApplication.title} — {myApplication.specialty}
                </p>
                {myApplication.status === 'PENDING' && (
                  <p className="text-xs text-amber-300/90">
                    Your application is currently in the Admin Governance queue awaiting review.
                  </p>
                )}
                {myApplication.status === 'APPROVED' && (
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-emerald-300">
                      Approved! Your account now has full Specialist Dashboard privileges.
                    </p>
                    <Link
                      to="/dashboard/professional"
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                    >
                      Open Specialist Dashboard
                    </Link>
                  </div>
                )}
                {myApplication.status === 'REJECTED' && (
                  <div className="text-xs text-rose-300 space-y-1">
                    <p>
                      Decision Note:{' '}
                      {myApplication.rejection_reason || 'Requirements not met at this time.'}
                    </p>
                    <p className="text-slate-400">
                      You may update your credentials below and submit a revised application.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {(!myApplication || myApplication.status === 'REJECTED') && (
            <form
              onSubmit={handleSubmitProfessionalApplication}
              className="glass-panel rounded-2xl p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-white">
                {myApplication?.status === 'REJECTED'
                  ? 'Submit Revised Specialist Application'
                  : 'Specialist Credentials Form'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Professional Title *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={appForm.title}
                    onChange={(e) => setAppForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Senior Corporate Counsel"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Primary Specialty *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={appForm.specialty}
                    onChange={(e) => setAppForm((p) => ({ ...p, specialty: e.target.value }))}
                    placeholder="e.g. Regulatory & Tax Structuring"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Practice Category
                  </label>
                  <select
                    value={appForm.categoryId}
                    onChange={(e) =>
                      setAppForm((p) => ({
                        ...p,
                        categoryId: e.target.value ? Number(e.target.value) : '',
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Experience (Years)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={appForm.experienceYears}
                    onChange={(e) =>
                      setAppForm((p) => ({ ...p, experienceYears: Number(e.target.value) }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Base Fee (USD)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50000}
                    value={appForm.consultationFee}
                    onChange={(e) =>
                      setAppForm((p) => ({ ...p, consultationFee: Number(e.target.value) }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono tabular-nums text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Practice Suite / Location
                </label>
                <input
                  type="text"
                  value={appForm.location}
                  onChange={(e) => setAppForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Suite 305, Bandra Kurla Complex, Mumbai"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Qualifications & Practice Bio
                </label>
                <textarea
                  rows={3}
                  value={appForm.bio}
                  onChange={(e) => setAppForm((p) => ({ ...p, bio: e.target.value }))}
                  placeholder="Outline your board certifications, experience, and consultation scope..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={submittingApp}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
              >
                {submittingApp ? 'Submitting Request...' : 'Submit Professional Access Request'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS & PREFERENCES */}
      {activeTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Notification Log</h2>
                <p className="text-xs text-slate-400">
                  Real-time SQLite delivery statuses across In-App, Email, SMS, and WhatsApp
                </p>
              </div>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium whitespace-nowrap"
              >
                Mark All Read
              </button>
            </div>

            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No notifications recorded.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`py-4 first:pt-0 last:pb-0 ${n.is_read ? 'opacity-75' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-1">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-indigo-300">{n.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{n.created_at}</span>
                      </div>
                      <StatusIndicator status={n.delivery_status} />
                    </div>
                    <p className="text-sm font-semibold text-white">{n.subject}</p>
                    <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                    {n.provider_detail && (
                      <p className="text-[11px] text-slate-500 mt-1">{n.provider_detail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 glass-panel rounded-2xl p-6 h-fit space-y-5">
            <div>
              <h2 className="text-base font-bold text-white">Channel Preferences</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure how SmartCred dispatches booking updates
              </p>
            </div>

            <div className="space-y-3 text-sm">
              {[
                { key: 'emailEnabled', label: 'Email (Nodemailer SMTP)' },
                { key: 'smsEnabled', label: 'SMS Alerts (Twilio)' },
                { key: 'whatsappEnabled', label: 'WhatsApp Business Cloud API' },
                { key: 'remindersEnabled', label: 'Upcoming Appointment Reminders' },
              ].map((item) => {
                const k = item.key as keyof typeof prefs;
                return (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.06] cursor-pointer"
                  >
                    <span className="text-slate-200 text-xs">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={prefs[k]}
                      onChange={(e) => setPrefs((p) => ({ ...p, [k]: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-600 rounded"
                    />
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleSavePrefs}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: PROFILE & SECURITY */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white">Client Profile</h2>

            <div className="flex items-center gap-4">
              <AvatarImage
                src={user?.avatarUrl}
                name={user?.fullName || 'Client'}
                sizeClass="w-16 h-16"
              />
              <div>
                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-1">JPEG, PNG, or WebP up to 5MB</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email (Account Identifier)
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-white/5 text-sm text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919820022002"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Save Profile Changes
              </button>
            </form>
          </div>

          <div className="space-y-8">
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <Palette className="w-4 h-4 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Glassmorphism Surface Theme</h2>
              </div>
              <p className="text-xs text-slate-400">
                Choose your preferred frosted-glass workspace ambiance across the SmartCred web platform.
              </p>
              <div className="space-y-2.5">
                {GLASS_THEME_OPTIONS.map((opt) => {
                  const selected = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTheme(opt.id)}
                      className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'bg-indigo-600/15 border-indigo-500/50'
                          : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-lg bg-gradient-to-br ${opt.swatchClass} border border-white/15 shrink-0`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{opt.label}</span>
                          {selected && (
                            <span className="text-[11px] font-mono text-indigo-300 whitespace-nowrap">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 h-fit space-y-5">
              <h2 className="text-lg font-bold text-white">Change Password</h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    New Password (min 6 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white text-xs font-semibold"
                >
                  Update Password
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* QR Pass Modal */}
      <QrPassModal appointmentId={qrModalApptId} onClose={() => setQrModalApptId(null)} />

      {/* Cancel Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Cancel Appointment</h3>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Cancelling <span className="font-mono text-white">{cancelTarget.booking_code}</span>{' '}
              will immediately release the time slot back to the specialist&apos;s calendar.
            </p>
            <form onSubmit={handleConfirmCancel} className="space-y-4">
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
              <div className="flex gap-2.5">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                >
                  Confirm Cancellation
                </button>
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Keep Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Reschedule Appointment</h3>
                <p className="text-xs text-slate-400">
                  {rescheduleTarget.booking_code} · {rescheduleTarget.service_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Date</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Select Available Time Slot
                </label>
                {slotsLoading ? (
                  <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading open slots...
                  </p>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-amber-300">
                    No open slots on this date. Pick another date.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {rescheduleSlots.map((sl) => (
                      <button
                        key={sl.startTime}
                        type="button"
                        disabled={!sl.available}
                        onClick={() => setRescheduleTime(sl.startTime)}
                        className={`py-2 rounded-lg text-xs font-mono border ${
                          !sl.available
                            ? 'bg-slate-950/50 border-white/5 text-slate-600 line-through'
                            : rescheduleTime === sl.startTime
                            ? 'bg-indigo-600 border-indigo-400 text-white'
                            : 'bg-slate-900 border-white/10 text-slate-200'
                        }`}
                      >
                        {sl.startTime}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={!rescheduleTime}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold"
                >
                  Confirm New Time
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Rate Your Consultation</h3>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {reviewTarget.professional_name} · {reviewTarget.service_name}
            </p>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= reviewRating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                required
                minLength={5}
                rows={4}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your consultation experience and outcome..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Submit Verified Review
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Status History Modal */}
      {historyModalAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Status Audit Timeline</h3>
                <p className="text-xs font-mono text-slate-400">{historyModalAppt.booking_code}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalAppt(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-white/10 max-h-72 overflow-y-auto">
              {historyRows.map((h) => (
                <div key={h.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <StatusIndicator status={h.new_status} />
                    <span className="font-mono text-slate-500">{h.created_at}</span>
                  </div>
                  <p className="text-slate-300">{h.note}</p>
                  {h.changed_by_name && (
                    <p className="text-slate-500">By {h.changed_by_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
