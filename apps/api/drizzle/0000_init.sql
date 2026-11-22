CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`workout_exercise_id` text,
	`exercise_name_snapshot` text NOT NULL,
	`exercise_position` integer NOT NULL,
	`set_number` integer NOT NULL,
	`planned_reps` integer,
	`actual_reps` integer,
	`planned_weight` real,
	`actual_weight` real,
	`rest_seconds` integer,
	`rpe` real,
	`is_completed` integer DEFAULT false NOT NULL,
	`is_skipped` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`notes` text,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `set_logs_session_id_idx` ON `set_logs` (`session_id`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`position` integer NOT NULL,
	`planned_sets` integer NOT NULL,
	`planned_reps` integer,
	`planned_weight` real,
	`rest_seconds` integer,
	`notes` text,
	`image_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_position_idx` ON `workout_exercises` (`workout_id`,`position`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text,
	`workout_name_snapshot` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_workout_id_idx` ON `workout_sessions` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_started_at_idx` ON `workout_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
