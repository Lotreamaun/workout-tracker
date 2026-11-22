## Context

- Упражнения сейчас живут только внутри шаблона (`workout_exercises`); сессии копируют названия (`set_logs.exercise_name_snapshot`).
- Один контейнер на Dockhost: Fastify раздаёт API и фронтенд, SQLite лежит на volume 1 GiB (`/app/data`), домен публичный.
- Основной сценарий: ChatGPT генерирует GIF или картинку, пользователь на iPhone прикрепляет файл к упражнению и смотрит технику во время тренировки.
- Приоритеты: KISS, скорость, лаконичный и производительный код.

## Goals / Non-Goals

**Goals**
- Медиа прикрепляется один раз и видно во всех шаблонах и сессиях с этим упражнением.
- Любой популярный формат сжимается до лёгкого и одинаково воспроизводимого везде (iOS Safari, десктоп).
- Посторонний человек не может читать, менять данные и загружать файлы.
- Минимум новых зависимостей и движущихся частей.

**Non-Goals**
- Пользователи и авторизация.
- Медиа в истории и в JSON-обмене.
- Переименование и объединение упражнений библиотеки, сортировка медиа.
- Оффлайн-кэш медиа, фоновая очередь обработки.

## Decisions

### 1. Ключ доступа вместо авторизации
- `API_TOKEN` из env → `Config.apiToken?: string` → `buildApp({ apiToken })`.
- Глобальный хук `onRequest` пропускает без проверки:
  - запросы, URL которых не начинается с `/api/`;
  - `OPTIONS`;
  - `GET /api/health`.

  Остальное сверяет `Authorization: Bearer …`. Сравнение: `crypto.timingSafeEqual` по SHA-256 обеих строк (одинаковая длина буферов). При несовпадении — `AppError(UNAUTHORIZED, 401, 'Нужен ключ доступа')`.
- Без `apiToken` хук не регистрируется, при старте пишется `app.log.warn`.
- Закрыто и чтение: экспорт отдаёт все данные, а заголовок на чтение ничего не стоит, потому что все GET идут через `apiRequest`.
- `/media/*` открыт: `<img>` и `<video>` не умеют передавать заголовки, а имена файлов — UUID v4 (122 бита случайности), их нельзя подобрать.

  _Альтернатива:_ cookie после ввода ключа. Отказались: нужен endpoint логина, CSRF и настройки SameSite — лишняя сложность.
- **Клиент**, `apps/web/src/lib/accessKey.ts`:
  - `getAccessKey()` и `setAccessKey()` поверх `localStorage['wt.accessKey']`, обёрнуты в try/catch;
  - простое событие для подписки (`onAccessKeyRequired`).

  `apiRequest` добавляет заголовок. При 401 `UNAUTHORIZED` он сообщает событие и бросает `ApiError` как обычно.
- `AccessKeyDialog` монтируется в `AppLayout`. После сохранения: `queryClient.invalidateQueries()`.
- Установленная PWA на iOS имеет отдельное от Safari хранилище, поэтому ключ вводится один раз в каждом из них. Это осознанно.

### 2. Библиотека: связь по нормализованному названию, без FK из шаблонов
- Таблица `exercises`: `id`, `name`, `name_key UNIQUE`, `created_at`.
- `exerciseNameKey(name)` в `@wt/shared`: `trim`, `/\s+/g → ' '`, `toLowerCase('ru')`, `ё → е`. Нормализация на клиенте и сервере одна и та же.
- `ensureExercises(tx, names)`: `INSERT … ON CONFLICT(name_key) DO NOTHING` пачкой. Вызывается:
  - в конце `syncWorkoutExercises`, что покрывает create, update и импорт в режиме replace;
  - в ветке create в `exchange/service.ts → executePlan`;
  - один раз в `buildApp` после миграций — для `SELECT DISTINCT name FROM workout_exercises`. Это идемпотентный backfill; в SQL-миграции его не сделать, потому что `lower()` в SQLite не понимает кириллицу.
