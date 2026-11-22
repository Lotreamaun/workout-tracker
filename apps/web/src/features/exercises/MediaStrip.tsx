import { useState } from 'react';
import type { ExerciseMedia } from '@wt/shared';
import { MediaThumb } from './MediaThumb';
import { MediaViewer } from './MediaViewer';

/** Ряд миниатюр медиа упражнения; нажатие открывает полноэкранный просмотрщик. */
export function MediaStrip({ title, media }: { title: string; media: ExerciseMedia[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Открыть медиа ${index + 1}`}
            onClick={() => setViewerIndex(index)}
            className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MediaThumb media={item} />
          </button>
        ))}
      </div>
      <MediaViewer title={title} media={media} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
    </>
  );
}
