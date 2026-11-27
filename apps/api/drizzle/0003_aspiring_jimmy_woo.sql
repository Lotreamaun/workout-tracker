CREATE TABLE `rest_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`timer_session_id` text,
	`timer_ends_at` text,
	`timer_captured_at` text,
	`last_revision` integer DEFAULT 0 NOT NULL,
	`last_sent_ends_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rest_push_subscriptions_endpoint_unique` ON `rest_push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `rest_push_subscriptions_timer_ends_at_idx` ON `rest_push_subscriptions` (`timer_ends_at`);