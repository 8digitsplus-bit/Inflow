"use client";
import { motion, useInView } from "framer-motion";

// Scroll-triggered staggered reveal wrapper (from the provided design).
// Shares a single container ref so all children animate when the section enters view.
export const TimelineContent = ({
  children,
  animationNum,
  timelineRef,
  customVariants,
  className,
  as = "div",
  onClick,
  ...props
}) => {
  const isInView = useInView(timelineRef, { once: true, margin: "0px 0px -40px 0px" });
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      custom={animationNum}
      variants={customVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={className}
      onClick={onClick}
      {...props}
    >
      {children}
    </MotionTag>
  );
};

export default TimelineContent;
