CREATE TABLE `vehicle_count` (
	`island_id` text NOT NULL,
	`category` text NOT NULL,
	`total` integer NOT NULL,
	PRIMARY KEY(`island_id`, `category`),
	FOREIGN KEY (`island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vehicle_count_total_non_negative" CHECK("vehicle_count"."total" >= 0)
);
--> statement-breakpoint
CREATE INDEX `vehicle_count_island_id_index` ON `vehicle_count` (`island_id`);--> statement-breakpoint
CREATE INDEX `vehicle_count_category_index` ON `vehicle_count` (`category`);