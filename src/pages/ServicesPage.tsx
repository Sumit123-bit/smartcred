import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Search, Star } from 'lucide-react';
import { api } from '../lib/api';
import type { ServiceCategory, ServiceItem } from '../lib/types';
import { AvatarImage } from '../components/AvatarImage';

export const ServicesPage: React.FC = () => {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');

  useEffect(() => {
    api
      .get<{ categories: ServiceCategory[] }>('/public/categories')
      .then((res) => setCategories(res.data.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (selectedCat !== 'all') params.set('category', selectedCat);

    api
      .get<{ services: ServiceItem[] }>(`/public/services?${params.toString()}`)
      .then((res) => setServices(res.data.services))
      .finally(() => setLoading(false));
  }, [search, selectedCat]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">Consultation Services</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400">
          Compare structured consultation sessions, exact durations, and transparent pricing across
          all approved specialists.
        </p>
      </div>

      <div className="mt-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter services by title, topic, or specialist..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Category Filter */}
      <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-2">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/10">
          <button
            type="button"
            onClick={() => setSelectedCat('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedCat === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCat(c.slug)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === c.slug
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel rounded-2xl p-6 h-56 animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="mt-8 glass-panel rounded-2xl p-12 text-center">
          <p className="text-base font-medium text-white">No matching services found</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectedCat('all');
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((srv) => (
            <div
              key={srv.id}
              className="glass-panel rounded-2xl p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{srv.category_name || 'Advisory'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    {srv.duration_minutes} min
                  </span>
                </div>

                <h2 className="text-lg font-semibold text-white mt-2">{srv.name}</h2>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed line-clamp-3">
                  {srv.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <AvatarImage
                    src={srv.professional_avatar}
                    name={srv.professional_name || 'Specialist'}
                    sizeClass="w-10 h-10"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/professionals/${srv.professional_id}`}
                      className="text-sm font-medium text-white hover:text-indigo-300 truncate block"
                    >
                      {srv.professional_name}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="truncate">{srv.specialty}</span>
                      {srv.rating_avg && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-0.5 text-amber-400 tabular-nums">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {Number(srv.rating_avg).toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xl font-bold text-white font-mono tabular-nums">
                    ${Number(srv.price).toFixed(0)}
                  </span>
                  <Link
                    to={`/book?professionalId=${srv.professional_id}&serviceId=${srv.id}`}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    Book Service
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
