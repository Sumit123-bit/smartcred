import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin, Star } from 'lucide-react';
import { api, extractApiError } from '../lib/api';
import type {
  AvailabilityDay,
  ProfessionalSummary,
  ReviewItem,
  ServiceItem,
} from '../lib/types';
import { AvatarImage } from '../components/AvatarImage';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ProfessionalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [professional, setProfessional] = useState<ProfessionalSummary | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{
        professional: ProfessionalSummary;
        services: ServiceItem[];
        availability: AvailabilityDay[];
        reviews: ReviewItem[];
      }>(`/public/professionals/${id}`)
      .then((res) => {
        setProfessional(res.data.professional);
        setServices(res.data.services);
        setAvailability(res.data.availability);
        setReviews(res.data.reviews);
      })
      .catch((err) => setError(extractApiError(err, 'Failed to load professional profile.')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-slate-400">
          Loading professional credentials and schedule...
        </div>
      </div>
    );
  }

  if (error || !professional) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-base font-medium text-rose-300">{error || 'Profile not found'}</p>
          <Link
            to="/explore"
            className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <Link
        to="/explore"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Explore Professionals</span>
      </Link>

      {/* Top Profile Header */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <AvatarImage
              src={professional.avatar_url}
              name={professional.full_name}
              sizeClass="w-24 h-24"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{professional.category_name || 'Verified Practice'}</span>
                <span aria-hidden="true">·</span>
                <span>{professional.experience_years} Years Experience</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                {professional.full_name}
              </h1>
              <p className="text-sm text-indigo-300 mt-1">{professional.title}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 tabular-nums">
                <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                  <Star className="w-4 h-4 fill-amber-400" />
                  {Number(professional.rating_avg).toFixed(2)} ({professional.review_count} verified
                  reviews)
                </span>
                {professional.location && (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <MapPin className="w-3.5 h-3.5" />
                    {professional.location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Link
            to={`/book?professionalId=${professional.id}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Calendar className="w-4 h-4" />
            <span>Book Consultation</span>
          </Link>
        </div>

        <p className="mt-6 pt-6 border-t border-white/10 text-sm sm:text-base text-slate-300 leading-relaxed max-w-4xl">
          {professional.bio}
        </p>
      </div>

      {/* Main Content Split: Services & Reviews on Left, Weekly Hours on Right */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Services */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <h2 className="text-xl font-bold text-white mb-5">Available Services</h2>
            {services.length === 0 ? (
              <p className="text-sm text-slate-400">No active services listed at the moment.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {services.map((srv) => (
                  <div
                    key={srv.id}
                    className="py-5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 max-w-xl">
                      <h3 className="text-base font-semibold text-white">{srv.name}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{srv.description}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 pt-1 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{srv.duration_minutes} minutes</span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0">
                      <span className="text-xl font-bold text-white font-mono tabular-nums">
                        ${Number(srv.price).toFixed(0)}
                      </span>
                      <Link
                        to={`/book?professionalId=${professional.id}&serviceId=${srv.id}`}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        Select & Book
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client Reviews */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <h2 className="text-xl font-bold text-white mb-5">Verified Client Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-400">
                No client reviews yet. Completed appointments can leave verified feedback.
              </p>
            ) : (
              <div className="divide-y divide-white/10">
                {reviews.map((rev) => (
                  <div key={rev.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className="text-sm font-semibold text-white">{rev.client_name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-mono tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        {rev.rating}.0 / 5.0
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{rev.comment}</p>
                    <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
                      {rev.created_at.slice(0, 10)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Weekly Working Hours Sidebar */}
        <div className="lg:col-span-4">
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Weekly Practice Schedule</h2>
            <p className="text-xs text-slate-400 mb-5">
              Standard consultation hours and scheduled break intervals.
            </p>
            <div className="space-y-3 text-sm">
              {availability.map((day) => (
                <div
                  key={day.day_of_week}
                  className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.06] last:border-0"
                >
                  <span className="text-slate-300 font-medium">{DAY_NAMES[day.day_of_week]}</span>
                  {day.is_working ? (
                    <div className="text-right font-mono tabular-nums text-xs">
                      <p className="text-slate-100">
                        {day.start_time} – {day.end_time}
                      </p>
                      {day.break_start && day.break_end && (
                        <p className="text-slate-500 mt-0.5">
                          Break {day.break_start}–{day.break_end}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
