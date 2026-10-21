PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_job_location` (
	`id` text PRIMARY KEY NOT NULL,
	`island_id` text NOT NULL,
	`name` text,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`latitude` real,
	`longitude` real,
	FOREIGN KEY (`island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_job_location`("id", "island_id", "name", "type", "subtype", "latitude", "longitude")
SELECT "id", "island_id", "name", "category", "subtype", "latitude", "longitude" FROM `job_location`;--> statement-breakpoint
DROP TABLE `job_location`;--> statement-breakpoint
ALTER TABLE `__new_job_location` RENAME TO `job_location`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `job_location_island_id_index` ON `job_location` (`island_id`);--> statement-breakpoint
CREATE INDEX `job_location_type_index` ON `job_location` (`type`);
