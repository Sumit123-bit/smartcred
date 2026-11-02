import React, { useState } from 'react';
import { CheckCircle2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { api, extractApiError } from '../lib/api';

export const ContactPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const res = await api.post<{ message: string }>('/public/contact', {
        fullName,
        email,
        subject,
        message,
      });
      setSuccessMsg(res.data.message);
      setFullName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(extractApiError(err, 'Failed to submit inquiry.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-14">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-medium text-indigo-400 tracking-wide mb-3">Support & Inquiries</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white">Contact SmartCred</h1>
        <p className="mt-3 text-sm sm:text-base text-slate-400 leading-relaxed">
          Have questions about practice onboarding, enterprise scheduling, or appointment
          verification? Send a message directly to our administrative desk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-white mb-6">Send a Message</h2>

          {error && (
            <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ananya Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ananya@organization.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Subject *</label>
              <input
                type="text"
                required
                minLength={3}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Practice Onboarding / Booking Support"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Message *</label>
              <textarea
                required
                minLength={10}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us how we can assist with your scheduling or verification requirements..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Saving Inquiry...' : 'Submit Inquiry'}</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-5">
            <h2 className="text-lg font-bold text-white">Administrative Operations</h2>
            <div className="space-y-4 text-sm text-slate-300">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />
                <div>
                  <p className="font-medium text-white">Support Desk</p>
                  <p className="text-slate-400">support@smartcred.demo</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />
                <div>
                  <p className="font-medium text-white">Operations Line</p>
                  <p className="text-slate-400 font-mono tabular-nums">+91 (022) 4890-1200</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-1" />
                <div>
                  <p className="font-medium text-white">Headquarters</p>
                  <p className="text-slate-400">
                    Level 8, One BKC Corporate Pavilion, Mumbai 400051
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-white/10 text-xs text-slate-400">
              All submitted messages are persisted directly in SQLite and visible inside the Admin
              Dashboard Activity & Inquiries tab.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
