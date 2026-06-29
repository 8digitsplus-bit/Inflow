import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * GradientCard — a premium 3D-tilt glass card (JS port of the 21st.dev block,
 * adapted for InFlow's CRA + framer-motion stack). Tracks the cursor for a
 * subtle 3D rotation and layers glass reflection, noise texture and a
 * purple/cyan glow. Renders any lucide icon passed via the `icon` prop.
 */
export const GradientCard = ({ icon: Icon, title, description, badge, className }) => {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setRotation({ x: -(y / rect.height) * 5, y: (x / rect.width) * 5 });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
  };

  const borderGlow = isHovered
    ? '0 0 20px 4px rgba(172,92,255,0.7), 0 0 30px 6px rgba(138,58,185,0.5), 0 0 40px 8px rgba(56,189,248,0.4)'
    : '0 0 14px 3px rgba(172,92,255,0.55), 0 0 24px 5px rgba(138,58,185,0.4), 0 0 34px 7px rgba(56,189,248,0.3)';

  return (
    <motion.div
      ref={cardRef}
      className={cn('relative h-full min-h-[340px] overflow-hidden rounded-[28px]', className)}
      style={{
        transformStyle: 'preserve-3d',
        backgroundColor: '#0e131f',
        boxShadow: '0 -10px 80px 8px rgba(78,99,255,0.14), 0 0 10px 0 rgba(0,0,0,0.5)',
      }}
      initial={{ y: 0 }}
      animate={{ y: isHovered ? -5 : 0, rotateX: rotation.x, rotateY: rotation.y, perspective: 1000 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Glass reflection overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 80%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Dark base */}
      <div aria-hidden className="absolute inset-0 z-0" style={{ background: 'linear-gradient(180deg, #000 0%, #000 70%)' }} />
      {/* Noise texture */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Purple/cyan glow */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 z-20 h-2/3 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(ellipse at bottom right, rgba(172,92,255,0.65) -10%, rgba(79,70,229,0) 70%), radial-gradient(ellipse at bottom left, rgba(56,189,248,0.65) -10%, rgba(79,70,229,0) 70%)',
          filter: 'blur(40px)',
          opacity: isHovered ? 0.9 : 0.72,
        }}
      />
      {/* Central glow */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 z-20 h-2/3 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle at bottom center, rgba(161,58,229,0.6) -20%, rgba(79,70,229,0) 60%)',
          filter: 'blur(45px)',
          opacity: isHovered ? 0.85 : 0.72,
          transform: 'translateY(10%)',
        }}
      />
      {/* Bottom border glow */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 z-25 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.05) 100%)',
          boxShadow: borderGlow,
        }}
      />

      {/* Content */}
      <div className="relative z-40 flex h-full flex-col p-6">
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
          {Icon && <Icon className="relative z-10 h-5 w-5 text-white" />}
        </div>

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
    </motion.div>
  );
};
