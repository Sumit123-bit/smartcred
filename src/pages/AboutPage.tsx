import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, QrCode, ShieldCheck, Users } from 'lucide-react';
import { api } from '../lib/api';

export const AboutPage: React.FC = () => {
  const [stats, setStats] = useState({
    approvedProfessionals: 4,
    activeServices: 9,
    totalBookings: 7,
    averageRating: 4.93,
  });

  useEffect(() => {
    api
      .get('/public/stats')
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-14 space-y-16">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-indigo-400 tracking-wide mb-3">About SmartCred</p>
        <h1
          style={{ textWrap: 'balance' }}
          className="text-3xl sm:text-5xl font-bold text-white leading-tight"
        >
          Eliminating Scheduling Friction with Verified Credentials and Real-Time Slot Integrity
        </h1>
        <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed">
          SmartCred was designed to replace fragmented phone bookings, spreadsheet calendars, and
          unverified reception check-ins with a unified, persistent scheduling infrastructure built
          for medical specialists, legal counsel, architects, and advisory practices.
        </p>
      </div>

      {/* Live SQLite Platform Counters */}
      <div className="glass-panel rounded-2xl p-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-3xl font-bold text-white font-mono tabular-nums">
            {stats.approvedProfessionals}
          </p>
          <p className="text-xs text-slate-400 mt-1">Approved Specialists</p>
        </div>
        <div className="lg:border-l lg:border-white/10 lg:pl-6">
          <p className="text-3xl font-bold text-white font-mono tabular-nums">
            {stats.activeServices}
          </p>
          <p className="text-xs text-slate-400 mt-1">Structured Services</p>
        </div>
        <div className="lg:border-l lg:border-white/10 lg:pl-6">
          <p className="text-3xl font-bold text-white font-mono tabular-nums">
            {stats.totalBookings}
          </p>
          <p className="text-xs text-slate-400 mt-1">SQLite Ledger Bookings</p>
        </div>
        <div className="lg:border-l lg:border-white/10 lg:pl-6">
          <p className="text-3xl font-bold text-white font-mono tabular-nums">
            {Number(stats.averageRating).toFixed(2)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Mean Client Rating</p>
        </div>
      </div>

      {/* Architectural Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-8">
          <ShieldCheck className="w-6 h-6 text-indigo-400 mb-4" />
          <h2 className="text-xl font-semibold text-white">01. Administrator Credential Vetting</h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            Every specialist account undergoes administrative review before appearing in the public
            directory. Unverified applications remain isolated from public slot discovery until
            explicitly approved.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-8">
          <QrCode className="w-6 h-6 text-blue-400 mb-4" />
          <h2 className="text-xl font-semibold text-white">
            02. Privacy-Preserving QR Check-In
          </h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            Reception passes never expose client names, phone numbers, or clinical notes inside the
            barcode. Only an HMAC token is encoded, matched via SHA-256 hash in SQLite during
            authorized professional scanning.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-8">
          <Lock className="w-6 h-6 text-indigo-400 mb-4" />
          <h2 className="text-xl font-semibold text-white">03. Role-Segmented Security</h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            JWT access tokens, rotating HttpOnly refresh cookies, signed CSRF protection, and bcrypt
            password hashing enforce strict separation across Client, Professional, and Admin
            workspaces.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-8">
          <Users className="w-6 h-6 text-blue-400 mb-4" />
          <h2 className="text-xl font-semibold text-white">
            04. Persistent Relational Auditability
          </h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            Every status change, reschedule, notification attempt, and administrative decision is
            recorded in relational history tables for transparent operational reporting and CSV
            export.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="glass-panel rounded-2xl p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Ready to experience structured scheduling?</h2>
          <p className="text-sm text-slate-400 mt-1">
            Browse verified specialists or apply to manage your practice on SmartCred.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/book"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold whitespace-nowrap"
          >
            <span>Book Appointment</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/register?role=PROFESSIONAL"
            className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-sm font-medium whitespace-nowrap"
          >
            Join as Professional
          </Link>
        </div>
      </div>
    </div>
  );
};
