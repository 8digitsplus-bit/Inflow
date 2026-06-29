import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Glass pricing-card primitives (JS port of the 21st.dev card block, themed for
 * InFlow's dark glass aesthetic — translucent surfaces, backdrop blur, soft
 * white borders and a top glass gradient instead of solid indigo accents).
 */

export function Card({ className, featured = false, ...props }) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col rounded-2xl p-1.5 shadow-xl backdrop-blur-xl transition-all duration-300',
        'border border-white/10 bg-white/[0.04] hover:bg-white/[0.06]',
        featured && 'border-white/25 bg-white/[0.07] shadow-2xl shadow-black/40 ring-1 ring-white/10',
        className,
      )}
      {...props}
    />
  );
}

export function Header({ className, children, glassEffect = true, ...props }) {
  return (
    <div
      className={cn('relative mb-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] p-5', className)}
      {...props}
    >
      {glassEffect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 rounded-[inherit]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function Plan({ className, ...props }) {
  return <div className={cn('mb-6 flex items-center justify-between gap-2', className)} {...props} />;
}

export function PlanName({ className, ...props }) {
  return <div className={cn('flex items-center gap-2 text-sm font-medium text-zinc-300', className)} {...props} />;
}

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn('rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/80', className)}
      {...props}
    />
  );
}

export function Price({ className, ...props }) {
  return <div className={cn('mb-2 flex items-end gap-2', className)} {...props} />;
}

export function MainPrice({ className, ...props }) {
  return (
    <span
      className={cn('text-4xl font-extrabold tracking-tight text-white', className)}
      style={{ fontFamily: 'Outfit' }}
      {...props}
    />
  );
}

export function Period({ className, ...props }) {
  return <span className={cn('pb-1 text-sm text-zinc-400', className)} {...props} />;
}

export function OriginalPrice({ className, ...props }) {
  return <span className={cn('pb-1 text-lg text-zinc-500 line-through', className)} {...props} />;
}

export function Description({ className, ...props }) {
  return <p className={cn('text-xs text-zinc-400', className)} {...props} />;
}

export function Body({ className, ...props }) {
  return <div className={cn('flex flex-1 flex-col p-4', className)} {...props} />;
}

export function List({ className, ...props }) {
  return <ul className={cn('space-y-3', className)} {...props} />;
}

export function ListItem({ className, ...props }) {
  return <li className={cn('flex items-start gap-3 text-sm text-zinc-300', className)} {...props} />;
}
