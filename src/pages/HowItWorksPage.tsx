import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Compass,
  QrCode,
  Shield,
  Sliders,
} from 'lucide-react';

const TOUR_SLIDES = [
  {
    step: '01',
    title: 'Discover Trusted Professionals',
    subtitle: 'Verified directory with transparent ratings, experience, and fees',
    description:
      'Search and filter administrator-approved specialists across healthcare, legal advisory, financial planning, and executive consulting. Inspect real client reviews, working schedules, and service durations before booking.',
    highlights: [
      'Filter by specialty category, experience, fee range, or verified rating',
      'Inspect live weekly availability windows and daily break schedules',
      'Every listed practitioner is vetted through Admin Governance',
    ],
    ctaLabel: 'Explore Directory',
    ctaLink: '/explore',
    icon: Compass,
  },
  {
    step: '02',
    title: 'Book Appointments Easily',
    subtitle: 'Conflict-safe 7-step scheduling powered by atomic SQLite transactions',
    description:
      'Choose a consultation service, pick any date on our quick calendar strip, and select an open time window computed directly from SQLite. Double bookings, break overlaps, and blocked dates are prevented automatically.',
    highlights: [
      'Real-time slot calculation tailored to exact service duration',
      'Instant multi-channel notifications (In-App, Email, SMS, WhatsApp)',
      'Reschedule or cancel anytime from your Client Portal to release slots',
    ],
    ctaLabel: 'Launch 7-Step Booking',
    ctaLink: '/book',
    icon: CalendarCheck,
  },
  {
    step: '03',
    title: 'Instant QR Check-In',
    subtitle: 'Zero-PII cryptographic arrival pass & browser camera scanner',
    description:
      'Every confirmed booking issues a tamper-evident SCQR.v1 verification pass. Download the PNG, print it, or share it from your browser—your specialist scans it via webcam or uploaded image for 1-second check-in.',
    highlights: [
      'Zero personal information embedded inside the QR payload',
      'SHA-256 token hash matched against SQLite with ownership validation',
      'Automatic duplicate-scan protection once checked in',
    ],
    ctaLabel: 'Sign In to Portal',
    ctaLink: '/login',
    icon: QrCode,
  },
];

