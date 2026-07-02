// Canonical stage colors used across all charts and visualizations
export const STAGE_COLORS = {
  lead: '#0052FF',        // Indigo
  qualified: '#8B5CF6',   // Violet
  proposal: '#06B6D4',    // Cyan
  negotiation: '#F59E0B', // Amber
  closed_won: '#10B981',  // Emerald
  closed_lost: '#EF4444', // Red
};

// Ordered array matching the pipeline stages (excluding closed_lost)
export const STAGE_COLOR_ARRAY = [
  '#0052FF', // Lead
  '#8B5CF6', // Qualified
  '#06B6D4', // Proposal
  '#F59E0B', // Negotiation
  '#10B981', // Closed Won
];

// All stages including lost
export const STAGE_COLOR_ARRAY_ALL = [
  '#0052FF', // Lead
  '#8B5CF6', // Qualified
  '#06B6D4', // Proposal
  '#F59E0B', // Negotiation
  '#10B981', // Closed Won
  '#EF4444', // Closed Lost
];
