import React, { useEffect, useState, useCallback } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Briefcase,
  Calendar,
  ClipboardCheck,
  Download,
  Eye,
  FolderKanban,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { DashboardShell } from '../../components/DashboardShell';
import { api, extractApiError } from '../../lib/api';
import type {
  AppointmentRecord,
  ProfessionalApplicationRecord,
  ProfessionalSummary,
  ServiceCategory,
} from '../../lib/types';
import { StatusIndicator } from '../../components/StatusIndicator';
import { AvatarImage } from '../../components/AvatarImage';

interface AdminUserRow {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: 'USER' | 'PROFESSIONAL' | 'ADMIN';
  is_active: number;
  is_demo: number;
  created_at: string;
  booking_count: number;
}

interface ReportSummaryRow {
  period_label: string;
  total_bookings: number;
  confirmed_count: number;
  completed_count: number;
  qr_verified_count: number;
  cancelled_count: number;
  gross_revenue: number;
  realized_revenue: number;
}

interface ActivityLogRow {
  id: number;
  actor_name: string | null;
  actor_role: string;
  action: string;
  entity_type: string;
  details: string;
  created_at: string;
}

interface ContactInquiryRow {
  id: number;
  full_name: string;
  email: string;
  subject: string;
  message: string;
  created_at: string;
}

interface ProfessionalPerformanceRow {
  id: number;
  professional_name: string;
  specialty: string;
  rating_avg: number;
  total_bookings: number;
  completed_count: number;
  revenue: number;
}

interface ServicePopularityRow {
  id: number;
  service_name: string;
  professional_name: string;
  price: number;
  booking_count: number;
  revenue: number;
}

interface CancellationStatsSummary {
  totalAppointments: number;
  cancelledCount: number;
  rejectedCount: number;
  noShowCount: number;
}

