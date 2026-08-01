CREATE TABLE `work_item_contact_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`item_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`field` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	FOREIGN KEY (`item_id`,`contact_id`,`project_id`) REFERENCES `work_item_contacts`(`item_id`,`contact_id`,`project_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_item_contact_mentions_field_check" CHECK("work_item_contact_mentions"."field" IN ('title', 'description')),
	CONSTRAINT "work_item_contact_mentions_offsets_check" CHECK("work_item_contact_mentions"."start_offset" >= 0 AND "work_item_contact_mentions"."end_offset" > "work_item_contact_mentions"."start_offset")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_contact_mentions_range_unique` ON `work_item_contact_mentions` (`item_id`,`field`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE INDEX `work_item_contact_mentions_item_idx` ON `work_item_contact_mentions` (`item_id`,`field`,`start_offset`);--> statement-breakpoint
CREATE TABLE `work_item_contacts` (
	`project_id` text NOT NULL,
	`item_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`manually_linked` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`item_id`, `contact_id`),
	FOREIGN KEY (`item_id`,`project_id`) REFERENCES `work_items`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`,`project_id`) REFERENCES `project_contacts`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_contacts_item_contact_project_unique` ON `work_item_contacts` (`item_id`,`contact_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `work_item_contacts_contact_idx` ON `work_item_contacts` (`contact_id`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_contacts_id_project_unique` ON `project_contacts` (`id`,`project_id`);--> statement-breakpoint
PRAGMA optimize;
