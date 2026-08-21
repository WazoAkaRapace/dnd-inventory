CREATE TABLE `character_classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`class_key` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`subclass_key` text,
	`hit_dice_used` integer DEFAULT 0 NOT NULL,
	`fighting_style` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "character_classes_level_check" CHECK(level >= 1 AND level <= 20)
);
--> statement-breakpoint
CREATE INDEX `idx_character_classes_character` ON `character_classes` (`character_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_classes_character_class_unique` ON `character_classes` (`character_id`,`class_key`);--> statement-breakpoint
ALTER TABLE `character_spells` ADD `class_source` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `pact_slots_used` text DEFAULT '[0,0,0,0,0,0,0,0,0]' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `unarmored_defense` text;--> statement-breakpoint
-- Backfill multiclassage : une ligne de classe par personnage existant
-- (sous-classe résolue depuis les colonnes dédiées ou générique).
INSERT INTO `character_classes` (`character_id`, `class_key`, `level`, `subclass_key`, `hit_dice_used`, `fighting_style`, `position`)
SELECT `id`, `character_class`, `level`,
  CASE `character_class`
    WHEN 'Clerc' THEN `divine_domain`
    WHEN 'Druide' THEN `druid_circle`
    WHEN 'Paladin' THEN `sacred_oath`
    ELSE `subclass`
  END,
  `hit_dice_used`, `fighting_style`, 0
FROM `characters` WHERE `character_class` IS NOT NULL AND `character_class` != '';--> statement-breakpoint
-- Occultiste : les emplacements utilisés migrent vers le pool de pacte dédié
UPDATE `characters` SET `pact_slots_used` = `spell_slots_used`, `spell_slots_used` = '[0,0,0,0,0,0,0,0,0]' WHERE `character_class` = 'Occultiste';--> statement-breakpoint
-- Sorts existants : attribués à leur classe (unique) d'origine
UPDATE `character_spells` SET `class_source` = (SELECT `character_class` FROM `characters` WHERE `characters`.`id` = `character_spells`.`character_id`);
