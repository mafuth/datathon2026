CREATE TABLE `population_indicator` (
	`island_id` text NOT NULL,
	`indicator` text NOT NULL,
	`sex` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`source` text NOT NULL,
	`source_url` text NOT NULL,
	`source_row_id` text NOT NULL,
	`official` integer NOT NULL,
	`estimate` integer NOT NULL,
	`age_data_scope` text NOT NULL,
	PRIMARY KEY(`island_id`, `indicator`, `sex`),
	FOREIGN KEY (`island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "population_indicator_value_non_negative" CHECK("population_indicator"."value" >= 0)
);
--> statement-breakpoint
CREATE INDEX `population_indicator_island_id_index` ON `population_indicator` (`island_id`);