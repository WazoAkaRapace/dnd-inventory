ALTER TABLE `items` ADD `created_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `parties` ADD `players_create_items` integer DEFAULT 1 NOT NULL;