import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Footer: React.FC = () => {
  const { user, getDashboardPath } = useAuth();

  return (
    <footer className="border-t border-white/10 bg-[#060912] mt-24">
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1 space-y-3">
            <Link to="/" className="text-xl font-bold tracking-tight text-white inline-block">
              SmartCred
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed">
              Verified professional scheduling, real-time SQLite slot availability, and
              cryptographic QR check-in management.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Directory & Booking</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <Link to="/explore" className="hover:text-white transition-colors">
                  Explore Professionals
                </Link>
              </li>
              <li>
                <Link to="/services" className="hover:text-white transition-colors">
                  Services Catalog
                </Link>
              </li>
              <li>
                <Link to="/book" className="hover:text-white transition-colors">
                  Book Appointment
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="hover:text-white transition-colors">
                  How It Works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Organization</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Account Portals</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              {user ? (
                <li>
                  <Link to={getDashboardPath()} className="hover:text-white transition-colors">
                    Open {user.role.charAt(0) + user.role.slice(1).toLowerCase()} Dashboard
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login" className="hover:text-white transition-colors">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className="hover:text-white transition-colors">
                      Create Client Account
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/register?role=PROFESSIONAL"
                      className="hover:text-white transition-colors"
                    >
                      Apply as a Professional
                    </Link>
                  </li>
                </>
              )}
              <li>
                <Link to="/how-it-works" className="hover:text-white transition-colors">
                  Interactive Platform Tour
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} SmartCred Appointment Management System. All rights reserved.</p>
          <p>Encrypted JWT Sessions · QR Check-In Verification · Persistent SQLite Engine</p>
        </div>
      </div>
    </footer>
  );
};
