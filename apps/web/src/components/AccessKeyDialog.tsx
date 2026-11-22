import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getAccessKey, onAccessKeyRequired, setAccessKey } from '@/lib/accessKey';

/** Диалог ввода ключа доступа: открывается, когда любой запрос получил 401 UNAUTHORIZED. */
export function AccessKeyDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [value, setValue] = useState('');

  useEffect(
    () =>
      onAccessKeyRequired(() => {
        setRejected(getAccessKey() !== null);
        setValue('');
        setOpen(true);
      }),
    [],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const key = value.trim();
    if (!key) return;
    setAccessKey(key);
    setOpen(false);
    void queryClient.invalidateQueries();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Нужен ключ доступа</DialogTitle>
            <DialogDescription>Ключ задаётся переменной API_TOKEN на сервере.</DialogDescription>
          </DialogHeader>
          {rejected && (
            <p role="alert" className="text-sm text-destructive">
              Сохранённый ключ не подошёл. Введите ключ ещё раз.
            </p>
          )}
          <Input
            type="password"
            autoComplete="off"
            aria-label="Ключ доступа"
            placeholder="Ключ доступа"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={value.trim() === ''}>
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
