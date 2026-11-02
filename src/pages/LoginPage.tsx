import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, LogIn } from 'lucide-react';
import { useAuth, getDashboardPathForRole } from '../context/AuthContext';
import { api, extractApiError } from '../lib/api';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password Reset State
  const [resetMode, setResetMode] = useState<'none' | 'request' | 'confirm'>('none');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (redirectTarget && redirectTarget.startsWith('/')) {
        navigate(redirectTarget, { replace: true });
      } else {
        navigate(getDashboardPathForRole(user.role), { replace: true });
      }
    } catch (err) {
      setError(extractApiError(err, 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  };

  const quickDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo123');
    setError('');
    setLoading(true);
    try {
      const user = await login(demoEmail, 'demo123');
      if (redirectTarget && redirectTarget.startsWith('/')) {
        navigate(redirectTarget, { replace: true });
      } else {
        navigate(getDashboardPathForRole(user.role), { replace: true });
      }
    } catch (err) {
      setError(extractApiError(err, 'Demo login failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setLoading(true);
    try {
      const res = await api.post<{ message: string; demoResetToken?: string }>(
        '/auth/forgot-password',
        { email: resetEmail }
      );
      if (res.data.demoResetToken) {
        setResetToken(res.data.demoResetToken);
        setResetMessage(
          'Demo Mode (SMTP not configured): Reset token generated in SQLite and pre-filled below.'
        );
      } else {
        setResetMessage(res.data.message);
      }
      setResetMode('confirm');
    } catch (err) {
      setError(extractApiError(err, 'Failed to request password reset.'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/auth/reset-password', {
        token: resetToken,
        newPassword,
      });
      setResetMessage(res.data.message);
      setEmail(resetEmail);
      setPassword('');
      setResetMode('none');
    } catch (err) {
      setError(extractApiError(err, 'Failed to reset password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-14">
      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        {resetMode === 'none' ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Sign In to SmartCred</h1>
              <p className="text-sm text-slate-400 mt-1">
                Access your client bookings, professional schedule, or admin console.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {error}
              </div>
            )}

            {resetMessage && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                {resetMessage}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setError('');
                      setResetMode('request');
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Signing In...' : 'Sign In'}</span>
              </button>
            </form>

            {/* Demo Accounts Quick Access */}
            <div className="mt-7 pt-6 border-t border-white/10">
              <p className="text-xs font-medium text-slate-400 mb-3">
                Development Demo Accounts (Password: <span className="font-mono text-slate-200">demo123</span>)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => quickDemoLogin('user@smartcred.demo')}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-left flex items-center justify-between text-xs transition-colors"
                >
                  <span className="font-medium text-white">Client Portal</span>
                  <span className="font-mono text-slate-400">user@smartcred.demo</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => quickDemoLogin('professional@smartcred.demo')}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-left flex items-center justify-between text-xs transition-colors"
                >
                  <span className="font-medium text-white">Professional Portal</span>
                  <span className="font-mono text-slate-400">professional@smartcred.demo</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => quickDemoLogin('admin@smartcred.demo')}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-left flex items-center justify-between text-xs transition-colors"
                >
                  <span className="font-medium text-white">Admin Console</span>
                  <span className="font-mono text-slate-400">admin@smartcred.demo</span>
                </button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
              New to SmartCred?{' '}
              <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                Create an account
              </Link>
            </p>
          </>
        ) : resetMode === 'request' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold text-white">Reset Password</h2>
            </div>
            <p className="text-xs text-slate-400">
              Enter your registered email to generate a single-use 30-minute reset token in SQLite.
            </p>
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {error}
              </div>
            )}
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  {loading ? 'Generating...' : 'Send Reset Token'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetMode('none')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Set New Password</h2>
            {resetMessage && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                {resetMessage}
              </div>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {error}
              </div>
            )}
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Reset Token
                </label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  New Password (min 6 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setResetMode('none')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Back
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
