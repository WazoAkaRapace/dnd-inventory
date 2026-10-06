ALTER TABLE `character_spell_effects` ADD `caster_character_id` integer REFERENCES characters(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `character_spell_effects` ADD `target_label` text;--> statement-breakpoint
CREATE INDEX `idx_spell_effects_caster` ON `character_spell_effects` (`caster_character_id`);--> statement-breakpoint
UPDATE `character_spell_effects` SET `caster_character_id` = `character_id` WHERE `caster_character_id` IS NULL;