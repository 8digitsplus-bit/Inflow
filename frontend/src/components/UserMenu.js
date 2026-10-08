import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

const EASE = [0.16, 1, 0.3, 1];

const getInitials = (name) => {
  if (!name) return 'U';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const useCompact = () => {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const h = (e) => setCompact(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return compact;
};

/**
 * Account menu behind the sidebar-footer avatar. Opens as an upward popover on
 * desktop and a bottom sheet under 640px. Keyboard: Arrow/Home/End to move,
 * Enter to select, Esc to close. `items` are destinations; Sign out is appended.
 */
export const UserMenu = ({ user, planLabel, planClass, items = [], onSignOut, expanded = true, onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(-1);
  const [hl, setHl] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const compact = useCompact();

  const allItems = [
    ...items.map((it) => ({ ...it, danger: false })),
    { label: 'Sign out', icon: LogOut, danger: true, onSelect: onSignOut },
  ];

  const setOpenState = useCallback((v) => {
    setOpen(v);
    onOpenChange?.(v);
    if (!v) { setActive(-1); setHl(null); }
  }, [onOpenChange]);

  // position the desktop popover, flipping below/above the trigger by available room
  useLayoutEffect(() => {
    if (!open || compact) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const width = 256;
      const estH = panelRef.current?.offsetHeight || 320;
      const left = Math.min(Math.max(12, t.left), window.innerWidth - width - 12);
      const openDown = (window.innerHeight - t.bottom) > (estH + 16) || t.top < (estH + 16);
      if (openDown) {
        setPos({ left, top: t.bottom + 8, bottom: undefined, width, origin: 'top left' });
      } else {
        setPos({ left, top: undefined, bottom: window.innerHeight - t.top + 8, width, origin: 'bottom left' });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, compact]);

  // outside press + escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpenState(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpenState(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpenState]);

  // lock scroll behind the bottom sheet
  useEffect(() => {
    if (!open || !compact) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, [open, compact]);

  // focus the active item + move the sliding highlight
  useEffect(() => {
    if (!open || active < 0) return;
    const el = itemRefs.current[active];
    if (el) {
      el.focus({ preventScroll: true });
      setHl({ top: el.offsetTop, height: el.offsetHeight });
    }
  }, [active, open]);

  const moveActive = (dir) => {
    setActive((cur) => {
      const n = allItems.length;
      if (cur < 0) return dir > 0 ? 0 : n - 1;
      return (cur + dir + n) % n;
    });
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(allItems.length - 1); }
    else if (e.key === 'Tab') { e.preventDefault(); setOpenState(false); }
  };

  const select = (item) => {
    setOpenState(false);
    item.onSelect?.();
  };

  const hoverItem = (idx) => {
    setActive(idx);
    const el = itemRefs.current[idx];
    if (el) setHl({ top: el.offsetTop, height: el.offsetHeight });
  };

  const Identity = (
    <div className="flex items-center gap-3 px-3 py-3">
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={user?.picture} alt={user?.name} />
        <AvatarFallback className="bg-[#0052ff]/30 text-white text-[11px]">{getInitials(user?.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white truncate">{user?.name}</span>
          {planLabel && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${planClass}`}>{planLabel}</span>}
        </div>
        <span className="block text-[12px] text-zinc-500 truncate" title={user?.email}>{user?.email}</span>
      </div>
    </div>
  );

  const List = (
    <div ref={listRef} role="menu" aria-label="Account menu" tabIndex={-1} onKeyDown={onListKey} className="relative p-1.5">
      <AnimatePresence>
        {hl && (
          <motion.span
            aria-hidden="true"
            className="absolute left-1.5 right-1.5 rounded-lg bg-white/[0.06] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: hl.top - 6, height: hl.height }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38, opacity: { duration: 0.1 } }}
            style={{ top: 6 }}
          />
        )}
      </AnimatePresence>
      {allItems.map((item, idx) => {
        const Icon = item.icon;
        const isDanger = item.danger;
        return (
          <div key={item.label}>
            {isDanger && <div className="h-px bg-white/[0.06] my-1 mx-1" role="separator" />}
            <motion.button
              ref={(el) => (itemRefs.current[idx] = el)}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => select(item)}
              onPointerMove={(e) => { if (e.pointerType !== 'touch') hoverItem(idx); }}
              className={`relative z-10 w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] text-left transition-colors ${isDanger ? 'text-red-400' : 'text-zinc-300'}`}
              data-testid={`user-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: EASE, delay: 0.03 + idx * 0.018 }}
            >
              {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${isDanger ? 'text-red-400' : 'text-zinc-500'}`} strokeWidth={1.75} />}
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.keys && (
                <span className="flex items-center gap-0.5">
                  {item.keys.map((k, i) => (
                    <kbd key={i} className="px-1 h-4 min-w-4 inline-flex items-center justify-center rounded bg-white/5 border border-white/10 text-[10px] text-zinc-500">{k}</kbd>
                  ))}
                </span>
              )}
            </motion.button>
          </div>
        );
      })}
    </div>
  );

  const Trigger = expanded ? (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpenState(!open)}
      className="w-full flex items-center gap-2.5 h-11 px-1.5 rounded-xl hover:bg-white/[0.04] transition-colors group/trig"
      data-testid="user-menu-trigger"
    >
      <Avatar className="w-7 h-7 flex-shrink-0">
        <AvatarImage src={user?.picture} alt={user?.name} />
        <AvatarFallback className="bg-[#0052ff]/30 text-white text-[9px]">{getInitials(user?.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[12px] font-medium text-zinc-300 truncate">{user?.name}</p>
      </div>
      {planLabel && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${planClass}`}>{planLabel}</span>}
      <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpenState(!open)}
      className="w-full flex items-center justify-center h-11 rounded-xl hover:bg-white/[0.04] transition-colors"
      data-testid="user-menu-trigger"
    >
      <Avatar className="w-7 h-7">
        <AvatarImage src={user?.picture} alt={user?.name} />
        <AvatarFallback className="bg-[#0052ff]/30 text-white text-[9px]">{getInitials(user?.name)}</AvatarFallback>
      </Avatar>
    </button>
  );

  const Popover = (
    <AnimatePresence>
      {open && !compact && pos && (
        <motion.div
          ref={panelRef}
          className="fixed z-[120] rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, transformOrigin: pos.origin }}
          data-testid="user-menu-panel"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 460, damping: 34, opacity: { duration: 0.14, ease: EASE } }}
        >
          {Identity}
          <div className="h-px bg-white/[0.06]" />
          {List}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const Sheet = (
    <AnimatePresence>
      {open && compact && (
        <>
          <motion.div
            className="fixed inset-0 z-[119] bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpenState(false)}
          />
          <motion.div
            ref={panelRef}
            className="fixed inset-x-0 bottom-0 z-[120] rounded-t-2xl border-t border-white/10 bg-zinc-950 pb-6"
            data-testid="user-menu-panel"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', visualDuration: 0.36, bounce: 0 }}
          >
            <span className="block mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-white/15" />
            {Identity}
            <div className="h-px bg-white/[0.06]" />
            {List}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {Trigger}
      {createPortal(Popover, document.body)}
      {createPortal(Sheet, document.body)}
    </>
  );
};

export default UserMenu;
