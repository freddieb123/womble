// Renders per-criterion feedback bullets as stacked cards with a coloured
// left edge (red / amber / green), a bold criterion label, and the comment
// beneath. Each bullet is expected in the form "Label: 🟡 — comment", but
// bullets without a rating emoji (e.g. older or general feedback) degrade
// gracefully to a neutral card showing the plain text.

type Rating = 'red' | 'amber' | 'green';

const RATING_STYLES: Record<Rating, { edge: string; dot: string }> = {
  red: { edge: 'border-l-red-400', dot: '🔴' },
  amber: { edge: 'border-l-amber-400', dot: '🟡' },
  green: { edge: 'border-l-green-500', dot: '🟢' },
};

function parseBullet(raw: string): { rating: Rating | null; label: string; comment: string } {
  const text = raw.trim();
  const rating: Rating | null = text.includes('🟢')
    ? 'green'
    : text.includes('🟡')
    ? 'amber'
    : text.includes('🔴')
    ? 'red'
    : null;

  if (!rating) return { rating: null, label: '', comment: text };

  const emoji = RATING_STYLES[rating].dot;
  const idx = text.indexOf(emoji);
  // Everything before the emoji is the label (drop a trailing colon/dash).
  const label = text.slice(0, idx).replace(/[\s:–—-]+$/, '').trim();
  // Everything after is the comment (drop a leading dash/em dash).
  const comment = text.slice(idx + emoji.length).replace(/^[\s:–—-]+/, '').trim();
  return { rating, label, comment };
}

function CriterionCard({ raw }: { raw: string }) {
  const { rating, label, comment } = parseBullet(raw);
  const style = rating ? RATING_STYLES[rating] : null;

  return (
    <div
      className={`rounded-lg border border-gray-200 border-l-4 bg-white px-4 py-3 ${
        style ? style.edge : 'border-l-gray-300'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {style && (
          <span className="text-[15px] leading-6 flex-shrink-0" aria-hidden>
            {style.dot}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {label && <p className="text-sm font-semibold text-gray-900 leading-6">{label}</p>}
          {comment && (
            <p className={`text-sm text-gray-600 leading-relaxed ${label ? 'mt-0.5' : ''}`}>{comment}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CriterionFeedbackList({ bullets }: { bullets: string[] }) {
  return (
    <div className="space-y-2.5">
      {bullets.map((b, i) => (
        <CriterionCard key={i} raw={b} />
      ))}
    </div>
  );
}
