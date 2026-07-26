DROP INDEX `item_files_item_idx`;--> statement-breakpoint
CREATE INDEX `item_files_item_idx` ON `item_files` (`item_id`,`position`);--> statement-breakpoint
ALTER TABLE `item_files` DROP COLUMN `pinned`;