import React from 'react';
import { Card } from './card';
import { cn } from '../../lib/utils';

/**
 * GradientCard — centered animated glass card (JS port of the 21st.dev block,
 * adapted for InFlow). Animated light blobs, pinging icon rings, gradient title,
 * divider + bouncing dots. Drop-in: keeps the icon / title / description / badge /
 * className API. `description` accepts a string or an array of strings (lines).
 */
export const GradientCard = ({ icon: Icon, title, description, badge, className }) => {
  const lines = Array.isArray(description) ? description : [description];

  return (
    <div className="group h-full cursor-pointer transform transition-all duration-500 hover:scale-[1.03] hover:-rotate-1">
      <Card
        className={cn(
          'relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#010101] via-[#090909] to-[#010101] text-white shadow-2xl backdrop-blur-xl transition-all duration-500 hover:border-white/25 hover:shadow-white/5',
          className,
        )}
      >
        {/* Animated ambient layer */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/10 opacity-40 transition-opacity duration-500 group-hover:opacity-60" />
          <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-gradient-to-tr from-white/10 to-transparent opacity-30 blur-3xl transition-all duration-700 animate-bounce transform group-hover:scale-110 group-hover:opacity-50" />
          <div className="absolute left-10 top-10 h-16 w-16 rounded-full bg-white/5 blur-xl animate-ping" />
          <div className="absolute bottom-16 right-16 h-12 w-12 rounded-full bg-white/5 blur-lg animate-ping" />
          <div className="absolute inset-0 -skew-x-12 translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-[-200%]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center p-8 text-center">
          {Icon && (
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping" />
              <div className="absolute inset-0 rounded-full border border-white/10 animate-pulse" />
              <div className="relative rounded-full border border-white/20 bg-gradient-to-br from-black/80 to-black/60 p-6 shadow-2xl backdrop-blur-lg transition-all duration-500 transform group-hover:rotate-12 group-hover:scale-110">
                <div className="transform transition-transform duration-700 group-hover:rotate-180">
                  <Icon className="h-7 w-7 text-white" />
                </div>
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <h3
              className="bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-2xl font-bold text-transparent transition-transform duration-300 transform group-hover:scale-105"
              style={{ fontFamily: 'Outfit' }}
            >
              {title}
            </h3>
            {badge && (
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
          </div>

          <div className="max-w-sm space-y-1">
            {lines.map((line, idx) => (
              <p key={idx} className="text-sm leading-relaxed text-gray-300 transition-colors duration-300 group-hover:text-gray-200">
                {line}
              </p>
            ))}
          </div>

          <div className="mt-6 h-0.5 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white to-transparent transition-all duration-500 animate-pulse group-hover:h-1 group-hover:w-1/2" />

          <div className="mt-4 flex space-x-2 opacity-60 transition-opacity duration-300 group-hover:opacity-100">
            <div className="h-2 w-2 rounded-full bg-white animate-bounce" />
            <div className="h-2 w-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="h-2 w-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>

        {/* Corner accents on hover */}
        <div className="absolute left-0 top-0 h-20 w-20 rounded-br-3xl bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="absolute bottom-0 right-0 h-20 w-20 rounded-tl-3xl bg-gradient-to-tl from-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      </Card>
    </div>
  );
};
