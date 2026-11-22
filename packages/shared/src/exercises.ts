import { z } from 'zod';

export const MEDIA_LIMITS = {
  maxPerExercise: 5,
  maxUploadBytes: 100 * 1024 * 1024,
  maxVideoSeconds: 60,
} as const;

/** Ключ упражнения библиотеки: без регистра, лишних пробелов и различия «е»/«ё». Одинаков на клиенте и сервере. */
export function exerciseNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replaceAll('ё', 'е');
}

export const exerciseMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video']),
  /** Пути от корня сайта (`/media/<id>.webp|mp4`, `/media/<id>.thumb.webp`). */
  url: z.string(),
  thumbUrl: z.string(),
});

export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  media: z.array(exerciseMediaSchema),
});

export const exerciseListSchema = z.array(exerciseSchema);

export const exerciseIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const exerciseMediaParamsSchema = z.object({
  id: z.string().min(1).max(64),
  mediaId: z.string().min(1).max(64),
});

export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
