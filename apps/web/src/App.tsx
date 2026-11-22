import { Route, Routes } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { ActiveSessionPage } from '@/routes/ActiveSessionPage';
import { ExerciseDetailPage } from '@/routes/ExerciseDetailPage';
import { ExercisesPage } from '@/routes/ExercisesPage';
import { ExchangePage } from '@/routes/ExchangePage';
import { HistoryDetailPage } from '@/routes/HistoryDetailPage';
import { HistoryPage } from '@/routes/HistoryPage';
import { HomePage } from '@/routes/HomePage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { WorkoutDetailPage } from '@/routes/WorkoutDetailPage';
import { WorkoutEditPage } from '@/routes/WorkoutEditPage';
import { WorkoutNewPage } from '@/routes/WorkoutNewPage';
import { WorkoutsPage } from '@/routes/WorkoutsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="workouts/new" element={<WorkoutNewPage />} />
        <Route path="workouts/:id" element={<WorkoutDetailPage />} />
        <Route path="workouts/:id/edit" element={<WorkoutEditPage />} />
        <Route path="sessions/:id" element={<ActiveSessionPage />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route path="exercises/:id" element={<ExerciseDetailPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:id" element={<HistoryDetailPage />} />
        <Route path="exchange" element={<ExchangePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
