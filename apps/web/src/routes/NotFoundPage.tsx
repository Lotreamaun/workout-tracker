import { Link } from 'react-router';
import { PagePlaceholder } from '@/components/PagePlaceholder';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <PagePlaceholder title="Страница не найдена" description="Такого экрана нет.">
      <Button asChild>
        <Link to="/">На главную</Link>
      </Button>
    </PagePlaceholder>
  );
}
