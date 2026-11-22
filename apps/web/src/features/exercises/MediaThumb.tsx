import { Play } from 'lucide-react';
import type { ExerciseMedia } from '@wt/shared';
import { mediaSrc } from '@/lib/api';

/** Миниатюра медиа, заполняет родителя (он должен быть `relative`); у видео — значок воспроизведения. */
export function MediaThumb({ media }: { media: ExerciseMedia }) {
  return (
    <>
      <img
        src={mediaSrc(media.thumbUrl)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="size-full object-cover"
      />
      {media.kind === 'video' && (
        <span
          aria-hidden
          className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
        >
          <Play className="size-3 fill-current" />
        </span>
      )}
    </>
  );
}
