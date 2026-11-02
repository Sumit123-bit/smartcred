import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Star, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import type { ProfessionalSummary, ServiceCategory } from '../lib/types';
import { AvatarImage } from '../components/AvatarImage';

export const ExplorePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [sortBy, setSortBy] = useState('rating');

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
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    params.set('sort', sortBy);

    api
      .get<{ professionals: ProfessionalSummary[] }>(`/public/professionals?${params.toString()}`)
      .then((res) => setProfessionals(res.data.professionals))
      .finally(() => setLoading(false));
  }, [search, selectedCategory, sortBy]);

  const handleCategorySelect = (slug: string) => {
    setSelectedCategory(slug);
    const next = new URLSearchParams(searchParams);
    if (slug === 'all') next.delete('category');
    else next.set('category', slug);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">Explore Verified Professionals</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400">
          Search specialists by discipline, location, or consultation fee and book directly against
          live SQLite availability.
        </p>
      </div>

      {/* Search & Sort Controls */}
      <div className="mt-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, specialty, title, or city..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="sort-pros" className="text-xs text-slate-400 whitespace-nowrap">
            Sort by
          </label>
          <select
            id="sort-pros"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="rating">Highest Rated</option>
            <option value="experience">Most Experienced</option>
            <option value="price_asc">Consultation Fee: Low to High</option>
            <option value="price_desc">Consultation Fee: High to Low</option>
          </select>
        </div>
      </div>

      {/* Interactive Segmented Category Filter */}
      <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-2">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/10">
          <button
            type="button"
            onClick={() => handleCategorySelect('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Specialties
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySelect(cat.slug)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === cat.slug
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Grid */}
      {loading ? (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel rounded-2xl p-6 h-64 animate-pulse" />
          ))}
        </div>
      ) : professionals.length === 0 ? (
        <div className="mt-10 glass-panel rounded-2xl p-12 text-center">
          <p className="text-base font-medium text-white">No professionals match your filter</p>
          <p className="text-sm text-slate-400 mt-1">
            Try clearing your search query or switching back to All Specialties.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              handleCategorySelect('all');
            }}
            className="mt-5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map((pro) => (
            <div
              key={pro.id}
              className="glass-panel rounded-2xl p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-colors"
            >
              <div>
                <div className="flex items-start gap-4">
                  <AvatarImage src={pro.avatar_url} name={pro.full_name} sizeClass="w-16 h-16" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 truncate">
                      {pro.category_name || 'Verified Specialist'}
                    </p>
                    <h2 className="text-lg font-semibold text-white truncate mt-0.5">
                      {pro.full_name}
                    </h2>
                    <p className="text-xs text-indigo-300 truncate mt-0.5">{pro.title}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 tabular-nums">
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {Number(pro.rating_avg).toFixed(1)} ({pro.review_count})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{pro.experience_years} years experience</span>
                  <span aria-hidden="true">·</span>
                  <span>{pro.service_count || 0} active services</span>
                </div>

                <p className="mt-3 text-sm text-slate-300 line-clamp-3 leading-relaxed">
                  {pro.bio}
                </p>

                {pro.location && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{pro.location}</span>
                  </p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 block">Starting Fee</span>
                  <span className="text-lg font-bold text-white font-mono tabular-nums">
                    ${Number(pro.consultation_fee).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Link
                    to={`/professionals/${pro.id}`}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    Details
                  </Link>
                  <Link
                    to={`/book?professionalId=${pro.id}`}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
                  >
                    Book Now
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
