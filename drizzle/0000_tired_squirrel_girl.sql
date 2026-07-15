CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'cyan' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_id_project_unique` ON `collections` (`id`,`project_id`);--> statement-breakpoint
CREATE INDEX `collections_project_position_idx` ON `collections` (`project_id`,`position`);--> statement-breakpoint
CREATE TABLE `file_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_objects_r2_key_unique` ON `file_objects` (`r2_key`);--> statement-breakpoint
CREATE INDEX `file_objects_project_idx` ON `file_objects` (`project_id`);--> statement-breakpoint
CREATE TABLE `item_files` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`file_object_id` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_object_id`) REFERENCES `file_objects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_files_file_unique` ON `item_files` (`file_object_id`);--> statement-breakpoint
CREATE INDEX `item_files_item_idx` ON `item_files` (`item_id`,`pinned`,`position`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`file_object_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_object_id`) REFERENCES `file_objects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_receipts_file_unique` ON `payment_receipts` (`file_object_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_on` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_positive_amount_check" CHECK("payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `payments_item_date_idx` ON `payments` (`item_id`,`paid_on`);--> statement-breakpoint
CREATE INDEX `payments_creator_idx` ON `payments` (`created_by`);--> statement-breakpoint
CREATE TABLE `project_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_invitations_status_check" CHECK("project_invitations"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_invitations_project_email_unique` ON `project_invitations` (`project_id`,`email`);--> statement-breakpoint
CREATE INDEX `project_invitations_email_idx` ON `project_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_members_role_check" CHECK("project_members"."role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`currency` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text,
	`due_date` text,
	`occurrence_date` text,
	`estimated_cost_minor` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`,`project_id`) REFERENCES `collections`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_items_type_check" CHECK("work_items"."type" IN ('task', 'event')),
	CONSTRAINT "work_items_status_check" CHECK("work_items"."status" IS NULL OR "work_items"."status" IN ('todo', 'in_progress', 'done')),
	CONSTRAINT "work_items_type_fields_check" CHECK(("work_items"."type" = 'task' AND "work_items"."status" IS NOT NULL AND "work_items"."occurrence_date" IS NULL) OR ("work_items"."type" = 'event' AND "work_items"."status" IS NULL AND "work_items"."due_date" IS NULL AND "work_items"."occurrence_date" IS NOT NULL)),
	CONSTRAINT "work_items_estimated_cost_check" CHECK("work_items"."estimated_cost_minor" IS NULL OR "work_items"."estimated_cost_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `work_items_project_idx` ON `work_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_items_collection_idx` ON `work_items` (`collection_id`);--> statement-breakpoint
CREATE INDEX `work_items_task_filter_idx` ON `work_items` (`project_id`,`type`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `work_items_event_date_idx` ON `work_items` (`project_id`,`type`,`occurrence_date`);