- Чтение: `resolveExercises(db, names) → Map<nameKey, Exercise>` — один запрос `exercises WHERE name_key IN (…)` и один `exercise_media WHERE exercise_id IN (…)`. Используется в `toWorkout` (workouts) и `toSession` (sessions). Для одного пользователя и десятков упражнений два запроса на ответ ничего не стоят.

**Почему не FK `workout_exercises.exercise_id`.** Пришлось бы синхронизировать его во всех путях записи (sync, импорт), а сессиям всё равно нужна связь по названию из снимка: шаблон может быть удалён. Один механизм проще двух. Переименование упражнения в шаблоне — это переход к другому упражнению библиотеки; такое поведение ожидаемо и описано в спеке.

**Мусор в библиотеке** (опечатки) не убирается автоматически: в UI есть удаление записи. Автоматическая чистка потребовала бы ключей названий в `workout_exercises`. Не стоит того.

### 3. Хранение медиа
- Таблица `exercise_media`: `id`, `exercise_id → exercises.id ON DELETE CASCADE`, `kind ('image'|'video')`, `created_at`; индекс по `(exercise_id, created_at)`.
- Файлы:
  - `${MEDIA_DIR}/files/<id>.webp` или `<id>.mp4`;
  - `${MEDIA_DIR}/files/<id>.thumb.webp`;
  - временные — в `${MEDIA_DIR}/tmp/`, при старте каталог очищается.
- Имя файла выводится из `id` и `kind`, поэтому путей в БД нет и path traversal невозможен.
- `MEDIA_DIR` по умолчанию `data/media`, путь резолвится от корня репозитория, как `DB_PATH`. В Docker это volume `/app/data`.
- Раздача: второй `@fastify/static` с `root: files`, `prefix: '/media/'`, `decorateReply: false`, `immutable: true`, `maxAge: '365d'`; Range поддерживается из коробки.
- В `errors.ts` SPA-fallback не срабатывает для `/media/`: там остаётся 404. В workbox в `navigateFallbackDenylist` добавляется `/^\/media\//`.
- В DTO: `url: '/media/<id>.<ext>'`, `thumbUrl: '/media/<id>.thumb.webp'`. Клиент приклеивает `API_BASE_URL` (в dev это другой порт) функцией `mediaSrc(path)` в `lib/api.ts`.

### 4. Загрузка и сжатие
- Транспорт: `@fastify/multipart` (официальный плагин), регистрируется только в модуле exercises с `limits: { fileSize: 100 МБ, files: 1, fields: 0 }`.
- Поток пишется в `tmp/<uuid>.upload`. Если `file.truncated` или пойман `RequestFileTooLargeError`, ответ 413 `MEDIA_TOO_LARGE`.

  _Альтернатива:_ сырой body с `Content-Type: image/*`. Отказались: свой парсер и лимит в потоке — больше кода для того же результата.
- **Порядок обработки:**
  1. Найти упражнение → 404.
  2. Посчитать медиа → 409.
  3. Сохранить файл во tmp.
  4. Определить тип по сигнатуре (`detectMediaType(head: Buffer)`) → 415.
  5. Пропустить через ffmpeg в tmp → 422.
  6. Транзакция: повторно проверить лимит → 409 и вставить строку.
  7. Переименовать файлы из tmp в files. Если `rename` упал, удалить строку.
  8. В `finally` удалить все tmp.
- **Сигнатуры:**

  | Тип | Признак |
  |---|---|
  | JPEG | `FF D8 FF` |
  | PNG | `89 50 4E 47` |
  | GIF | `GIF8` |
  | WebP | `RIFF????WEBP` |
  | MP4 / MOV | `????ftyp` при brand ≠ `heic`/`heix`/`mif1`/`msf1`/`avif` |
  | WebM / MKV | `1A 45 DF A3` |

  Это ~20 строк вместо зависимости `file-type`. HEIC не принимается: Safari на iOS при выборе фото сам отдаёт JPEG.
