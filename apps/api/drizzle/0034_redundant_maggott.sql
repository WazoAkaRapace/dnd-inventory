CREATE TABLE `campaign_day_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`character_id` integer NOT NULL,
	`day` integer NOT NULL,
	`note` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_day_notes_party_character_day_unique` ON `campaign_day_notes` (`party_id`,`character_id`,`day`);--> statement-breakpoint
ALTER TABLE `campaign_days` ADD `table_note` text;