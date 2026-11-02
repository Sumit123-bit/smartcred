import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth, getDashboardPathForRole } from '../context/AuthContext';
import { api, extractApiError } from '../lib/api';
import type { ServiceCategory } from '../lib/types';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialRole =
    searchParams.get('role') === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'USER';

  const [role, setRole] = useState<'USER' | 'PROFESSIONAL'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Professional fields
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [title, setTitle] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [experienceYears, setExperienceYears] = useState(5);
  const [location, setLocation] = useState('');
  const [consultationFee, setConsultationFee] = useState(150);
  const [bio, setBio] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ categories: ServiceCategory[] }>('/public/categories')
      .then((res) => {
        setCategories(res.data.categories);
        if (res.data.categories.length > 0) {
          setCategoryId(res.data.categories[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const created = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        role,
        ...(role === 'PROFESSIONAL'
          ? {
              title: title.trim(),
              specialty: specialty.trim(),
              categoryId: categoryId ? Number(categoryId) : categories[0]?.id,
              experienceYears: Number.isFinite(Number(experienceYears))
                ? Number(experienceYears)
                : 3,
              location: location.trim() || 'Main Practice Suite',
              consultationFee: Number.isFinite(Number(consultationFee))
                ? Number(consultationFee)
                : 120,
              bio: bio.trim(),
            }
          : {}),
      });
      navigate(getDashboardPathForRole(created.role), { replace: true });
    } catch (err) {
      setError(extractApiError(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-14">
      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-white">Create Your SmartCred Account</h1>
        <p className="text-sm text-slate-400 mt-1">
          Register as a client to book appointments, or apply as a verified specialist.
        </p>

        {/* Interactive Account Role Selector */}
        <div className="mt-5 grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-white/10">
          <button
            type="button"
            onClick={() => setRole('USER')}
            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
              role === 'USER' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Client Account
          </button>
          <button
            type="button"
            onClick={() => setRole('PROFESSIONAL')}
            className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
              role === 'PROFESSIONAL'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Professional Application
          </button>
        </div>

        {role === 'PROFESSIONAL' && (
          <p className="mt-3 text-xs text-amber-300/90">
            Note: New professional profiles require administrator approval before appearing publicly
            in the booking directory.
          </p>
        )}

        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={role === 'PROFESSIONAL' ? 'Dr. Kavita Rao, MD' : 'Riya Kapoor'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Phone Number (SMS/WhatsApp)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919820012345"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password (min 6 chars) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {role === 'PROFESSIONAL' && (
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Professional Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Senior Tax Counsel"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Primary Specialty *
                  </label>
                  <input
                    type="text"
                    required
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="Corporate & GST Structuring"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
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
                    Experience (Yrs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white font-mono tabular-nums"
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
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Practice Location / Suite
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Suite 210, Worli Business Tower, Mumbai"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Credentials & Practice Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Summarize your qualifications, focus areas, and consultation approach..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-sm text-white"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              {loading
                ? 'Creating Account...'
                : role === 'PROFESSIONAL'
                ? 'Submit Professional Application'
                : 'Create Client Account'}
            </span>
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Already registered?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
};
