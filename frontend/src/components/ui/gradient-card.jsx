import React from 'react';
import { cn } from '../../lib/utils';

/**
 * GradientCard — glow-ray glass card (JS port of the 21st.dev glow card,
 * adapted for InFlow). A rotating light ray, a glowing dot that travels the
 * border, and inset gradient frame lines sit behind icon + title + description
 * content. Drop-in: keeps the icon / title / description / badge / className API.
 */
export const GradientCard = ({ icon: Icon, title, description, badge, className }) => {
  return (
    <div className={cn('glow-outer group', className)}>
      <span className="glow-dot" aria-hidden />
      <div className="glow-card">
        <span className="glow-ray" aria-hidden />
        <span className="glow-line glow-topl" aria-hidden />
        <span className="glow-line glow-leftl" aria-hidden />
        <span className="glow-line glow-bottoml" aria-hidden />
        <span className="glow-line glow-rightl" aria-hidden />

        <div className="relative z-10 flex h-full flex-col p-6 sm:p-7">
          {Icon && (
            <div
              className="relative mb-5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full"
              style={{
                background: 'linear-gradient(225deg, #171c2c 0%, #121624 100%)',
                boxShadow:
                  '0 6px 12px -2px rgba(0,0,0,0.25), inset 1px 1px 3px rgba(255,255,255,0.12), inset -2px -2px 4px rgba(0,0,0,0.5)',
              }}
            >
              <div
                aria-hidden
                className="absolute left-0 top-0 h-2/3 w-2/3 opacity-40"
                style={{ background: 'radial-gradient(circle at top left, rgba(255,255,255,0.5), transparent 80%)', filter: 'blur(10px)' }}
              />
              <Icon className="relative z-10 h-5 w-5 text-white" />
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xl font-medium text-white" style={{ fontFamily: 'Outfit', letterSpacing: '-0.01em' }}>
              {title}
            </h3>
            {badge && (
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-gray-300/80">{description}</p>
        </div>
      </div>
    </div>
  );
};
