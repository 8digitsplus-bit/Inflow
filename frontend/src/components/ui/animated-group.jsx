import React from 'react';
import { motion } from 'framer-motion';

/**
 * AnimatedGroup — staggered entrance animation wrapper (JS port of the
 * 21st.dev/ibelick component, adapted for our CRA + framer-motion stack).
 * Pass `variants={{ container, item }}`; each child is wrapped in a motion
 * element that inherits the `item` variant while the container staggers them.
 */
const defaultContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const defaultItemVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const AnimatedGroup = ({ children, className, variants }) => {
  const containerVariants = variants?.container || defaultContainerVariants;
  const itemVariants = variants?.item || defaultItemVariants;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
};
