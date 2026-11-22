import { ExchangeExport } from '@/features/exchange/ExchangeExport';
import { ExchangeImport } from '@/features/exchange/ExchangeImport';

export function ExchangePage() {
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">AI-обмен</h1>
        <p className="text-sm text-muted-foreground">
          Выгрузите план в JSON, попросите ChatGPT изменить его и импортируйте результат обратно.
        </p>
      </div>
      <ExchangeExport />
      <ExchangeImport />
    </section>
  );
}
