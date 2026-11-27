import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isApplePushEndpoint } from '@wt/shared';
import { ApiError } from '@/lib/api';
import { restPushApi } from './client';
import {
  clearRestPushRecord,
  loadRestPushRecord,
  restPushStorage,
  saveRestPushRecord,
  subscriptionMatchesKey,
  urlBase64ToUint8Array,
  type RestPushRecord,
} from './subscription';
import { restPushTimerSync } from './timerSync';

export type RestPushState =
  /** Проверяем поддержку и конфигурацию сервера. */
  | 'checking'
  /** Платформа или контекст не поддерживают Web Push. */
  | 'unsupported'
  /** Сервер вернул publicKey: null — доставка уведомлений выключена. */
  | 'server-off'
  /** Не удалось получить конфигурацию — сервер недоступен. */
  | 'unreachable'
  /** Готово к подписке: service worker и ключ сервера известны. */
  | 'off'
  /** Идёт подписка или отключение. */
  | 'busy'
  /** Подписка зарегистрирована и сверена с браузером, разрешением и ключом. */
  | 'on'
  /** Требуется повторное подключение (см. reason). */
  | 'reconnect'
  /** Пользователь запретил уведомления. */
  | 'denied'
  /** Ошибка операции — можно повторить. */
  | 'error';

export type RestPushReconnectReason = 'permission' | 'key' | 'subscription' | 'lost';

export interface RestPushApi {
  state: RestPushState;
  reason: RestPushReconnectReason | null;
  /** Пояснение текущего состояния для пользователя. */
  message: string | null;
  /** Последнее изменение таймера не доставлено — доставка повторяется автоматически. */
  syncFailed: boolean;
  /** Подписка и запрос разрешения начинаются прямо в обработчике нажатия. */
  enable: (currentEndsAt: number | null) => void;
  disable: () => void;
  retry: (currentEndsAt: number | null) => void;
  /** Событие ручного изменения таймера (старт, продление, пропуск); естественное истечение сюда не попадает. */
  onTimerChange: (endsAt: number | null) => void;
}

/** Состояния, которые меняются из событий и асинхронных ответов (базовые выводятся при рендере). */
type RestPushPhase = Extract<RestPushState, 'busy' | 'on' | 'reconnect' | 'denied' | 'error'> | null;

function isNotAllowedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Не удалось выполнить операцию. Попробуйте ещё раз.';
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    import.meta.env.PROD &&
    window.isSecureContext &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Управление подпиской устройства на уведомления об отдыхе. */
