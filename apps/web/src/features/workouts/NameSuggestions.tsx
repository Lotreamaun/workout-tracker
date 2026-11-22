import { Button } from '@/components/ui/button';
import { suggestNames } from './suggestNames';

interface NameSuggestionsProps {
  value: string;
  names: string[];
  onPick: (name: string) => void;
}

export function NameSuggestions({ value, names, onPick }: NameSuggestionsProps) {
  const suggestions = suggestNames(names, value);
  if (suggestions.length === 0) return null;

  return (
    <div role="group" aria-label="Подсказки названий" className="flex flex-wrap gap-1.5">
      {suggestions.map((name) => (
        <Button
          key={name}
          type="button"
          variant="secondary"
          size="sm"
          className="h-auto min-h-9 whitespace-normal py-1"
          // Клик не должен убирать фокус с поля, иначе подсказки сразу исчезнут.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(name)}
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
