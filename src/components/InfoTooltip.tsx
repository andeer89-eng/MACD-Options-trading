import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';

export interface InfoTooltipProps {
  title: string;
  summary: string;
  strategyImpact?: string;
  label?: string;
  align?: 'left' | 'center' | 'right';
  position?: 'top' | 'bottom';
  ariaLabel?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  title,
  summary,
  strategyImpact,
  label,
  align = 'center',
  position = 'bottom',
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const updateCoords = useCallback(() => {
    const el = btnRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);

    let left =
      align === 'left'
        ? rect.left
        : align === 'right'
        ? rect.right - width
        : rect.left + rect.width / 2 - width / 2;

    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

    const preferTop = position === 'top' || rect.bottom + 180 > window.innerHeight;
    const top = preferTop ? Math.max(12, rect.top - 8) : rect.bottom + 8;

    setCoords({ top, left });
  }, [align, position]);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScrollOrResize = () => updateCoords();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateCoords]);

  const showAbove =
    open &&
    btnRef.current &&
    (position === 'top' || btnRef.current.getBoundingClientRect().bottom + 180 > window.innerHeight);

  return (
    <span
      className="relative inline-flex items-center gap-1 align-middle"
      onMouseEnter={() => {
        updateCoords();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {label && <span>{label}</span>}
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel || `Explicație: ${title}`}
        aria-expanded={open}
        onFocus={() => {
          updateCoords();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          updateCoords();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center justify-center rounded-full text-zinc-500 hover:text-emerald-400 focus:text-emerald-400 focus:outline-none transition p-0.5 shrink-0"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && coords && (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: 'min(320px, calc(100vw - 24px))',
            transform: showAbove ? 'translateY(-100%)' : undefined,
          }}
          className="pointer-events-none z-50 rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2.5 text-left shadow-2xl normal-case tracking-normal font-sans"
        >
          <span className="block text-[11px] font-bold text-zinc-100 leading-snug">
            {title}
          </span>
          <span className="mt-1 block text-[11px] font-normal text-zinc-300 leading-relaxed">
            {summary}
          </span>
          {strategyImpact && (
            <span className="mt-1.5 pt-1.5 border-t border-zinc-800 block text-[10px] font-medium text-emerald-400 leading-relaxed">
              Integrare strategie (1D): {strategyImpact}
            </span>
          )}
        </span>
      )}
    </span>
  );
};