- **ffmpeg** вызывается через `child_process.spawn` (без shell), бинарник берётся из `FFMPEG_PATH` (по умолчанию `ffmpeg`), таймаут 180 с с `SIGKILL`. Все задания идут через одну promise-очередь (concurrency 1), чтобы не перегрузить CPU контейнера.
  - Картинка: `-i in -frames:v 1 -vf "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease" -c:v libwebp -quality 80 out.webp`. ffmpeg 8 применяет EXIF-ориентацию JPEG: проверено, 400×200 с Orientation=6 превращается в 200×400.
  - GIF и видео: `-i in -t 60 -an -vf "scale='min(720,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p" -fpsmax 30 -c:v libx264 -preset veryfast -crf 28 -movflags +faststart out.mp4`.
  - Миниатюра — из результата: `-i out.(webp|mp4) -frames:v 1 -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -c:v libwebp -quality 70 out.thumb.webp`.
- GIF всегда превращается в MP4: в 5–20 раз меньше, и `<video loop muted playsinline>` ведёт себя как гифка. Прозрачность GIF при этом теряется, фон становится чёрным; для гифок с техникой это приемлемо.
- Обработка синхронная, внутри запроса. Короткий GIF — около секунды, минутное видео 4K на слабом CPU — десятки секунд, и клиент всё это время показывает «Сжатие…». Фоновая очередь со статусами для одного пользователя не нужна.
- `MEDIA_LIMITS` в shared: `maxPerExercise: 5`, `maxUploadBytes: 100 * 1024 * 1024`, `maxVideoSeconds: 60`.

### 5. Модуль `apps/api/src/modules/exercises`
- `repository.ts` — запросы Drizzle.
- `media.ts` — `detectMediaType`, очередь, `processMedia(input, kind) → { main, thumb }`, удаление файлов.
- `service.ts`:
  - `ensureExercises`, `resolveExercises`;
  - `listExercises`, `getExercise`, `deleteExercise`;
  - `addMedia`, `deleteMedia`.
- `routes.ts`: `GET /exercises`, `GET /exercises/:id`, `DELETE /exercises/:id` (204), `POST /exercises/:id/media` (201), `DELETE /exercises/:id/media/:mediaId`. Params проверяются Zod-схемами.
- При удалении упражнения или медиа сначала удаляется строка в БД, потом файлы (`fs.rm` с `force: true`). Если файл не удалился, это мусор, а не битая ссылка.
- `buildApp` получает `mediaDir` и `ffmpegPath` (в тестах — временный каталог).
- В `@fastify/cors` в `methods` уже есть DELETE; заголовок `Authorization` разрешается автоматически (отражается из preflight).

### 6. UI (mobile-first, существующие shadcn-компоненты)
- **Навигация.** Пятый пункт «Упражнения» (`Library` из lucide) между «Тренировки» и «История»; на мобильных `grid-cols-5`.
- **`/exercises`.**
  - Поиск (`Input type="search"`), фильтр на клиенте через `exerciseNameKey`.
  - Список строк по 56 px: миниатюра 40×40 (`thumbUrl` первого медиа или иконка-заглушка), название, «N медиа».
  - Пустое состояние.
- **`/exercises/:id`.**
  - Заголовок и `ExerciseMediaManager`: сетка `grid-cols-3` квадратных плиток (`aspect-square`, `object-cover`, `loading="lazy"`, `decoding="async"`), у видео — бейдж ▶.
  - Удаление: кнопка `X` в углу с областью нажатия 44 px и `ConfirmDialog`.
  - Плитка «Добавить» — `<label>` с невидимым `<input type="file" accept="image/*,video/*" multiple>`.
  - Счётчик «N из 5».
  - Ниже — «Удалить из библиотеки» с подтверждением.
- **Загрузка.**
  - Файлы обрабатываются по очереди (`for…of await`). Для каждого файла сразу появляется плитка-заглушка со спиннером «Сжатие…».
  - После успеха кэш `['exercises', id]` обновляется ответом сервера (`setQueryData`), затем инвалидируются `['exercises']`, `['workouts']`, `['sessions']`.
  - Ошибки собираются в список под сеткой (имя файла и текст).
  - Ранние проверки на клиенте: размер больше 100 МБ, превышение лимита 5.
  - Загрузка: `fetch` с `FormData` через тот же `apiRequest`; для FormData не ставится `Content-Type`.
