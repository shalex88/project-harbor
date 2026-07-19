CREATE TABLE `work_item_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`target_item_id` text NOT NULL,
	`type` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_id`,`project_id`) REFERENCES `work_items`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_item_id`,`project_id`) REFERENCES `work_items`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_item_relations_type_check" CHECK("work_item_relations"."type" IN ('follows_from', 'blocks', 'related_to')),
	CONSTRAINT "work_item_relations_distinct_items_check" CHECK("work_item_relations"."source_item_id" <> "work_item_relations"."target_item_id"),
	CONSTRAINT "work_item_relations_related_order_check" CHECK("work_item_relations"."type" <> 'related_to' OR "work_item_relations"."source_item_id" < "work_item_relations"."target_item_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_relations_unique` ON `work_item_relations` (`project_id`,`type`,`source_item_id`,`target_item_id`);--> statement-breakpoint
CREATE INDEX `work_item_relations_source_idx` ON `work_item_relations` (`project_id`,`source_item_id`);--> statement-breakpoint
CREATE INDEX `work_item_relations_target_idx` ON `work_item_relations` (`project_id`,`target_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_items_id_project_unique` ON `work_items` (`id`,`project_id`);
