import React, { useEffect, useState } from 'react';
import { Download, Copy, Check, X, ShieldCheck, Share2, Printer } from 'lucide-react';
import { api, extractApiError } from '../lib/api';
import { StatusIndicator } from './StatusIndicator';

interface QrPassData {
  bookingCode: string;
  status: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  professionalName: string;
  location: string;
  qrVerifiedAt: string | null;
  qrDataUrl: string;
  qrVerificationToken: string;
}

interface QrPassModalProps {
  appointmentId: number | null;
  onClose: () => void;
}

export const QrPassModal: React.FC<QrPassModalProps> = ({ appointmentId, onClose }) => {
  const [data, setData] = useState<QrPassData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState('');

  useEffect(() => {
    if (!appointmentId) return;
    setLoading(true);
    setError('');
    setData(null);
    setSharedFeedback('');

    api
      .get<QrPassData>(`/appointments/${appointmentId}/qr`)
      .then((res) => setData(res.data))
      .catch((err) => setError(extractApiError(err, 'Unable to load QR verification pass.')))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  if (!appointmentId) return null;

  const handleDownload = () => {
    if (!data) return;
    const link = document.createElement('a');
    link.href = data.qrDataUrl;
    link.download = `${data.bookingCode}-smartcred-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyToken = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.qrVerificationToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleSharePass = async () => {
    if (!data) return;
    const shareText = `SmartCred Appointment Pass (${data.bookingCode}) — ${data.serviceName} with ${data.professionalName} on ${data.appointmentDate} at ${data.startTime}. Verification Token: ${data.qrVerificationToken}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `SmartCred QR Pass — ${data.bookingCode}`,
          text: shareText,
        });
        setSharedFeedback('Pass shared successfully.');
      } else {
        await navigator.clipboard.writeText(shareText);
        setSharedFeedback('Pass summary copied to clipboard.');
      }
      setTimeout(() => setSharedFeedback(''), 2500);
    } catch {
      // User dismissed share sheet
    }
  };

  const handlePrintPass = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl w-full max-w-md p-6 relative">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-semibold text-white">Appointment QR Check-In Pass</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Zero-PII cryptographic token verified against SQLite
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors no-print"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-slate-400">
            Generating encrypted QR verification pass...
          </div>
        )}

        {error && (
          <div className="my-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
            {error}
          </div>
        )}

        {data && (
          <div className="mt-5 space-y-5">
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <img
                  src={data.qrDataUrl}
                  alt={`QR Pass for booking ${data.bookingCode}`}
                  referrerPolicy="no-referrer"
                  className="w-52 h-52 object-contain"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                <span>{data.bookingCode}</span>
                <span aria-hidden="true">·</span>
                <StatusIndicator status={data.status} />
              </div>
            </div>

            <div className="space-y-2 text-sm border-t border-white/10 pt-4">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Professional</span>
                <span className="text-slate-100 font-medium text-right">{data.professionalName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Service</span>
                <span className="text-slate-200 text-right">{data.serviceName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Schedule</span>
                <span className="text-slate-200 font-mono tabular-nums">
                  {data.appointmentDate} · {data.startTime}–{data.endTime}
                </span>
              </div>
              {data.location && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">Practice Suite</span>
                  <span className="text-slate-300 text-right">{data.location}</span>
                </div>
              )}
              {data.qrVerifiedAt && (
                <div className="flex items-center justify-between gap-4 pt-1 text-sky-300 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Checked in
                  </span>
                  <span className="font-mono tabular-nums">{data.qrVerifiedAt}</span>
                </div>
              )}
            </div>

            {sharedFeedback && (
              <p className="text-xs text-emerald-300 text-center">{sharedFeedback}</p>
            )}

            <div className="pt-2 space-y-2 no-print">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Download QR PNG</span>
                </button>
                <button
                  onClick={handleSharePass}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Share Pass</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopyToken}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Token Copied' : 'Copy Token'}</span>
                </button>
                <button
                  onClick={handlePrintPass}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Pass</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
