UPDATE work_items SET status = 'todo' WHERE status = 'in_progress';--> statement-breakpoint
CREATE TABLE `__backup_work_item_relations` AS SELECT * FROM `work_item_relations`;--> statement-breakpoint
CREATE TABLE `__backup_item_files` AS SELECT * FROM `item_files`;--> statement-breakpoint
CREATE TABLE `__backup_payments` AS SELECT * FROM `payments`;--> statement-breakpoint
CREATE TABLE `__backup_payment_receipts` AS SELECT * FROM `payment_receipts`;--> statement-breakpoint
CREATE TABLE `__new_work_items` (
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
	CONSTRAINT "work_items_type_check" CHECK("__new_work_items"."type" IN ('task', 'event')),
	CONSTRAINT "work_items_status_check" CHECK("__new_work_items"."status" IS NULL OR "__new_work_items"."status" IN ('todo', 'done')),
	CONSTRAINT "work_items_type_fields_check" CHECK(("__new_work_items"."type" = 'task' AND "__new_work_items"."status" IS NOT NULL AND "__new_work_items"."occurrence_date" IS NULL) OR ("__new_work_items"."type" = 'event' AND "__new_work_items"."status" IS NULL AND "__new_work_items"."due_date" IS NULL AND "__new_work_items"."occurrence_date" IS NOT NULL)),
	CONSTRAINT "work_items_estimated_cost_check" CHECK("__new_work_items"."estimated_cost_minor" IS NULL OR "__new_work_items"."estimated_cost_minor" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_work_items`("id", "project_id", "collection_id", "type", "title", "description", "status", "due_date", "occurrence_date", "estimated_cost_minor", "created_by", "created_at", "updated_at") SELECT "id", "project_id", "collection_id", "type", "title", "description", "status", "due_date", "occurrence_date", "estimated_cost_minor", "created_by", "created_at", "updated_at" FROM `work_items`;--> statement-breakpoint
DROP TABLE `work_items`;--> statement-breakpoint
ALTER TABLE `__new_work_items` RENAME TO `work_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `work_items_id_project_unique` ON `work_items` (`id`,`project_id`);--> statement-breakpoint
INSERT INTO `item_files` (`id`,`item_id`,`file_object_id`,`pinned`,`position`,`created_at`)
SELECT `id`,`item_id`,`file_object_id`,`pinned`,`position`,`created_at` FROM `__backup_item_files`;--> statement-breakpoint
INSERT INTO `payments` (`id`,`item_id`,`amount_minor`,`paid_on`,`note`,`created_by`,`created_at`,`updated_at`)
SELECT `id`,`item_id`,`amount_minor`,`paid_on`,`note`,`created_by`,`created_at`,`updated_at` FROM `__backup_payments`;--> statement-breakpoint
INSERT INTO `payment_receipts` (`payment_id`,`file_object_id`,`created_at`)
SELECT `payment_id`,`file_object_id`,`created_at` FROM `__backup_payment_receipts`;--> statement-breakpoint
INSERT INTO `work_item_relations` (`id`,`project_id`,`source_item_id`,`target_item_id`,`type`,`created_by`,`created_at`)
SELECT `id`,`project_id`,`source_item_id`,`target_item_id`,`type`,`created_by`,`created_at` FROM `__backup_work_item_relations`;--> statement-breakpoint
DROP TABLE `__backup_payment_receipts`;--> statement-breakpoint
DROP TABLE `__backup_payments`;--> statement-breakpoint
DROP TABLE `__backup_item_files`;--> statement-breakpoint
DROP TABLE `__backup_work_item_relations`;--> statement-breakpoint
CREATE INDEX `work_items_project_idx` ON `work_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `work_items_collection_idx` ON `work_items` (`collection_id`);--> statement-breakpoint
CREATE INDEX `work_items_task_filter_idx` ON `work_items` (`project_id`,`type`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `work_items_event_date_idx` ON `work_items` (`project_id`,`type`,`occurrence_date`);--> statement-breakpoint
PRAGMA foreign_key_check;