const POLL_INTERVAL_MS = 12000;

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedLabel, setLastSyncedLabel] = useState('');

  // Overview stats & charts
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAccounts: 0,
    totalProfessionals: 0,
    approvedProfessionals: 0,
    pendingProfessionals: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    totalApplications: 0,
    totalAppointments: 0,
    todayAppointments: 0,
    pendingAppointments: 0,
    confirmedAppointments: 0,
    checkedInAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    grossRevenue: 0,
    completedRevenue: 0,
  });
  const [trendSeries, setTrendSeries] = useState<
    Array<{ date: string; bookings: number; revenue: number }>
  >([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    Array<{ name: string; bookings: number; revenue: number }>
  >([]);

  // Dedicated Professional Applications / Access Requests
  const [applications, setApplications] = useState<ProfessionalApplicationRecord[]>([]);
  const [appStatusFilter, setAppStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [appSearch, setAppSearch] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<ProfessionalApplicationRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProfessionalApplicationRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  // Professionals
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [profStatusFilter, setProfStatusFilter] = useState('all');
  const [addProfOpen, setAddProfOpen] = useState(false);
  const [newProf, setNewProf] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    title: '',
    specialty: '',
    categoryId: 1,
    experienceYears: 8,
    location: '',
    consultationFee: 175,
    bio: '',
  });

  // Users
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  // Appointments
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [apptStatusFilter, setApptStatusFilter] = useState('all');
  const [apptSearch, setApptSearch] = useState('');
  const [apptDateFilter, setApptDateFilter] = useState('');
  const [apptCustomerFilter, setApptCustomerFilter] = useState('');
  const [apptProfessionalFilter, setApptProfessionalFilter] = useState('');

  // Categories
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Reports
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportRows, setReportRows] = useState<ReportSummaryRow[]>([]);
  const [profPerf, setProfPerf] = useState<ProfessionalPerformanceRow[]>([]);
  const [srvPop, setSrvPop] = useState<ServicePopularityRow[]>([]);
  const [cancelStats, setCancelStats] = useState<CancellationStatsSummary>({
    totalAppointments: 0,
    cancelledCount: 0,
    rejectedCount: 0,
    noShowCount: 0,
  });

  // Activity Logs & Contact Messages
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [contacts, setContacts] = useState<ContactInquiryRow[]>([]);

  const loadAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsRefreshing(true);
      }

      try {
        const results = await Promise.allSettled([
          api.get('/admin/dashboard'),
          api.get<{ applications: ProfessionalApplicationRecord[] }>(
            `/admin/professional-applications?status=${encodeURIComponent(
              appStatusFilter
            )}&search=${encodeURIComponent(appSearch)}`
          ),
          api.get<{ professionals: ProfessionalSummary[] }>(
            `/admin/professionals?status=${encodeURIComponent(profStatusFilter)}`
          ),
          api.get<{ users: AdminUserRow[] }>(
            `/admin/users?role=${encodeURIComponent(userRoleFilter)}&search=${encodeURIComponent(
              userSearch
            )}`
          ),
          api.get<{ appointments: AppointmentRecord[] }>(
            `/admin/appointments?status=${encodeURIComponent(
              apptStatusFilter
            )}&search=${encodeURIComponent(apptSearch)}&date=${encodeURIComponent(
              apptDateFilter
            )}&customer=${encodeURIComponent(
              apptCustomerFilter
            )}&professional=${encodeURIComponent(apptProfessionalFilter)}`
          ),
          api.get<{ categories: ServiceCategory[] }>('/admin/categories'),
          api.get<{
            rows: ReportSummaryRow[];
            professionalPerformance?: ProfessionalPerformanceRow[];
            servicePopularity?: ServicePopularityRow[];
            cancellationStats?: CancellationStatsSummary;
          }>(`/admin/reports?period=${reportPeriod}`),
          api.get<{ logs: ActivityLogRow[]; contacts: ContactInquiryRow[] }>('/admin/activities'),
        ]);

        const [ovRes, appRes, profRes, usrRes, apptRes, catRes, repRes, actRes] = results;

        if (ovRes.status === 'fulfilled') {
          setStats((prev) => ({ ...prev, ...ovRes.value.data.stats }));
          setTrendSeries(ovRes.value.data.trendSeries || []);
          setCategoryBreakdown(ovRes.value.data.categoryBreakdown || []);
        }
        if (appRes.status === 'fulfilled') {
          setApplications(appRes.value.data.applications || []);
        }
        if (profRes.status === 'fulfilled') {
          setProfessionals(profRes.value.data.professionals || []);
        }
        if (usrRes.status === 'fulfilled') {
          setUsers(usrRes.value.data.users || []);
        }
        if (apptRes.status === 'fulfilled') {
          setAppointments(apptRes.value.data.appointments || []);
        }
        if (catRes.status === 'fulfilled') {
          setCategories(catRes.value.data.categories || []);
        }
        if (repRes.status === 'fulfilled') {
          setReportRows(repRes.value.data.rows || []);
          setProfPerf(repRes.value.data.professionalPerformance || []);
          setSrvPop(repRes.value.data.servicePopularity || []);
          if (repRes.value.data.cancellationStats) {
            setCancelStats(repRes.value.data.cancellationStats);
          }
        }
        if (actRes.status === 'fulfilled') {
          setLogs(actRes.value.data.logs || []);
          setContacts(actRes.value.data.contacts || []);
        }

        const firstRejected = results.find((r) => r.status === 'rejected') as
          | PromiseRejectedResult
          | undefined;

        if (firstRejected) {
          setBanner({
            type: 'error',
            text: extractApiError(
              firstRejected.reason,
              'One or more admin queries failed to synchronize.'
            ),
          });
        } else {
          const now = new Date();
          setLastSyncedLabel(
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          );
        }
      } catch (err) {
        setBanner({ type: 'error', text: extractApiError(err, 'Failed to load admin console.') });
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      appStatusFilter,
      appSearch,
      profStatusFilter,
      userRoleFilter,
      userSearch,
      apptStatusFilter,
      apptSearch,
      apptDateFilter,
      apptCustomerFilter,
      apptProfessionalFilter,
      reportPeriod,
    ]
  );

  // Initial load & filter updates
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Real-time automatic polling (every 12s) + instant tab focus/visibility sync
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadAll({ silent: true });
      }
    }, POLL_INTERVAL_MS);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadAll({ silent: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [loadAll]);

  const handleOpenApplicationDetails = async (app: ProfessionalApplicationRecord) => {
    setSelectedApplication(app);
    try {
      const res = await api.get<{ application: ProfessionalApplicationRecord }>(
        `/admin/professional-applications/${app.id}`
      );
      if (res.data.application) {
        setSelectedApplication(res.data.application);
      }
    } catch {
      // Keep row snapshot if detail fetch fails
    }
  };

  const handleApproveApplication = async (appId: number) => {
    setActionBusyId(appId);
    try {
      const res = await api.put<{
        message: string;
        application: ProfessionalApplicationRecord;
      }>(`/admin/professional-applications/${appId}/approve`, {});
      setBanner({
        type: 'success',
        text: res.data.message || `Application #${appId} approved and activated in SQLite.`,
      });
      if (selectedApplication && selectedApplication.id === appId && res.data.application) {
        setSelectedApplication(res.data.application);
      }
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to approve application.') });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmRejectApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const appId = rejectTarget.id;
    setActionBusyId(appId);
    try {
      const res = await api.put<{
        message: string;
        application: ProfessionalApplicationRecord;
      }>(`/admin/professional-applications/${appId}/reject`, {
        rejectionReason:
          rejectReason.trim() || 'Application did not meet specialist verification criteria.',
      });
      setBanner({
        type: 'success',
        text: res.data.message || `Application #${appId} rejected and recorded in SQLite.`,
      });
      if (selectedApplication && selectedApplication.id === appId && res.data.application) {
        setSelectedApplication(res.data.application);
      }
      setRejectTarget(null);
      setRejectReason('');
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to reject application.') });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleApproval = async (
    id: number,
    approvalStatus?: 'APPROVED' | 'REJECTED',
    isFeatured?: boolean
  ) => {
    try {
      await api.patch(`/admin/professionals/${id}/approval`, {
        approvalStatus,
        isFeatured,
      });
      setBanner({ type: 'success', text: 'Specialist record updated in SQLite.' });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleCreateProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/professionals', {
        ...newProf,
        categoryId: Number(newProf.categoryId),
        experienceYears: Number(newProf.experienceYears),
        consultationFee: Number(newProf.consultationFee),
      });
      setBanner({ type: 'success', text: 'New professional onboarded and approved in SQLite.' });
      setAddProfOpen(false);
      setNewProf({
        fullName: '',
        email: '',
        password: '',
        phone: '',
        title: '',
        specialty: '',
        categoryId: categories[0]?.id || 1,
        experienceYears: 8,
        location: '',
        consultationFee: 175,
        bio: '',
      });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleToggleUserActive = async (u: AdminUserRow) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { isActive: !u.is_active });
      setBanner({
        type: 'success',
        text: `${u.email} ${u.is_active ? 'suspended' : 'reactivated'}.`,
      });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleAdminApptStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/admin/appointments/${id}/status`, { status });
      setBanner({ type: 'success', text: `Appointment updated to ${status}.` });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/categories', {
        name: catName,
        description: catDesc,
        isActive: true,
      });
      setCatName('');
      setCatDesc('');
      setBanner({ type: 'success', text: 'Service category created in SQLite.' });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleToggleCategory = async (cat: ServiceCategory) => {
    try {
      await api.put(`/admin/categories/${cat.id}`, {
        name: cat.name,
        description: cat.description,
        isActive: !cat.is_active,
      });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err) });
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get(`/admin/reports/export?period=${reportPeriod}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smartcred-${reportPeriod}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBanner({ type: 'success', text: `Exported ${reportPeriod} CSV report from SQLite.` });
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'CSV export failed.') });
    }
  };

  const pendingPreview = applications.filter((a) => a.status === 'PENDING').slice(0, 4);

  return (
    <DashboardShell
      portalLabel="Admin Governance"
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      navItems={[
        {
          id: 'analytics',
          label: 'Analytics Overview',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          id: 'requests',
          label: 'Access Requests',
          icon: <ClipboardCheck className="w-4 h-4" />,
          badgeCount: stats.pendingApplications,
        },
        {
          id: 'professionals',
          label: 'Approved & Specialists',
          icon: <Briefcase className="w-4 h-4" />,
        },
        {
          id: 'users',
          label: 'Manage Users',
          icon: <Users className="w-4 h-4" />,
        },
        {
          id: 'appointments',
          label: 'Manage Appointments',
          icon: <Calendar className="w-4 h-4" />,
        },
        {
          id: 'categories',
          label: 'Service Categories',
          icon: <FolderKanban className="w-4 h-4" />,
        },
        {
          id: 'reports',
          label: 'Reports & CSV Export',
          icon: <BarChart3 className="w-4 h-4" />,
        },
        {
          id: 'activities',
          label: 'Activity & Inquiries',
          icon: <Activity className="w-4 h-4" />,
        },
      ]}
      primaryAction={
        <div className="flex items-center gap-2.5">
          {lastSyncedLabel && (
            <span className="hidden md:inline text-[11px] font-mono tabular-nums text-slate-400">
              Synced {lastSyncedLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadAll()}
            disabled={isRefreshing}
            title="Refresh SQLite records now"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reports & CSV</span>
          </button>
        </div>
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

      {initialLoading ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-sm text-slate-300">
          Loading real-time SQLite records...
        </div>
      ) : null}

      {/* TAB 1: ANALYTICS OVERVIEW */}
      {!initialLoading && activeTab === 'analytics' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <button
              type="button"
              onClick={() => {
                setUserRoleFilter('USER');
                setActiveTab('users');
              }}
              className="glass-panel rounded-2xl p-5 text-left hover:border-indigo-500/40 transition-colors"
            >
              <p className="text-xs text-slate-400">Registered Clients</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.totalUsers}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                {stats.totalAccounts} total accounts
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setProfStatusFilter('APPROVED');
                setActiveTab('professionals');
              }}
              className="glass-panel rounded-2xl p-5 text-left hover:border-indigo-500/40 transition-colors"
            >
              <p className="text-xs text-slate-400">Approved Specialists</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.approvedProfessionals}
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setAppStatusFilter('pending');
                setActiveTab('requests');
              }}
              className="glass-panel rounded-2xl p-5 text-left hover:border-amber-500/40 transition-colors"
            >
              <p className="text-xs text-slate-400">Pending Requests</p>
              <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1.5">
                {stats.pendingApplications}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                {stats.totalApplications} total requests
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setApptStatusFilter('all');
                setActiveTab('appointments');
              }}
              className="glass-panel rounded-2xl p-5 text-left hover:border-indigo-500/40 transition-colors"
            >
              <p className="text-xs text-slate-400">Total Bookings</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {stats.totalAppointments}
              </p>
              <p className="text-[11px] text-indigo-300 font-mono tabular-nums mt-1">
                {stats.todayAppointments} scheduled today
              </p>
            </button>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Scheduled Gross</p>
              <p className="text-2xl font-bold text-indigo-300 font-mono tabular-nums mt-1.5">
                ${Number(stats.grossRevenue).toFixed(0)}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Realized Revenue</p>
              <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1.5">
                ${Number(stats.completedRevenue).toFixed(0)}
              </p>
            </div>
          </div>

          {/* Live Pending Requests Queue Preview */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  Incoming Specialist Access Requests
                </h2>
                <p className="text-xs text-slate-400">
                  Auto-syncing from SQLite every 12 seconds — review, approve, or reject pending applications
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap w-fit"
              >
                Open Full Request Queue ({stats.totalApplications})
              </button>
            </div>

            {pendingPreview.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">
                No pending specialist applications awaiting review right now.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {pendingPreview.map((reqRow) => (
                  <div
                    key={reqRow.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
                        <span className="text-indigo-300">REQ #{reqRow.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>User #{reqRow.user_id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{reqRow.created_at}</span>
                        <span aria-hidden="true">·</span>
                        <StatusIndicator status={reqRow.status} />
                      </div>
                      <p className="text-sm font-semibold text-white mt-0.5">
                        {reqRow.full_name} ({reqRow.email})
                      </p>
                      <p className="text-xs text-slate-400">
                        {reqRow.title} — {reqRow.specialty}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenApplicationDetails(reqRow)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        disabled={actionBusyId === reqRow.id}
                        onClick={() => handleApproveApplication(reqRow.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionBusyId === reqRow.id}
                        onClick={() => {
                          setRejectTarget(reqRow);
                          setRejectReason('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 disabled:opacity-50 text-xs font-medium text-rose-200"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-base font-bold text-white mb-1">
                Platform Revenue & Booking Trajectory
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Calculated dynamically from SQLite appointments table
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendSeries}>
                    <defs>
                      <linearGradient id="adminRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
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
                      fill="url(#adminRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-base font-bold text-white mb-1">Bookings by Practice Category</h2>
              <p className="text-xs text-slate-400 mb-5">
                Relational join across categories, professionals, and appointments
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="bookings" name="Bookings" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEDICATED REQUEST MANAGEMENT SECTION */}
      {!initialLoading && activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Search Request ID, User ID, name, email, phone..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 overflow-x-auto w-fit">
              {(
                [
                  { id: 'all', label: `All Requests (${stats.totalApplications})` },
                  { id: 'pending', label: `Pending (${stats.pendingApplications})` },
                  { id: 'approved', label: `Approved (${stats.approvedApplications})` },
                  { id: 'rejected', label: `Rejected (${stats.rejectedApplications})` },
                ] as const
              ).map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setAppStatusFilter(flt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    appStatusFilter === flt.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            {applications.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <p className="text-sm font-medium text-slate-200">
                  No access requests match the selected filter.
                </p>
                <p className="text-xs text-slate-400">
                  New specialist registrations and upgrade requests appear here automatically.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">Request ID</th>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">User ID</th>
                      <th className="py-3.5 px-4 font-medium">Full Name</th>
                      <th className="py-3.5 px-4 font-medium">Email Address</th>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">Phone Number</th>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">Requested Role</th>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">Submission Date</th>
                      <th className="py-3.5 px-4 font-medium whitespace-nowrap">Request Status</th>
                      <th className="py-3.5 px-4 font-medium text-right whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {applications.map((reqRow) => (
                      <tr key={reqRow.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 px-4 font-mono tabular-nums text-xs text-indigo-300 whitespace-nowrap">
                          #{reqRow.id}
                        </td>
                        <td className="py-4 px-4 font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                          #{reqRow.user_id}
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium text-white">{reqRow.full_name}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[200px]">
                            {reqRow.title} · {reqRow.specialty}
                          </p>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300">{reqRow.email}</td>
                        <td className="py-4 px-4 font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                          {reqRow.phone || '—'}
                        </td>
                        <td className="py-4 px-4 font-mono text-xs text-slate-200 whitespace-nowrap">
                          {reqRow.requested_role}
                        </td>
                        <td className="py-4 px-4 font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                          {reqRow.created_at}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <StatusIndicator status={reqRow.status} />
                          {reqRow.status === 'REJECTED' && reqRow.rejection_reason && (
                            <p
                              className="text-[11px] text-rose-300/90 truncate max-w-[170px] mt-0.5"
                              title={reqRow.rejection_reason}
                            >
                              {reqRow.rejection_reason}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenApplicationDetails(reqRow)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Details</span>
                            </button>
                            {reqRow.status !== 'APPROVED' && (
                              <button
                                type="button"
                                disabled={actionBusyId === reqRow.id}
                                onClick={() => handleApproveApplication(reqRow.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                              >
                                Approve
                              </button>
                            )}
                            {reqRow.status !== 'REJECTED' && (
                              <button
                                type="button"
                                disabled={actionBusyId === reqRow.id}
                                onClick={() => {
                                  setRejectTarget(reqRow);
                                  setRejectReason(reqRow.rejection_reason || '');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 disabled:opacity-50 text-xs font-medium text-rose-200"
                              >
                                Reject
                              </button>
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

      {/* TAB 3: MANAGE PROFESSIONALS & FEATURED DIRECTORY */}
      {!initialLoading && activeTab === 'professionals' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 w-fit">
              {['all', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setProfStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    profStatusFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'All Specialists' : st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAddProfOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold w-fit"
            >
              <Plus className="w-4 h-4" />
              <span>Add Approved Professional</span>
            </button>
          </div>

          {addProfOpen && (
            <form
              onSubmit={handleCreateProfessional}
              className="glass-panel rounded-2xl p-6 space-y-4 border border-indigo-500/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Onboard Specialist Directly</h3>
                <button
                  type="button"
                  onClick={() => setAddProfOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Full Name *"
                  value={newProf.fullName}
                  onChange={(e) => setNewProf((p) => ({ ...p, fullName: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
                <input
                  type="email"
                  required
                  placeholder="Email *"
                  value={newProf.email}
                  onChange={(e) => setNewProf((p) => ({ ...p, email: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Initial Password *"
                  value={newProf.password}
                  onChange={(e) => setNewProf((p) => ({ ...p, password: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Title (e.g. Senior Partner) *"
                  value={newProf.title}
                  onChange={(e) => setNewProf((p) => ({ ...p, title: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Specialty *"
                  value={newProf.specialty}
                  onChange={(e) => setNewProf((p) => ({ ...p, specialty: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
                <select
                  value={newProf.categoryId}
                  onChange={(e) =>
                    setNewProf((p) => ({ ...p, categoryId: Number(e.target.value) }))
                  }
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Location"
                  value={newProf.location}
                  onChange={(e) => setNewProf((p) => ({ ...p, location: e.target.value }))}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
                <input
                  type="number"
                  placeholder="Years Experience"
                  value={newProf.experienceYears}
                  onChange={(e) =>
                    setNewProf((p) => ({ ...p, experienceYears: Number(e.target.value) }))
                  }
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                />
                <input
                  type="number"
                  placeholder="Base Fee (USD)"
                  value={newProf.consultationFee}
                  onChange={(e) =>
                    setNewProf((p) => ({ ...p, consultationFee: Number(e.target.value) }))
                  }
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm font-mono text-white"
                />
              </div>
              <textarea
                rows={2}
                placeholder="Biography & credentials..."
                value={newProf.bio}
                onChange={(e) => setNewProf((p) => ({ ...p, bio: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Create & Approve Specialist
              </button>
            </form>
          )}

          {professionals.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-sm text-slate-400">
              No specialist profiles match the selected status filter.
            </div>
          ) : (
            <div className="space-y-4">
              {professionals.map((p) => (
                <div
                  key={p.id}
                  className="glass-panel rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  <div className="flex items-start gap-4">
                    <AvatarImage src={p.avatar_url} name={p.full_name} sizeClass="w-14 h-14" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <StatusIndicator status={p.approval_status || 'PENDING'} />
                        <span aria-hidden="true">·</span>
                        <span>{p.category_name || 'Uncategorized'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">${Number(p.consultation_fee).toFixed(0)}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1">{p.full_name}</h3>
                      <p className="text-xs text-indigo-300">
                        {p.title} — {p.specialty}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl">{p.bio}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {p.approval_status !== 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => handleApproval(p.id, 'APPROVED')}
                        className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                      >
                        Approve Application
                      </button>
                    )}
                    {p.approval_status !== 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => {
                          const matchingApp = applications.find((a) => a.user_id === p.user_id);
                          if (matchingApp) {
                            setRejectTarget(matchingApp);
                            setRejectReason(matchingApp.rejection_reason || '');
                          } else {
                            handleApproval(p.id, 'REJECTED');
                          }
                        }}
                        className="px-3.5 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-medium"
                      >
                        Reject
                      </button>
                    )}
                    {p.approval_status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => handleApproval(p.id, undefined, !p.is_featured)}
                        className={`px-3.5 py-2 rounded-lg border text-xs font-medium ${
                          p.is_featured
                            ? 'bg-indigo-600/25 border-indigo-500/40 text-indigo-200'
                            : 'bg-slate-800 border-white/10 text-slate-300'
                        }`}
                      >
                        {p.is_featured ? 'Featured on Home' : 'Mark Featured'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MANAGE USERS */}
      {!initialLoading && activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search User ID, name, email, or phone..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10">
              {['all', 'USER', 'PROFESSIONAL', 'ADMIN'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setUserRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    userRoleFilter === r
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r === 'all' ? 'All Roles' : r}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            {users.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No user accounts match the current search or role filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3.5 px-5 font-medium whitespace-nowrap">User ID</th>
                      <th className="py-3.5 px-5 font-medium">User</th>
                      <th className="py-3.5 px-5 font-medium whitespace-nowrap">Phone</th>
                      <th className="py-3.5 px-5 font-medium">Role</th>
                      <th className="py-3.5 px-5 font-medium whitespace-nowrap">Registered</th>
                      <th className="py-3.5 px-5 font-medium text-right">Bookings</th>
                      <th className="py-3.5 px-5 font-medium">Status</th>
                      <th className="py-3.5 px-5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-indigo-300 whitespace-nowrap">
                          #{u.id}
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-medium text-white">{u.full_name}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                          {u.phone || '—'}
                        </td>
                        <td className="py-4 px-5 font-mono text-xs text-slate-300">{u.role}</td>
                        <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
                          {u.created_at}
                        </td>
                        <td className="py-4 px-5 font-mono tabular-nums text-right text-slate-200">
                          {u.booking_count}
                        </td>
                        <td className="py-4 px-5">
                          <StatusIndicator status={u.is_active ? 'Confirmed' : 'Cancelled'} />
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                          >
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
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

      {/* TAB 5: MANAGE ALL APPOINTMENTS */}
      {!initialLoading && activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={apptSearch}
                  onChange={(e) => setApptSearch(e.target.value)}
                  placeholder="Search booking code or service..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 overflow-x-auto">
                {['all', 'Pending', 'Confirmed', 'Checked In', 'Completed', 'Cancelled'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setApptStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                      apptStatusFilter === s
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <input
                  type="date"
                  value={apptDateFilter}
                  onChange={(e) => setApptDateFilter(e.target.value)}
                  aria-label="Filter appointments by date"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={apptCustomerFilter}
                  onChange={(e) => setApptCustomerFilter(e.target.value)}
                  placeholder="Filter by client name or email..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={apptProfessionalFilter}
                  onChange={(e) => setApptProfessionalFilter(e.target.value)}
                  placeholder="Filter by specialist name..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white"
                />
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    setApptSearch('');
                    setApptStatusFilter('all');
                    setApptDateFilter('');
                    setApptCustomerFilter('');
                    setApptProfessionalFilter('');
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 whitespace-nowrap"
                >
                  Reset All Filters
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            {appointments.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No appointments match the selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3.5 px-5 font-medium">Code</th>
                      <th className="py-3.5 px-5 font-medium">Client</th>
                      <th className="py-3.5 px-5 font-medium">Specialist & Service</th>
                      <th className="py-3.5 px-5 font-medium">Date & Time</th>
                      <th className="py-3.5 px-5 font-medium text-right">Fee</th>
                      <th className="py-3.5 px-5 font-medium">Status</th>
                      <th className="py-3.5 px-5 font-medium text-right">Override</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {appointments.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.02]">
                        <td className="py-4 px-5 font-mono text-xs text-slate-200 whitespace-nowrap">
                          {a.booking_code}
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-medium text-white">{a.customer_name}</p>
                          <p className="text-xs text-slate-400">{a.customer_email}</p>
                        </td>
                        <td className="py-4 px-5">
                          <p className="text-white text-xs font-medium">{a.professional_name}</p>
                          <p className="text-xs text-slate-400">{a.service_name}</p>
                        </td>
                        <td className="py-4 px-5 font-mono text-xs text-slate-200 whitespace-nowrap">
                          {a.appointment_date} · {a.start_time}
                        </td>
                        <td className="py-4 px-5 font-mono text-right text-white">
                          ${Number(a.total_amount).toFixed(0)}
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          <StatusIndicator status={a.status} />
                        </td>
                        <td className="py-4 px-5 text-right">
                          <select
                            value={a.status}
                            onChange={(e) => handleAdminApptStatus(a.id, e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-200"
                          >
                            {[
                              'Pending',
                              'Confirmed',
                              'Checked In',
                              'Completed',
                              'Cancelled',
                              'Rejected',
                              'No Show',
                            ].map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
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

      {/* TAB 6: SERVICE CATEGORIES */}
      {!initialLoading && activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 h-fit space-y-4">
            <h2 className="text-lg font-bold text-white">Add Service Category</h2>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Executive Coaching & Strategy"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Describe the scope of services in this category..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Save Category
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Existing Categories</h2>
            <div className="divide-y divide-white/10">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{c.name}</span>
                      <span className="text-xs text-slate-500 font-mono">
                        · {c.professional_count || 0} pros · {c.service_count || 0} services
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{c.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleCategory(c)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 whitespace-nowrap"
                  >
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: REPORTS & CSV EXPORT */}
      {!initialLoading && activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 w-fit">
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReportPeriod(p)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                    reportPeriod === p
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p} Report
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold w-fit"
            >
              <Download className="w-4 h-4" />
              <span>Export {reportPeriod.toUpperCase()} CSV</span>
            </button>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs text-slate-400 bg-slate-950/40">
                  <tr>
                    <th className="py-3.5 px-5 font-medium">Period</th>
                    <th className="py-3.5 px-5 font-medium text-right">Total Bookings</th>
                    <th className="py-3.5 px-5 font-medium text-right">Confirmed</th>
                    <th className="py-3.5 px-5 font-medium text-right">Completed / Checked In</th>
                    <th className="py-3.5 px-5 font-medium text-right">QR Check-Ins</th>
                    <th className="py-3.5 px-5 font-medium text-right">Cancelled</th>
                    <th className="py-3.5 px-5 font-medium text-right">Gross Scheduled</th>
                    <th className="py-3.5 px-5 font-medium text-right">Realized Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums text-xs">
                  {reportRows.map((r) => (
                    <tr key={r.period_label} className="hover:bg-white/[0.02]">
                      <td className="py-4 px-5 text-white font-semibold">{r.period_label}</td>
                      <td className="py-4 px-5 text-right text-slate-200">{r.total_bookings}</td>
                      <td className="py-4 px-5 text-right text-emerald-400">{r.confirmed_count}</td>
                      <td className="py-4 px-5 text-right text-indigo-300">{r.completed_count}</td>
                      <td className="py-4 px-5 text-right text-sky-400">{r.qr_verified_count}</td>
                      <td className="py-4 px-5 text-right text-rose-400">{r.cancelled_count}</td>
                      <td className="py-4 px-5 text-right text-slate-200">
                        ${Number(r.gross_revenue).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right text-emerald-300 font-semibold">
                        ${Number(r.realized_revenue).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cancellation & Attendance Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Total Recorded Bookings</p>
              <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1.5">
                {cancelStats.totalAppointments}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Client Cancelled</p>
              <p className="text-2xl font-bold text-rose-400 font-mono tabular-nums mt-1.5">
                {cancelStats.cancelledCount}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Specialist Rejected</p>
              <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1.5">
                {cancelStats.rejectedCount}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <p className="text-xs text-slate-400">Marked No-Show</p>
              <p className="text-2xl font-bold text-slate-200 font-mono tabular-nums mt-1.5">
                {cancelStats.noShowCount}
              </p>
            </div>
          </div>

          {/* Specialist Performance & Service Popularity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10">
                <h3 className="text-base font-bold text-white">Specialist Performance Leaderboard</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Booking volume, completed consultations, and scheduled value by specialist
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3 px-4 font-medium">Specialist</th>
                      <th className="py-3 px-4 font-medium text-right">Bookings</th>
                      <th className="py-3 px-4 font-medium text-right">Completed</th>
                      <th className="py-3 px-4 font-medium text-right">Value</th>
                      <th className="py-3 px-4 font-medium text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {profPerf.map((row) => (
                      <tr key={row.id} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white">{row.professional_name}</p>
                          <p className="text-[11px] text-slate-400">{row.specialty}</p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                          {row.total_bookings}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-indigo-300">
                          {row.completed_count || 0}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                          ${Number(row.revenue || 0).toFixed(0)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-300">
                          {Number(row.rating_avg || 5).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10">
                <h3 className="text-base font-bold text-white">Most Popular Services</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Top-booked services across all active practices in SQLite
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400 bg-slate-950/40">
                    <tr>
                      <th className="py-3 px-4 font-medium">Service</th>
                      <th className="py-3 px-4 font-medium text-right">Fee</th>
                      <th className="py-3 px-4 font-medium text-right">Bookings</th>
                      <th className="py-3 px-4 font-medium text-right">Gross Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {srvPop.map((srv) => (
                      <tr key={srv.id} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-white">{srv.service_name}</p>
                          <p className="text-[11px] text-slate-400">{srv.professional_name}</p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                          ${Number(srv.price || 0).toFixed(0)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-indigo-300">
                          {srv.booking_count}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                          ${Number(srv.revenue || 0).toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: ACTIVITY LOGS & CONTACT INQUIRIES */}
      {!initialLoading && activeTab === 'activities' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Platform Activity Audit Log</h2>
            <div className="divide-y divide-white/10 max-h-[540px] overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400 font-mono">
                    <span className="text-indigo-300">{l.action}</span>
                    <span>{l.created_at}</span>
                  </div>
                  <p className="text-slate-200">{l.details}</p>
                  <p className="text-slate-500">
                    Actor: {l.actor_name || 'System'} ({l.actor_role})
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Contact Us Inquiries</h2>
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-400">
                No inquiries submitted via Contact Us page yet.
              </p>
            ) : (
              <div className="divide-y divide-white/10 max-h-[540px] overflow-y-auto">
                {contacts.map((c) => (
                  <div key={c.id} className="py-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{c.full_name}</span>
                      <span className="font-mono text-slate-500">{c.created_at}</span>
                    </div>
                    <p className="text-indigo-300">{c.subject}</p>
                    <p className="text-slate-300 leading-relaxed">{c.message}</p>
                    <p className="text-slate-500">{c.email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPLICATION DETAILS MODAL */}
      {selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
                  <span className="text-indigo-300">Request #{selectedApplication.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>User #{selectedApplication.user_id}</span>
                  <span aria-hidden="true">·</span>
                  <StatusIndicator status={selectedApplication.status} />
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedApplication.full_name}
                </h3>
                <p className="text-xs text-indigo-300">
                  {selectedApplication.title} — {selectedApplication.specialty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApplication(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Email Address</span>
                <p className="text-white font-medium">{selectedApplication.email}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Phone Number</span>
                <p className="text-white font-mono tabular-nums">
                  {selectedApplication.phone || 'Not provided'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Requested Role / Category</span>
                <p className="text-white font-medium">
                  {selectedApplication.requested_role} ·{' '}
                  {selectedApplication.category_name || 'General Practice'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Experience & Consultation Fee</span>
                <p className="text-white font-mono tabular-nums">
                  {selectedApplication.experience_years} yrs · $
                  {Number(selectedApplication.consultation_fee).toFixed(0)} USD
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1 sm:col-span-2">
                <span className="text-slate-400">Practice Location</span>
                <p className="text-white">{selectedApplication.location || 'Main Practice Suite'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1 sm:col-span-2">
                <span className="text-slate-400">Submitted Credentials & Biography</span>
                <p className="text-slate-200 leading-relaxed whitespace-pre-line">
                  {selectedApplication.bio || 'No biography provided.'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Submitted At</span>
                <p className="text-white font-mono tabular-nums">
                  {selectedApplication.created_at}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1">
                <span className="text-slate-400">Review Audit</span>
                <p className="text-white font-mono tabular-nums">
                  {selectedApplication.reviewed_at
                    ? `${selectedApplication.reviewer_name || 'Admin'} at ${
                        selectedApplication.reviewed_at
                      }`
                    : 'Awaiting review'}
                </p>
              </div>
            </div>

            {selectedApplication.status === 'REJECTED' && selectedApplication.rejection_reason && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                <span className="font-semibold">Recorded Rejection Reason:</span>{' '}
                {selectedApplication.rejection_reason}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              {selectedApplication.status !== 'APPROVED' && (
                <button
                  type="button"
                  disabled={actionBusyId === selectedApplication.id}
                  onClick={() => handleApproveApplication(selectedApplication.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  Approve Application
                </button>
              )}
              {selectedApplication.status !== 'REJECTED' && (
                <button
                  type="button"
                  disabled={actionBusyId === selectedApplication.id}
                  onClick={() => {
                    setRejectTarget(selectedApplication);
                    setRejectReason(selectedApplication.rejection_reason || '');
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  Reject Application
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedApplication(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT APPLICATION REASON MODAL */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="glass-panel rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Reject Application #{rejectTarget.id}
                </h3>
                <p className="text-xs text-slate-400">
                  {rejectTarget.full_name} · {rejectTarget.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRejectApplication} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Rejection Reason (saved to SQLite & shared with applicant) *
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Board license number or institutional verification document missing..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                />
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={actionBusyId === rejectTarget.id}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {actionBusyId === rejectTarget.id ? 'Saving Decision...' : 'Confirm Rejection'}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