- **`MediaStrip`** — ряд миниатюр 56×56 с горизонтальной прокруткой. Используется в карточках `WorkoutView` и сессионного `ExerciseCard`. В `WorkoutView` рядом стоит кнопка-ссылка «Добавить медиа» или «Медиа» на `/exercises/:exerciseId`.
- **`MediaViewer`.**
  - Radix `Dialog` на весь экран, чёрный фон.
  - Горизонтальная лента с `scroll-snap-type: x mandatory`: нативный свайп без JS-библиотек.
  - При открытии `scrollIntoView` к выбранному слайду; текущий индекс — по `scrollLeft / clientWidth` на `scroll`.
  - Счётчик, кнопка закрытия; на `md+` — кнопки ‹ ›; стрелки ← → на клавиатуре.
  - Картинки — `object-contain`. Видео — `autoPlay muted loop playsInline`, без `controls`, `poster={thumbUrl}`.
  - Учитываются safe-area insets.
- **Подсказки названий в `WorkoutEditor`** (поле названия — `AutoTextarea`, `datalist` с ним не работает).
  - Под полем, только пока оно в фокусе и введено ≥ 2 символов: до 5 кнопок-чипов с совпадениями из `useExercises()`, без полного совпадения.
  - `onMouseDown` с `preventDefault`, чтобы не терялся фокус; нажатие подставляет название.
- **`AccessKeyDialog`.** Radix `Dialog` с `Input type="password"`, `autoComplete="off"`, кнопкой «Сохранить» и пояснением «Ключ задаётся переменной API_TOKEN на сервере».

### 7. Миграция и деплой
- Drizzle Kit генерирует миграцию: две новые таблицы. Колонку `workout_exercises.image_path` не удаляем: старый образ читает её через `select()`, и без неё откат сломался бы. Колонка остаётся неиспользуемой.
- В Dockerfile в runtime-стадии добавляется `apt-get install -y --no-install-recommends ffmpeg`, `ENV MEDIA_DIR=data/media`.
- В `.gitignore` добавляется `data/media/`. В `.env.example` добавляются `API_TOKEN` (закомментирован, с подсказкой `openssl rand -hex 32`), `MEDIA_DIR` и `FFMPEG_PATH`.
- На Dockhost нужно задать `API_TOKEN` до или сразу после деплоя. Без него сервер работает, но открыт и пишет предупреждение в лог.

## Risks / Trade-offs

- **ffmpeg в образе: +~150–250 МБ.** Медленнее сборка, зато один инструмент на всё. Сжатие на клиенте (WebCodecs, ffmpeg.wasm) на iPhone ненадёжно и тяжелее.
- **В Debian-образе ffmpeg может быть старее локального (7.x) и не применять EXIF-ориентацию.** Митигация: проверить версию в образе; ChatGPT-картинки EXIF не содержат, фото с iPhone обычно отдаются уже повёрнутыми.
- **Обработка блокирует запрос на время сжатия.** При таймауте прокси Dockhost длинное видео может оборваться. Митигация: таймаут ffmpeg 180 с, лимит 60 с видео, preset `veryfast`.
- **Диск 1 GiB.** Результаты маленькие (~0,1–3 МБ), исходник до 100 МБ живёт во tmp только на время обработки.
- **Ключ в localStorage доступен скриптам страницы.** Сторонних скриптов в приложении нет, приемлемо.
- **Библиотека по названию.** Синонимы («Жим лёжа» и «Жим штанги лёжа») — разные упражнения. Митигация: подсказки названий в конструкторе.

## Migration Plan

1. Применить миграцию; при старте backfill наполнит библиотеку названиями из шаблонов.
2. Задать `API_TOKEN` в Dockhost и задеплоить.
3. Ввести ключ на iPhone (в Safari и PWA) и на десктопе.

Откат: предыдущий образ работает с новой БД (лишние таблицы ему не мешают, схема `workout_exercises` не менялась).

## Open Questions

Нет.