export const HowItWorksPage: React.FC = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const currentSlide = TOUR_SLIDES[activeSlide];
  const SlideIcon = currentSlide.icon;

  return (
    <div className="max-w-7xl mx-auto px-6 py-14 space-y-16">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-indigo-400 tracking-wide mb-3">Platform Workflow</p>
        <h1
          style={{ textWrap: 'balance' }}
          className="text-3xl sm:text-5xl font-bold text-white leading-tight"
        >
          How SmartCred Connects Clients, Specialists, and Administrators
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
          Every stage of the appointment lifecycle—from real-time slot computation to QR arrival
          check-in—executes directly against persistent SQLite records.
        </p>
      </div>

      {/* Interactive 3-Stage Walkthrough */}
      <section className="glass-panel rounded-2xl p-6 sm:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-medium text-indigo-400">Interactive Guided Tour</p>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
              Experience SmartCred in Three Steps
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 w-fit">
            {TOUR_SLIDES.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeSlide === idx
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Step {s.step}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-indigo-300">
              <span>Stage {currentSlide.step} / 03</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400 font-sans">{currentSlide.subtitle}</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-bold text-white">{currentSlide.title}</h3>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {currentSlide.description}
            </p>

            <ul className="space-y-2.5 pt-1 text-sm text-slate-200">
              {currentSlide.highlights.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-indigo-400 mt-0.5">
                    0{idx + 1}.
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-slate-950/60 border border-white/10 p-6 sm:p-8 flex flex-col justify-between min-h-[250px]">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                <SlideIcon className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Ready to try Step {currentSlide.step}?</p>
                <p className="text-base font-semibold text-white mt-1">{currentSlide.title}</p>
              </div>
            </div>

            <div className="pt-6 space-y-4">
              <Link
                to={currentSlide.ctaLink}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <span>{currentSlide.ctaLabel}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={activeSlide === 0}
                  onClick={() => setActiveSlide((prev) => Math.max(0, prev - 1))}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-35 transition-colors whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {activeSlide + 1} of {TOUR_SLIDES.length}
                </span>
                <button
                  type="button"
                  disabled={activeSlide === TOUR_SLIDES.length - 1}
                  onClick={() =>
                    setActiveSlide((prev) => Math.min(TOUR_SLIDES.length - 1, prev + 1))
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-35 transition-colors whitespace-nowrap"
                >
                  <span>Next Step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7-Step Client Booking Engine Flow */}
      <section>
        <div className="flex items-center gap-2.5 mb-6">
          <CalendarCheck className="w-5 h-5 text-indigo-400" />
          <h2 className="text-2xl font-bold text-white">For Clients: 7-Step Booking Engine</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              num: '01. Choose Specialist',
              body: 'Browse approved professionals by specialty, experience, rating, and location.',
            },
            {
              num: '02. Choose Service',
              body: 'Select the exact consultation format with transparent duration and pricing.',
            },
            {
              num: '03. Pick Calendar Date',
              body: 'Select your target appointment date; blocked dates are automatically flagged.',
            },
            {
              num: '04. Query Live SQLite Slots',
              body: 'Server computes open windows factoring in working hours, breaks, and existing bookings.',
            },
            {
              num: '05. Add Preparation Notes',
              body: 'Attach consultation context, questions, or goals for your assigned specialist.',
            },
            {
              num: '06. Review Summary',
              body: 'Verify specialist, date, time window, and total consultation fee before committing.',
            },
            {
              num: '07. Confirm & Share QR Pass',
              body: 'Receive your unique SC booking ID, multi-channel notifications, and downloadable QR pass.',
            },
          ].map((s) => (
            <div key={s.num} className="glass-panel rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-white">{s.num}</h3>
              <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For Professionals & Administrators */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 border-t border-white/[0.06]">
        <div className="glass-panel rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">For Professionals</h2>
          </div>
          <ul className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <li>
              <strong className="text-white">01. Service Catalog Control:</strong> Add, edit, or
              archive consultation services with custom durations (15–480 min) and fees.
            </li>
            <li>
              <strong className="text-white">02. Granular Availability:</strong> Set working days,
              shift hours, daily break windows, holiday date blocks, and custom slot blocks.
            </li>
            <li>
              <strong className="text-white">03. Booking Decisions:</strong> Accept pending
              requests, reject with explanation, or mark sessions Completed or No Show.
            </li>
            <li>
              <strong className="text-white">04. Browser Camera QR Scanner:</strong> Scan client QR
              passes via live camera or uploaded PNG image to verify ownership and prevent duplicate
              check-ins.
            </li>
          </ul>
        </div>

        <div className="glass-panel rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">For Platform Administrators</h2>
          </div>
          <ul className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <li>
              <strong className="text-white">01. Specialist Governance:</strong> Approve or reject
              new professional applications, feature top practitioners, or onboard specialists
              directly.
            </li>
            <li>
              <strong className="text-white">02. Live SQLite Analytics:</strong> Track booking
              volume, gross & realized revenue, check-in rates, and category distribution.
            </li>
            <li>
              <strong className="text-white">03. User & Category Control:</strong> Manage user
              statuses, service categories, and platform-wide appointment statuses.
            </li>
            <li>
              <strong className="text-white">04. Scheduled Reports & CSV Export:</strong> Generate
              Daily, Weekly, and Monthly SQLite reports with specialist performance leaderboards and
              one-click CSV export.
            </li>
          </ul>
        </div>
      </section>

      {/* QR Security Callout */}
      <section className="glass-panel rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4 max-w-2xl">
          <QrCode className="w-10 h-10 text-indigo-400 shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-white">Try the Full Lifecycle Right Now</h3>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">
              Sign in with the demo Client, Professional, or Admin account—or register your own
              account—to test live SQLite slot booking, QR pass generation, and scanner check-in.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link
            to="/book"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold whitespace-nowrap"
          >
            <span>Start Booking</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-sm font-medium whitespace-nowrap"
          >
            Demo Sign In
          </Link>
        </div>
      </section>
    </div>
  );
};
