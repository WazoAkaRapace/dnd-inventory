CREATE TABLE `character_spell_effects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`spell_id` integer NOT NULL,
	`effect_kind` text NOT NULL,
	`ac_value` integer NOT NULL,
	`tied_to_concentration` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spell_id`) REFERENCES `spells`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_spell_effects_character` ON `character_spell_effects` (`character_id`);--> statement-breakpoint
CREATE INDEX `idx_spell_effects_active` ON `character_spell_effects` (`character_id`,`active`);