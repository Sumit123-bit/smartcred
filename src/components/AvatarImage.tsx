import React, { useState } from 'react';

interface AvatarImageProps {
  src?: string | null;
  name: string;
  className?: string;
  sizeClass?: string;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({
  src,
  name,
  className = '',
  sizeClass = 'w-12 h-12',
}) => {
  const [failed, setFailed] = useState(false);

  const initials = name
    .replace(/^(Dr\.|Mr\.|Ms\.|Prof\.)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (!src || failed) {
    return (
      <div
        aria-label={name}
        className={`${sizeClass} rounded-xl bg-gradient-to-br from-indigo-950 via-slate-800 to-blue-950 border border-white/10 flex items-center justify-center text-slate-200 font-semibold select-none shrink-0 ${className}`}
      >
        <span className="text-sm tracking-tight">{initials || 'SC'}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-xl object-cover border border-white/10 shrink-0 ${className}`}
    />
  );
};