export function useRestPush(sessionId: string | undefined): RestPushApi {
  const [phase, setPhase] = useState<RestPushPhase>(null);
  const [reason, setReason] = useState<RestPushReconnectReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [record, setRecord] = useState(() => loadRestPushRecord(restPushStorage()));
  const currentBrowserSubscription = useRef<PushSubscription | null>(null);
  const busy = useRef(false);
  const supported = isPushSupported();

  /** undefined — регистрация service worker ещё проверяется. */
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null | undefined>(undefined);
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void navigator.serviceWorker.ready.then(async (worker) => {
      const browserSubscription = await worker.pushManager.getSubscription();
      if (cancelled) return;
      currentBrowserSubscription.current = browserSubscription;
      setRegistration(worker);
    }).catch(() => {
      if (!cancelled) setRegistration(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const config = useQuery({
    queryKey: ['rest-push', 'config'],
    queryFn: () => restPushApi.getConfig(),
    enabled: supported,
    refetchOnWindowFocus: 'always',
  });
  const refetchConfig = config.refetch;

  const serverPublicKey = config.data?.publicKey;

  /** Готовность service worker и ключа сервера устанавливается до нажатия кнопки. */
  const state: RestPushState =
    !supported || registration === null
      ? 'unsupported'
      : config.isError && config.data === undefined
        ? 'unreachable'
        : registration === undefined || config.isPending
          ? 'checking'
          : serverPublicKey === undefined || serverPublicKey === null
            ? 'server-off'
            : phase ?? (record ? 'checking' : 'off');

  /** Результат сверки записи с браузерной подпиской, разрешением и ключом сервера. */
  type VerifyOutcome =
    | { phase: 'on'; subscriptionId: string }
    | { phase: 'reconnect'; reason: RestPushReconnectReason }
    | { phase: 'denied' };

  const verifySeq = useRef(0);
  const verify = useCallback(
    async (recordToCheck: RestPushRecord, publicKey: string, sw: ServiceWorkerRegistration): Promise<VerifyOutcome | null> => {
      const seq = verifySeq.current + 1;
      verifySeq.current = seq;

      let browserSubscription: PushSubscription | null;
      try {
        browserSubscription = await sw.pushManager.getSubscription();
      } catch {
        if (seq !== verifySeq.current) return null;
        return { phase: 'reconnect', reason: 'subscription' };
      }
      if (seq !== verifySeq.current) return null;
      currentBrowserSubscription.current = browserSubscription;

      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return typeof Notification !== 'undefined' && Notification.permission === 'denied'
          ? { phase: 'denied' }
          : { phase: 'reconnect', reason: 'permission' };
      }
      if (recordToCheck.publicKey !== publicKey) return { phase: 'reconnect', reason: 'key' };
      if (!browserSubscription || browserSubscription.endpoint !== recordToCheck.endpoint ||
        !subscriptionMatchesKey(browserSubscription, urlBase64ToUint8Array(publicKey))) {
        return { phase: 'reconnect', reason: 'subscription' };
      }
      return { phase: 'on', subscriptionId: recordToCheck.id };
    },
    [],
  );

  const applyVerifyOutcome = useCallback((outcome: VerifyOutcome) => {
    if (outcome.phase === 'on') {
      restPushTimerSync.configure(outcome.subscriptionId);
      setReason(null);
      setMessage(null);
      setPhase('on');
      return;
    }
    restPushTimerSync.configure(null);
    if (outcome.phase === 'denied') setPhase('denied');
    else {
      setReason(outcome.reason);
      setPhase('reconnect');
    }
  }, []);

  // Доставка уведомлений включается только для свереной подписки.
  useEffect(() => {
    if (registration === undefined || !supported || registration === null) return;
    if (serverPublicKey === undefined || busy.current) return;
    if (serverPublicKey === null) {
      restPushTimerSync.configure(null);
      return;
    }
    if (!record) return;
    void verify(record, serverPublicKey, registration).then((outcome) => {
      if (outcome) applyVerifyOutcome(outcome);
    });
  }, [supported, registration, serverPublicKey, record, verify, applyVerifyOutcome]);

  // События доставки: сбой показываем, потерю подписки лечим переподключением.
  useEffect(
    () =>
      restPushTimerSync.subscribe((event) => {
        if (event.type === 'failed') setSyncFailed(true);
        else if (event.type === 'recovered') setSyncFailed(false);
        else {
          verifySeq.current += 1;
          clearRestPushRecord(restPushStorage());
          setRecord(null);
          setReason('lost');
          setPhase('reconnect');
        }
      }),
    [],
  );

  // Разрешение могли отозвать в системных настройках, пока приложение было свёрнуто.
  useEffect(() => {
    if (state !== 'on') return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      if (record && serverPublicKey && registration && !busy.current) {
        void verify(record, serverPublicKey, registration).then((outcome) => {
          if (outcome) applyVerifyOutcome(outcome);
        });
      }
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [state, registration, record, serverPublicKey, verify, applyVerifyOutcome]);

  const enable = useCallback(
    async (currentEndsAt: number | null) => {
      if (busy.current || !sessionId || registration == null || !serverPublicKey) return;
      busy.current = true;
      verifySeq.current += 1;
      setReason(null);
      setMessage(null);
      setPhase('busy');
      restPushTimerSync.schedule(sessionId, currentEndsAt);
      try {
        const publicKey = serverPublicKey;
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        const existing = currentBrowserSubscription.current;
        if (existing && !subscriptionMatchesKey(existing, applicationServerKey)) {
          await existing.unsubscribe();
          currentBrowserSubscription.current = null;
          setReason('key');
          setMessage('Старая подписка отключена. Нажмите ещё раз, чтобы создать новую.');
          setPhase('reconnect');
          return;
        }
        // При новой подписке вызов начинается до первого await, в обработчике нажатия iOS.
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
        currentBrowserSubscription.current = subscription;
        if (!isApplePushEndpoint(subscription.endpoint)) {
          await subscription.unsubscribe();
          currentBrowserSubscription.current = null;
          setMessage('На этом устройстве сервис Apple Push недоступен.');
          setPhase('error');
          return;
        }
        const { keys } = subscription.toJSON();
        if (!keys?.p256dh || !keys.auth) throw new Error('Подписка без ключей шифрования');
        const { id } = await restPushApi.createSubscription({
          endpoint: subscription.endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        });
        const nextRecord = { id, endpoint: subscription.endpoint, publicKey };
        saveRestPushRecord(restPushStorage(), nextRecord);
        setRecord(nextRecord);
        restPushTimerSync.configure(id);
        setPhase('on');
      } catch (error) {
        if (isNotAllowedError(error)) {
          setPhase('denied');
          return;
        }
        if (error instanceof ApiError && error.status === 503) {
          // Сервер отключил уведомления после кэширования конфигурации — перечитаем её.
          setPhase(null);
          void refetchConfig();
          return;
        }
        setMessage(describeError(error));
        setPhase('error');
      } finally {
        busy.current = false;
      }
    },
    [sessionId, registration, serverPublicKey, refetchConfig],
  );

  const disable = useCallback(async () => {
    if (busy.current) return;
    if (!record) {
      setPhase(null);
      return;
    }
    busy.current = true;
    verifySeq.current += 1;
    setReason(null);
    setMessage('Отключаем уведомления…');
    setPhase('busy');
    try {
      // Удаление подписки отменяет и запланированную отправку на сервере.
      await restPushApi.deleteSubscription(record.id);
      clearRestPushRecord(restPushStorage());
      setRecord(null);
      restPushTimerSync.configure(null);
      // Сервер уже отменил доставку. Если браузер не даст удалить локальную подписку,
      // её можно переиспользовать при следующем включении.
      await currentBrowserSubscription.current?.unsubscribe().then((removed) => {
        if (removed) currentBrowserSubscription.current = null;
      }).catch(() => {});
      setSyncFailed(false);
      setPhase(null);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.isNetwork
          ? 'Сервер недоступен — отключение не завершено. Попробуйте ещё раз.'
          : describeError(error),
      );
      setPhase('error');
    } finally {
      busy.current = false;
    }
  }, [record]);

  // Повтор последней неудавшейся операции или проверки конфигурации.
  const lastAction = useRef<'enable' | 'disable' | null>(null);
  const enableAction = useCallback(
    (currentEndsAt: number | null) => {
      lastAction.current = 'enable';
      void enable(currentEndsAt);
    },
    [enable],
  );
  const disableAction = useCallback(() => {
    lastAction.current = 'disable';
    void disable();
  }, [disable]);
  const retry = useCallback((currentEndsAt: number | null) => {
    if (state === 'error' && lastAction.current === 'enable') void enable(currentEndsAt);
    else if (state === 'error' && lastAction.current === 'disable') void disable();
    else void refetchConfig();
  }, [state, enable, disable, refetchConfig]);

  // Ручные изменения таймера уходят на сервер независимо от маршрута; естественно
  // истёкший таймер ничего не отменяет — пропуск и завершение приходят отдельным событием.
  const onTimerChange = useCallback(
    (endsAt: number | null) => {
      if (!sessionId) return;
      restPushTimerSync.schedule(sessionId, endsAt);
    },
    [sessionId],
  );

  return {
    state,
    reason,
    message,
    syncFailed,
    enable: enableAction,
    disable: disableAction,
    retry,
    onTimerChange,
  };
}
