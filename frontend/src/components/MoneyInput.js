import React from 'react';
import { Input } from './ui/input';

// Text input for currency amounts with a leading "$" adornment inside the field.
// Pass width/flex classes via wrapperClassName (so inline/fixed-width layouts are preserved).
export const MoneyInput = ({ className = '', wrapperClassName = '', ...props }) => (
  <div className={`relative ${wrapperClassName}`}>
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none select-none z-10">$</span>
    <Input {...props} className={`pl-7 ${className}`} />
  </div>
);
