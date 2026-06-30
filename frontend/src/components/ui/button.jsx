import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Liquid-glass lens — layered inset box-shadows give the frosted "glass lens"
// edge. Renders identically across all browsers (the SVG displacement filter
// from the source is Firefox-only, so it's intentionally omitted).
const GLASS_LENS =
  "shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.2)]";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium cursor-pointer transition-[transform,background-color,box-shadow,color,border-color,opacity] duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.03] active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: cn("bg-white/[0.08] text-white backdrop-blur-md hover:bg-white/[0.15]", GLASS_LENS),
        destructive: cn("bg-red-500/25 text-red-50 backdrop-blur-md hover:bg-red-500/35", GLASS_LENS),
        outline: cn("bg-white/[0.04] text-white backdrop-blur-md hover:bg-white/[0.10]", GLASS_LENS),
        secondary: cn("bg-white/[0.11] text-white backdrop-blur-md hover:bg-white/[0.18]", GLASS_LENS),
        ghost: "text-white hover:bg-white/10 hover:scale-100",
        link: "text-white underline-offset-4 hover:underline hover:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
