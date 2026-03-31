/**
 * Renders AI response text with clean formatting.
 * Handles markdown-like syntax: headers (##), bold (**), bullets (- *), numbered lists.
 */
export const AIResponseRenderer = ({ text, className = '' }) => {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Empty line = spacer
        if (!trimmed) return <div key={i} className="h-1.5" />;

        // Headers (### or ## or #)
        if (trimmed.startsWith('### '))
          return <h4 key={i} className="text-sm font-semibold text-white mt-3 mb-0.5" style={{ fontFamily: 'Outfit' }}>{stripMd(trimmed.slice(4))}</h4>;
        if (trimmed.startsWith('## '))
          return <h3 key={i} className="text-sm font-semibold text-white mt-3 mb-0.5" style={{ fontFamily: 'Outfit' }}>{stripMd(trimmed.slice(3))}</h3>;
        if (trimmed.startsWith('# '))
          return <h3 key={i} className="text-sm font-semibold text-white mt-3 mb-0.5" style={{ fontFamily: 'Outfit' }}>{stripMd(trimmed.slice(2))}</h3>;

        // Horizontal rule
        if (trimmed === '---' || trimmed === '***')
          return <hr key={i} className="border-white/[0.06] my-2" />;

        // Bullet points (- or *)
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2 text-[13px] text-zinc-300 pl-1">
              <span className="text-indigo-400 mt-0.5 flex-shrink-0 leading-none">&#8226;</span>
              <span className="leading-relaxed">{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered lists
        const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 text-[13px] text-zinc-300 pl-1">
              <span className="text-cyan-400 flex-shrink-0 font-mono text-xs mt-px">{numMatch[1]}.</span>
              <span className="leading-relaxed">{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        // Regular paragraph
        return <p key={i} className="text-[13px] text-zinc-300 leading-relaxed">{renderInline(trimmed)}</p>;
      })}
    </div>
  );
};

/** Strip leading markdown header symbols */
function stripMd(text) {
  return renderInline(text.replace(/^#+\s*/, ''));
}

/** Render inline formatting: **bold**, *italic*, `code` */
function renderInline(text) {
  if (!text) return text;

  // Split on bold markers **...**
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    // No bold, check for inline code
    return renderCode(text);
  }

  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Bold segment
      return <strong key={i} className="text-zinc-100 font-semibold">{renderCode(part)}</strong>;
    }
    return <span key={i}>{renderCode(part)}</span>;
  });
}

/** Render inline `code` spans */
function renderCode(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/`([^`]+)`/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <code key={i} className="px-1 py-0.5 bg-white/[0.06] rounded text-xs font-mono text-cyan-300">{part}</code>
      : part
  );
}
