"use client";
import { motion } from "framer-motion";
import { forwardRef, useMemo } from "react";

// Animated text that reveals each word/character sliding up from a clip mask.
// Faithful, dependency-light version of the provided design's VerticalCutReveal.
export const VerticalCutReveal = forwardRef(function VerticalCutReveal(
  {
    children,
    splitBy = "words",
    staggerDuration = 0.15,
    staggerFrom = "first",
    reverse = false,
    transition = { type: "spring", stiffness: 250, damping: 40, delay: 0 },
    containerClassName = "",
    ...props
  },
  ref,
) {
  const text = typeof children === "string" ? children : String(children ?? "");

  const segments = useMemo(() => {
    if (splitBy === "characters") return text.split("");
    // words: keep trailing space with each word (except last)
    const words = text.split(" ");
    return words.map((w, i) => (i < words.length - 1 ? `${w} ` : w));
  }, [text, splitBy]);

  const count = segments.length;
  const baseDelay = transition.delay || 0;
  const getDelay = (i) => {
    const idx = staggerFrom === "last" ? count - 1 - i : i;
    return baseDelay + idx * staggerDuration;
  };

  return (
    <span ref={ref} className={`inline-flex flex-wrap leading-[1.15] ${containerClassName}`} {...props}>
      {segments.map((seg, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em]">
          <motion.span
            className="inline-block whitespace-pre"
            initial={{ y: reverse ? "-110%" : "110%" }}
            animate={{ y: 0 }}
            transition={{ ...transition, delay: getDelay(i) }}
          >
            {seg === " " ? "\u00A0" : seg}
          </motion.span>
        </span>
      ))}
    </span>
  );
});

export default VerticalCutReveal;
