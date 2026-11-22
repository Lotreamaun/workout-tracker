import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ExerciseMedia } from '@wt/shared';
import { mediaSrc } from '@/lib/api';

interface MediaViewerProps {
  title: string;
  media: ExerciseMedia[];
  /** Индекс открытого медиа; null — просмотрщик закрыт. */
  startIndex: number | null;
  onClose: () => void;
}

/** Полноэкранный просмотрщик: нативная горизонтальная лента со scroll-snap, без JS-библиотек. */
export function MediaViewer({ title, media, startIndex, onClose }: MediaViewerProps) {
  return (
    <DialogPrimitive.Root open={startIndex !== null} onOpenChange={(open) => !open && onClose()}>
      {startIndex !== null && (
        <DialogPrimitive.Portal>
          <ViewerContent title={title} media={media} startIndex={startIndex} />
        </DialogPrimitive.Portal>
      )}
    </DialogPrimitive.Root>
  );
}

const iconButton =
  'size-11 items-center justify-center rounded-full bg-black/60 text-white outline-none transition-colors hover:bg-black/80 focus-visible:ring-[3px] focus-visible:ring-white/50';

function ViewerContent({ title, media, startIndex }: { title: string; media: ExerciseMedia[]; startIndex: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(startIndex);

  // Открываемся сразу на выбранном слайде, без анимации прокрутки.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.clientWidth * startIndex;
  }, [startIndex]);

  // Играет только видимое видео: остальные на паузе.
  useEffect(() => {
    scroller.current?.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      if (video.dataset.index === String(current)) void video.play().catch(() => undefined);
      else video.pause();
    });
  }, [current]);

  const onScroll = () => {
    const el = scroller.current;
    if (el && el.clientWidth > 0) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  const go = (delta: number) => {
    const el = scroller.current;
    const next = Math.min(media.length - 1, Math.max(0, current + delta));
    el?.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'ArrowRight') go(1);
  };

  return (
    <DialogPrimitive.Content
      aria-describedby={undefined}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 bg-black text-white outline-none"
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, index) => (
          <div key={item.id} className="flex size-full shrink-0 snap-center snap-always items-center justify-center">
            {item.kind === 'video' ? (
              <video
                data-index={index}
                src={mediaSrc(item.url)}
                poster={mediaSrc(item.thumbUrl)}
                aria-label={`${title}, медиа ${index + 1}`}
                autoPlay
                muted
                loop
                playsInline
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <img
                src={mediaSrc(item.url)}
                alt={`${title}, медиа ${index + 1}`}
                decoding="async"
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium tabular-nums" aria-live="polite">
          {current + 1} / {media.length}
        </span>
        <DialogPrimitive.Close aria-label="Закрыть" className={`pointer-events-auto flex ${iconButton}`}>
          <X className="size-5" aria-hidden />
        </DialogPrimitive.Close>
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Предыдущее медиа"
            disabled={current === 0}
            onClick={() => go(-1)}
            className={`absolute top-1/2 left-4 hidden -translate-y-1/2 disabled:opacity-0 md:flex ${iconButton}`}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Следующее медиа"
            disabled={current === media.length - 1}
            onClick={() => go(1)}
            className={`absolute top-1/2 right-4 hidden -translate-y-1/2 disabled:opacity-0 md:flex ${iconButton}`}
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </>
      )}
    </DialogPrimitive.Content>
  );
}
