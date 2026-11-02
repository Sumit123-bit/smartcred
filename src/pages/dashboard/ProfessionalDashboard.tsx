import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Bell,
  Briefcase,
  Calendar,
  Camera,
  Clock,
  Edit3,
  FileImage,
  LayoutDashboard,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { DashboardShell } from '../../components/DashboardShell';
import { api, extractApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type {
  AppointmentRecord,
  AvailabilityDay,
  NotificationRecord,
  ServiceCategory,
  ServiceItem,
} from '../../lib/types';
import { StatusIndicator } from '../../components/StatusIndicator';
import { AvatarImage } from '../../components/AvatarImage';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface EditableDay {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  slotIntervalMinutes: number;
}

interface VerifiedQrResult {
  valid: boolean;
  canCheckIn: boolean;
  alreadyVerified: boolean;
  verificationWarning: string | null;
  appointment: {
    id: number;
    bookingCode: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    status: string;
    notes: string;
    totalAmount: number;
    qrVerifiedAt: string | null;
    serviceName: string;
    durationMinutes: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    professionalName: string;
  };
}

export const ProfessionalDashboard: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dashboard & Profile
  const [profProfile, setProfProfile] = useState<{
    id: number;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string;
    title: string;
    specialty: string;
    category_id: number | null;
    bio: string;
    experience_years: number;
    location: string;
    consultation_fee: number;
    approval_status: string;
    rejection_reason: string;
  } | null>(null);

  const [stats, setStats] = useState({
    totalBookings: 0,
    todayCount: 0,
    upcomingCount: 0,
    pendingCount: 0,
    confirmedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalCustomers: 0,
    realizedRevenue: 0,
    scheduledRevenue: 0,
    activeServicesCount: 0,
    ratingAvg: 5.0,
    reviewCount: 0,
  });
  const [dailySeries, setDailySeries] = useState<
    Array<{ date: string; bookings: number; revenue: number }>
  >([]);
  const [recentActivity, setRecentActivity] = useState<
    Array<{
      id: number;
      booking_code: string;
      appointment_date: string;
      start_time: string;
      status: string;
      updated_at: string;
      service_name: string;
      customer_name: string;
    }>
  >([]);

  // Appointments
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [apptStatusFilter, setApptStatusFilter] = useState('all');
  const [apptDateFilter, setApptDateFilter] = useState('');
  const [selectedCustomerAppt, setSelectedCustomerAppt] = useState<AppointmentRecord | null>(null);

  // Services
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [srvName, setSrvName] = useState('');
  const [srvCategoryId, setSrvCategoryId] = useState<number | ''>('');
  const [srvDesc, setSrvDesc] = useState('');
  const [srvDuration, setSrvDuration] = useState(45);
  const [srvPrice, setSrvPrice] = useState(150);
  const [srvActive, setSrvActive] = useState(true);

  // Availability & Blocked Dates/Slots
  const [days, setDays] = useState<EditableDay[]>([]);
  const [blockedDates, setBlockedDates] = useState<
    Array<{ id: number; blocked_date: string; reason: string }>
  >([]);
  const [blockedSlots, setBlockedSlots] = useState<
    Array<{ id: number; slot_date: string; start_time: string; end_time: string; reason: string }>
  >([]);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('Conference / Out of Office');
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('14:00');
  const [newSlotEnd, setNewSlotEnd] = useState('15:00');
  const [newSlotReason, setNewSlotReason] = useState('Internal Meeting');

  // Notifications
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  // QR Scanner State
  const [qrInput, setQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedQrResult | null>(null);
  const [qrError, setQrError] = useState('');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (apptStatusFilter !== 'all') params.set('status', apptStatusFilter);
      if (apptDateFilter) params.set('date', apptDateFilter);

      const [dashRes, apptRes, srvRes, availRes, blkRes, catRes, notifRes] = await Promise.all([
        api.get('/professional/dashboard'),
        api.get<{ appointments: AppointmentRecord[] }>(
          `/professional/appointments?${params.toString()}`
        ),
        api.get<{ services: ServiceItem[] }>('/professional/services'),
        api.get<{ availability: AvailabilityDay[] }>('/professional/availability'),
        api.get('/professional/blocked'),
        api.get<{ categories: ServiceCategory[] }>('/public/categories'),
        api.get<{ notifications: NotificationRecord[] }>('/users/notifications'),
      ]);

      setProfProfile(dashRes.data.professional);
      setStats((prev) => ({ ...prev, ...dashRes.data.stats }));
      setDailySeries(dashRes.data.dailySeries || []);
      setRecentActivity(dashRes.data.recentActivity || []);
      setAppointments(apptRes.data.appointments || []);
      setServices(srvRes.data.services || []);
      setCategories(catRes.data.categories || []);
      setNotifications(notifRes.data.notifications || []);
      setBlockedDates(blkRes.data.blockedDates || []);
      setBlockedSlots(blkRes.data.blockedSlots || []);

      const mappedDays: EditableDay[] = Array.from({ length: 7 }).map((_, idx) => {
        const found = (availRes.data.availability || []).find((a) => a.day_of_week === idx);
        return {
          dayOfWeek: idx,
          isWorking: found ? Boolean(found.is_working) : idx !== 0,
          startTime: found?.start_time || '09:00',
          endTime: found?.end_time || '17:00',
          breakStart: found?.break_start || '13:00',
          breakEnd: found?.break_end || '14:00',
          slotIntervalMinutes: found?.slot_interval_minutes || 30,
        };
      });
      setDays(mappedDays);
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to load practice workspace.') });
    }
  }, [apptStatusFilter, apptDateFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Clean up camera scanner when switching tabs or unmounting
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'scanner' && cameraActive && qrScannerRef.current) {
      qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
      setCameraActive(false);
    }
  }, [activeTab, cameraActive]);

  const verifyScannedToken = async (tokenValue: string) => {
    setQrError('');
    setVerifiedData(null);
    setQrInput(tokenValue);
    try {
      const res = await api.post<VerifiedQrResult>('/professional/qr/verify', {
        qrToken: tokenValue,
      });
      setVerifiedData(res.data);
    } catch (err) {
      setQrError(extractApiError(err, 'QR verification failed.'));
    }
  };

  const startLiveCamera = async () => {
    setQrError('');
    try {
      setCameraActive(true);
      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode('smartcred-qr-reader');
          qrScannerRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              scanner.stop().catch(() => {});
              qrScannerRef.current = null;
              setCameraActive(false);
              verifyScannedToken(decodedText);
            },
            () => {}
          );
        } catch (camErr) {
          setCameraActive(false);
          setQrError(
            camErr instanceof Error
              ? `Camera unavailable (${camErr.message}). Use Upload QR Image or Paste Token below.`
              : 'Camera access unavailable in this browser frame. Use Upload QR Image or Paste Token.'
          );
        }
      }, 100);
    } catch {
      setCameraActive(false);
    }
  };

  const stopLiveCamera = async () => {
    if (qrScannerRef.current) {
      await qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
    }
    setCameraActive(false);
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrError('');
    try {
      const tempScanner = new Html5Qrcode('smartcred-qr-file-hidden');
      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      await verifyScannedToken(decodedText);
    } catch {
      setQrError('Could not detect a valid QR code in the uploaded image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!qrInput) return;
    try {
      const res = await api.post<{ message: string }>('/professional/qr/check-in', {
        qrToken: qrInput,
      });
      setBanner({ type: 'success', text: res.data.message });
      await verifyScannedToken(qrInput);
      loadAll();
    } catch (err) {
      setQrError(extractApiError(err, 'Check-in failed.'));
    }
  };

  const handleApptStatus = async (
    id: number,
    status: 'Confirmed' | 'Rejected' | 'Completed' | 'No Show'
  ) => {
    try {
      const res = await api.patch<{ message: string }>(`/professional/appointments/${id}/status`, {
        status,
      });
      setBanner({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const openNewServiceForm = () => {
    setEditingService(null);
    setSrvName('');
    setSrvCategoryId(profProfile?.category_id || (categories[0]?.id ?? ''));
    setSrvDesc('');
    setSrvDuration(45);
    setSrvPrice(profProfile?.consultation_fee || 150);
    setSrvActive(true);
    setServiceFormOpen(true);
  };

  const openEditServiceForm = (srv: ServiceItem) => {
    setEditingService(srv);
    setSrvName(srv.name);
    setSrvCategoryId(srv.category_id || '');
    setSrvDesc(srv.description);
    setSrvDuration(srv.duration_minutes);
    setSrvPrice(srv.price);
    setSrvActive(srv.is_active !== 0);
    setServiceFormOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: srvName,
      categoryId: srvCategoryId ? Number(srvCategoryId) : null,
      description: srvDesc,
      durationMinutes: Number(srvDuration),
      price: Number(srvPrice),
      isActive: srvActive,
    };

    try {
      if (editingService) {
        await api.put(`/professional/services/${editingService.id}`, payload);
        setBanner({ type: 'success', text: 'Service updated in SQLite.' });
      } else {
        await api.post('/professional/services', payload);
        setBanner({ type: 'success', text: 'New service added to SQLite.' });
      }
      setServiceFormOpen(false);
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleDeleteService = async (id: number) => {
    try {
      const res = await api.delete<{ message: string }>(`/professional/services/${id}`);
      setBanner({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSaveAvailability = async () => {
    try {
      await api.put('/professional/availability', { days });
      setBanner({ type: 'success', text: 'Weekly working hours and break periods saved.' });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleAddBlockedDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedDate) return;
    try {
      await api.post('/professional/blocked-dates', {
        blockedDate: newBlockedDate,
        reason: newBlockedReason,
      });
      setNewBlockedDate('');
      setBanner({ type: 'success', text: 'Unavailable date blocked.' });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleAddBlockedSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotDate) return;
    try {
      await api.post('/professional/blocked-slots', {
        slotDate: newSlotDate,
        startTime: newSlotStart,
        endTime: newSlotEnd,
        reason: newSlotReason,
      });
      setNewSlotDate('');
      setBanner({ type: 'success', text: 'Custom time window blocked.' });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSavePracticeProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profProfile) return;
    try {
      await api.put('/professional/profile', {
        fullName: profProfile.full_name,
        phone: profProfile.phone,
        title: profProfile.title,
        specialty: profProfile.specialty,
        categoryId: profProfile.category_id,
        bio: profProfile.bio,
        experienceYears: Number(profProfile.experience_years),
        location: profProfile.location,
        consultationFee: Number(profProfile.consultation_fee),
      });
      await refreshProfile();
      setBanner({ type: 'success', text: 'Professional profile saved to SQLite.' });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      await api.post('/users/profile/avatar', fd);
      await refreshProfile();
      setBanner({ type: 'success', text: 'Practice headshot updated.' });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleSendReminders = async () => {
    try {
      const res = await api.post<{ message: string }>('/professional/send-reminders', {});
      setBanner({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  return (
    <DashboardShell
      portalLabel="Professional Workspace"
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      navItems={[
        { id: 'overview', label: 'Practice Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
        {
          id: 'appointments',
          label: 'Bookings & Clients',
          icon: <Calendar className="w-4 h-4" />,
          badgeCount: stats.pendingCount,
        },
        { id: 'scanner', label: 'QR Scanner Check-In', icon: <QrCode className="w-4 h-4" /> },
        { id: 'services', label: 'My Services', icon: <Briefcase className="w-4 h-4" /> },
        { id: 'availability', label: 'Availability & Breaks', icon: <Clock className="w-4 h-4" /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
        { id: 'profile', label: 'Practice Profile', icon: <User className="w-4 h-4" /> },
      ]}
      primaryAction={
        <button
          type="button"
          onClick={() => setActiveTab('scanner')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Scan QR Pass</span>
        </button>
      }
    >
      {/* Hidden container for Html5Qrcode file scanning */}
      <div id="smartcred-qr-file-hidden" className="hidden" />

      {profProfile && profProfile.approval_status !== 'APPROVED' && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
          <strong>Account Status: {profProfile.approval_status}</strong> — Your specialist profile
          is awaiting administrator verification before appearing in public search results. You can
          configure your services and working hours in the meantime.
          {profProfile.rejection_reason && (
            <span className="block mt-1 text-rose-300">
              Admin Note: {profProfile.rejection_reason}
            </span>
          )}
        </div>
      )}

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
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Today&apos;s Sessions</p>
              <p className="text-2xl font-bold text-indigo-300 font-mono tabular-nums mt-1.5">
                {stats.todayCount}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                {stats.upcomingCount} upcoming total
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Pending Requests</p>
              <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1.5">
                {stats.pendingCount}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                awaiting action
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Confirmed Upcoming</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.confirmedCount}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                ${Number(stats.scheduledRevenue).toFixed(0)} scheduled
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Unique Clients</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.totalCustomers}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                {stats.completedCount} completed · {stats.cancelledCount} cancelled
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Realized Revenue</p>
              <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1.5">
                ${Number(stats.realizedRevenue).toFixed(0)}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                {stats.activeServicesCount} active services
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Client Rating</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {Number(stats.ratingAvg).toFixed(2)} ({stats.reviewCount})
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                verified reviews
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Practice Schedule & Revenue Trend</h2>
                <p className="text-xs text-slate-400">
                  Live SQLite booking volume and consultation value (+/- 7 days)
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendReminders}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                <span>Send Upcoming Reminders</span>
              </button>
            </div>

            <div className="h-64 w-full">
              {dailySeries.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  Bookings will populate your analytics chart automatically.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySeries}>
                    <defs>
                      <linearGradient id="profRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue ($)"
                      stroke="#6366f1"
                      fillOpacity={1}
                      fill="url(#profRevGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Recent Client Booking Activity</h2>
                <p className="text-xs text-slate-400">
                  Latest appointment submissions, QR check-ins, and status updates
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('appointments')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap w-fit"
              >
                Manage All Bookings
              </button>
            </div>

            {recentActivity.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No recent booking activity yet.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs text-indigo-300">{item.booking_code}</span>
                        <span className="text-sm font-semibold text-white">{item.customer_name}</span>
                        <StatusIndicator status={item.status} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {item.service_name} · {item.appointment_date} at {item.start_time}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('appointments')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs text-slate-200 whitespace-nowrap shrink-0 w-fit"
                    >
                      Open Queue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: APPOINTMENTS & CUSTOMER DETAILS */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 overflow-x-auto">
              {['all', 'Pending', 'Confirmed', 'Checked In', 'Completed', 'Rejected', 'Cancelled'].map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setApptStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                      apptStatusFilter === st
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st === 'all' ? 'All' : st}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={apptDateFilter}
                onChange={(e) => setApptDateFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
              />
              {apptDateFilter && (
                <button
                  type="button"
                  onClick={() => setApptDateFilter('')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear Date
                </button>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            {appointments.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No appointments found for the selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3.5 px-5 font-medium">Booking</th>
                      <th className="py-3.5 px-5 font-medium">Customer</th>
                      <th className="py-3.5 px-5 font-medium">Service</th>
                      <th className="py-3.5 px-5 font-medium">Schedule</th>
                      <th className="py-3.5 px-5 font-medium">Status</th>
                      <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {appointments.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 px-5 font-mono text-xs text-slate-200 whitespace-nowrap">
                          {a.booking_code}
                        </td>
                        <td className="py-4 px-5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerAppt(a)}
                            className="font-medium text-white hover:text-indigo-300 text-left"
                          >
                            {a.customer_name}
                          </button>
                          <p className="text-xs text-slate-400">{a.customer_email}</p>
                        </td>
                        <td className="py-4 px-5">
                          <p className="text-slate-200 text-xs font-medium">{a.service_name}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            ${Number(a.total_amount).toFixed(0)} · {a.duration_minutes}m
                          </p>
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-200 whitespace-nowrap">
                          {a.appointment_date}
                          <span className="block text-slate-400">
                            {a.start_time} – {a.end_time}
                          </span>
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          <StatusIndicator status={a.status} />
                        </td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCustomerAppt(a)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                            >
                              Details
                            </button>
                            {a.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApptStatus(a.id, 'Confirmed')}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApptStatus(a.id, 'Rejected')}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-medium"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {['Confirmed', 'Checked In'].includes(a.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApptStatus(a.id, 'Completed')}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                                >
                                  Complete
                                </button>
                                {a.status === 'Confirmed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleApptStatus(a.id, 'No Show')}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium"
                                  >
                                    No Show
                                  </button>
                                )}
                              </>
                            )}
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

      {/* TAB 3: QR CODE SCANNER & VERIFICATION */}
      {activeTab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 glass-panel rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Appointment QR Scanner</h2>
              <p className="text-xs text-slate-400 mt-1">
                Scan a client&apos;s SmartCred QR pass using your camera, upload a downloaded QR PNG
                image, or paste a verification token.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startLiveCamera}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold"
                >
                  <Camera className="w-4 h-4" />
                  <span>Start Camera Scanner</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                >
                  <X className="w-4 h-4" />
                  <span>Stop Camera</span>
                </button>
              )}

              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer">
                <FileImage className="w-4 h-4 text-indigo-400" />
                <span>Scan QR Image File</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleScanImageFile}
                  className="hidden"
                />
              </label>
            </div>

            {cameraActive && (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black p-2">
                <div id="smartcred-qr-reader" className="w-full" />
              </div>
            )}

            <div className="pt-4 border-t border-white/10 space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Or Verify Cryptographic Token Directly
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="SCQR.v1.a8f9..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  onClick={() => verifyScannedToken(qrInput)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Verify
                </button>
              </div>
            </div>

            {qrError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {qrError}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">SQLite Verification Result</h2>
            {!verifiedData ? (
              <div className="py-14 text-center text-sm text-slate-500">
                Scan a client QR pass to inspect verified booking details and authorize check-in.
              </div>
            ) : (
              <div className="space-y-5">
                {verifiedData.verificationWarning ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                    {verifiedData.verificationWarning}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Valid cryptographic token matched to your practice schedule.</span>
                  </div>
                )}

                <div className="space-y-2.5 text-sm border-t border-white/10 pt-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Booking ID</span>
                    <span className="font-mono font-semibold text-white">
                      {verifiedData.appointment.bookingCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status</span>
                    <StatusIndicator status={verifiedData.appointment.status} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Client Name</span>
                    <span className="font-semibold text-white">
                      {verifiedData.appointment.customerName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Client Contact</span>
                    <span className="text-slate-200 text-xs">
                      {verifiedData.appointment.customerEmail}{' '}
                      {verifiedData.appointment.customerPhone
                        ? `· ${verifiedData.appointment.customerPhone}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Service</span>
                    <span className="text-slate-200">{verifiedData.appointment.serviceName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Date & Time</span>
                    <span className="font-mono tabular-nums text-white">
                      {verifiedData.appointment.appointmentDate} ·{' '}
                      {verifiedData.appointment.startTime}–{verifiedData.appointment.endTime}
                    </span>
                  </div>
                  {verifiedData.appointment.notes && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <span className="text-xs text-slate-400 block mb-1">Client Notes</span>
                      <p className="text-xs text-slate-200">{verifiedData.appointment.notes}</p>
                    </div>
                  )}
                </div>

                {verifiedData.canCheckIn && (
                  <button
                    type="button"
                    onClick={handleConfirmCheckIn}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold transition-colors"
                  >
                    Authorize & Complete Check-In
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MY SERVICES CRUD */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Consultation Services</h2>
              <p className="text-xs text-slate-400">
                Add, update, or archive services, durations, and pricing in SQLite
              </p>
            </div>
            <button
              type="button"
              onClick={openNewServiceForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add Service</span>
            </button>
          </div>

          {serviceFormOpen && (
            <form
              onSubmit={handleSaveService}
              className="glass-panel rounded-2xl p-6 space-y-4 border border-indigo-500/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  {editingService ? 'Edit Service' : 'New Consultation Service'}
                </h3>
                <button
                  type="button"
                  onClick={() => setServiceFormOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Service Name *</label>
                  <input
                    type="text"
                    required
                    value={srvName}
                    onChange={(e) => setSrvName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Category</label>
                  <select
                    value={srvCategoryId}
                    onChange={(e) => setSrvCategoryId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Duration (Minutes, 15–480) *
                  </label>
                  <input
                    type="number"
                    required
                    min={15}
                    max={480}
                    step={5}
                    value={srvDuration}
                    onChange={(e) => setSrvDuration(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Fee (USD) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={50000}
                    value={srvPrice}
                    onChange={(e) => setSrvPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={srvActive}
                      onChange={(e) => setSrvActive(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span>Active & Bookable</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={srvDesc}
                  onChange={(e) => setSrvDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  {editingService ? 'Update Service' : 'Save Service'}
                </button>
                <button
                  type="button"
                  onClick={() => setServiceFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {services.map((s) => (
              <div key={s.id} className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span>{s.category_name || 'Practice Service'}</span>
                    <StatusIndicator status={s.is_active ? 'Confirmed' : 'Cancelled'} />
                  </div>
                  <h3 className="text-base font-bold text-white mt-1.5">{s.name}</h3>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{s.description}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="font-mono tabular-nums text-sm">
                    <span className="font-bold text-white">${Number(s.price).toFixed(0)}</span>
                    <span className="text-slate-400 text-xs">
                      {' '}
                      · {s.duration_minutes}m · {s.booking_count || 0} bookings
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditServiceForm(s)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Edit Service"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteService(s.id)}
                      className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-200"
                      title="Delete / Archive Service"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AVAILABILITY, WORKING HOURS, BREAKS & BLOCKED DATES */}
      {activeTab === 'availability' && (
        <div className="space-y-8">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Weekly Working Days, Hours & Break Periods
                </h2>
                <p className="text-xs text-slate-400">
                  Changes apply immediately to real-time SQLite slot computation
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveAvailability}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                Save Weekly Schedule
              </button>
            </div>

            <div className="space-y-3">
              {days.map((d, idx) => (
                <div
                  key={d.dayOfWeek}
                  className="p-4 rounded-xl bg-slate-900/60 border border-white/[0.06] grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
                >
                  <label className="lg:col-span-3 flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.isWorking}
                      onChange={(e) =>
                        setDays((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, isWorking: e.target.checked } : row
                          )
                        )
                      }
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-sm font-medium text-white">
                      {DAY_LABELS[d.dayOfWeek]}
                    </span>
                  </label>

                  {d.isWorking ? (
                    <>
                      <div className="lg:col-span-4 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Hours:</span>
                        <input
                          type="time"
                          value={d.startTime}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, startTime: e.target.value } : row
                              )
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 font-mono text-white"
                        />
                        <span className="text-slate-500">to</span>
                        <input
                          type="time"
                          value={d.endTime}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, endTime: e.target.value } : row
                              )
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 font-mono text-white"
                        />
                      </div>

                      <div className="lg:col-span-5 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Break:</span>
                        <input
                          type="time"
                          value={d.breakStart}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, breakStart: e.target.value } : row
                              )
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 font-mono text-white"
                        />
                        <span className="text-slate-500">to</span>
                        <input
                          type="time"
                          value={d.breakEnd}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, breakEnd: e.target.value } : row
                              )
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 font-mono text-white"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="lg:col-span-9 text-xs text-slate-500">Closed / Day Off</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Blocked Dates & Custom Slot Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">Block Unavailable Dates</h3>
                <p className="text-xs text-slate-400">
                  Block full calendar days for conferences, holidays, or leave
                </p>
              </div>
              <form onSubmit={handleAddBlockedDate} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="date"
                  required
                  value={newBlockedDate}
                  onChange={(e) => setNewBlockedDate(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  required
                  value={newBlockedReason}
                  onChange={(e) => setNewBlockedReason(e.target.value)}
                  placeholder="Reason"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Block Date
                </button>
              </form>

              <div className="divide-y divide-white/10">
                {blockedDates.map((bd) => (
                  <div key={bd.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-white">{bd.blocked_date}</span>
                      <span className="text-slate-400"> · {bd.reason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.delete(`/professional/blocked-dates/${bd.id}`);
                        loadAll();
                      }}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">Block Specific Time Windows</h3>
                <p className="text-xs text-slate-400">
                  Reserve custom partial-day windows without blocking the entire date
                </p>
              </div>
              <form onSubmit={handleAddBlockedSlot} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="date"
                    required
                    value={newSlotDate}
                    onChange={(e) => setNewSlotDate(e.target.value)}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
                  />
                  <input
                    type="time"
                    required
                    value={newSlotStart}
                    onChange={(e) => setNewSlotStart(e.target.value)}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
                  />
                  <input
                    type="time"
                    required
                    value={newSlotEnd}
                    onChange={(e) => setNewSlotEnd(e.target.value)}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSlotReason}
                    onChange={(e) => setNewSlotReason(e.target.value)}
                    placeholder="Reason"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Block Window
                  </button>
                </div>
              </form>

              <div className="divide-y divide-white/10">
                {blockedSlots.map((bs) => (
                  <div key={bs.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-white">
                        {bs.slot_date} {bs.start_time}–{bs.end_time}
                      </span>
                      <span className="text-slate-400"> · {bs.reason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await api.delete(`/professional/blocked-slots/${bs.id}`);
                        loadAll();
                      }}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Practice Notifications</h2>
            <button
              type="button"
              onClick={async () => {
                await api.post('/users/notifications/read-all', {});
                loadAll();
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Mark All Read
            </button>
          </div>
          <div className="divide-y divide-white/10">
            {notifications.map((n) => (
              <div key={n.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-mono">
                    {n.channel} · {n.created_at}
                  </span>
                  <StatusIndicator status={n.delivery_status} />
                </div>
                <p className="text-sm font-semibold text-white">{n.subject}</p>
                <p className="text-xs text-slate-300 mt-1">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: PRACTICE PROFILE */}
      {activeTab === 'profile' && profProfile && (
        <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-3xl space-y-6">
          <h2 className="text-xl font-bold text-white">Professional Practice Profile</h2>

          <div className="flex items-center gap-4">
            <AvatarImage
              src={profProfile.avatar_url}
              name={profProfile.full_name}
              sizeClass="w-20 h-20"
            />
            <div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Practice Portrait</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <form onSubmit={handleSavePracticeProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={profProfile.full_name}
                  onChange={(e) =>
                    setProfProfile((p) => (p ? { ...p, full_name: e.target.value } : p))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={profProfile.phone}
                  onChange={(e) =>
                    setProfProfile((p) => (p ? { ...p, phone: e.target.value } : p))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Professional Title *</label>
                <input
                  type="text"
                  required
                  value={profProfile.title}
                  onChange={(e) =>
                    setProfProfile((p) => (p ? { ...p, title: e.target.value } : p))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Specialty *</label>
                <input
                  type="text"
                  required
                  value={profProfile.specialty}
                  onChange={(e) =>
                    setProfProfile((p) => (p ? { ...p, specialty: e.target.value } : p))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category</label>
                <select
                  value={profProfile.category_id || ''}
                  onChange={(e) =>
                    setProfProfile((p) =>
                      p ? { ...p, category_id: e.target.value ? Number(e.target.value) : null } : p
                    )
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
                <label className="block text-xs text-slate-300 mb-1">Experience (Years)</label>
                <input
                  type="number"
                  min={0}
                  value={profProfile.experience_years}
                  onChange={(e) =>
                    setProfProfile((p) =>
                      p ? { ...p, experience_years: Number(e.target.value) } : p
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Base Fee (USD)</label>
                <input
                  type="number"
                  min={0}
                  value={profProfile.consultation_fee}
                  onChange={(e) =>
                    setProfProfile((p) =>
                      p ? { ...p, consultation_fee: Number(e.target.value) } : p
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Practice Location</label>
              <input
                type="text"
                value={profProfile.location}
                onChange={(e) =>
                  setProfProfile((p) => (p ? { ...p, location: e.target.value } : p))
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Practice Bio</label>
              <textarea
                rows={4}
                value={profProfile.bio}
                onChange={(e) => setProfProfile((p) => (p ? { ...p, bio: e.target.value } : p))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              Save Practice Profile
            </button>
          </form>
        </div>
      )}

      {/* Customer Details Modal */}
      {selectedCustomerAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Customer & Booking Details</h3>
                <p className="text-xs font-mono text-slate-400">
                  {selectedCustomerAppt.booking_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerAppt(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer Name</span>
                <span className="font-semibold text-white">
                  {selectedCustomerAppt.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email</span>
                <span className="text-slate-200">{selectedCustomerAppt.customer_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone</span>
                <span className="font-mono text-slate-200">
                  {selectedCustomerAppt.customer_phone || 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Service</span>
                <span className="text-slate-200">{selectedCustomerAppt.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Schedule</span>
                <span className="font-mono text-white">
                  {selectedCustomerAppt.appointment_date} · {selectedCustomerAppt.start_time}–
                  {selectedCustomerAppt.end_time}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <StatusIndicator status={selectedCustomerAppt.status} />
              </div>
              {selectedCustomerAppt.notes && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-xs text-slate-400 block mb-1">Client Preparation Notes</span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {selectedCustomerAppt.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
