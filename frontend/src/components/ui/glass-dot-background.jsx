import { motion } from 'framer-motion';

/**
 * GlassDotBackground — lightweight, dependency-free animated dot-grid glass
 * backdrop (a CSS replacement for the WebGL shader). A masked dot matrix gently
 * pulses behind a soft glow and fades into the page background via a vignette.
 */
export const GlassDotBackground = () => (
  <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
    <motion.div
      className="absolute inset-0"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1.4px)',
        backgroundSize: '24px 24px',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 42%, #000 0%, transparent 75%)',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 42%, #000 0%, transparent 75%)',
      }}
      animate={{ opacity: [0.45, 0.85, 0.45] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
    {/* Soft central glow */}
    <div className="absolute left-1/2 top-[38%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-[120px]" />
    {/* Vignette into the page background */}
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 0%, #050507 78%)' }} />
    <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#050507] to-transparent" />
  </div>
);
