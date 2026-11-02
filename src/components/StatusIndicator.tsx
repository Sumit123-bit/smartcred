import React from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Award,
} from 'lucide-react';

interface StatusIndicatorProps {
  status: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const normalized = status.toUpperCase();

  if (normalized === 'CONFIRMED' || normalized === 'APPROVED' || normalized === 'SENT') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'CHECKED IN') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 whitespace-nowrap">
        <Award className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  if (normalized === 'PENDING' || normalized === 'DEMO_SIMULATED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{normalized === 'DEMO_SIMULATED' ? 'Demo Simulated' : status}</span>
      </span>
    );
  }

  if (normalized === 'NO SHOW') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{status}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};
