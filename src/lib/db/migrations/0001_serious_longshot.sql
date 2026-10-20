CREATE TABLE `atoll` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atoll_name_unique` ON `atoll` (`name`);--> statement-breakpoint
CREATE TABLE `island` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`geo_json` text NOT NULL,
	`atoll_id` text NOT NULL,
	FOREIGN KEY (`atoll_id`) REFERENCES `atoll`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `island_atoll_id_index` ON `island` (`atoll_id`);--> statement-breakpoint
CREATE INDEX `island_name_index` ON `island` (`name`);--> statement-breakpoint
CREATE TABLE `population` (
	`island_id` text NOT NULL,
	`age_category` text NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`island_id`, `age_category`),
	FOREIGN KEY (`island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "population_amount_non_negative" CHECK("population"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `population_island_id_index` ON `population` (`island_id`);--> statement-breakpoint
CREATE TABLE `service` (
	`id` text PRIMARY KEY NOT NULL,
	`island_id` text,
	`service_type` text NOT NULL,
	`subtype` text NOT NULL,
	`name` text,
	`latitude` real,
	`longitude` real,
	FOREIGN KEY (`island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "service_type_check" CHECK("service"."service_type" in ('health', 'education', 'transport')),
	CONSTRAINT "service_coordinates_pair_check" CHECK(("service"."latitude" is null and "service"."longitude" is null) or ("service"."latitude" is not null and "service"."longitude" is not null))
);
--> statement-breakpoint
CREATE INDEX `service_island_id_index` ON `service` (`island_id`);--> statement-breakpoint
CREATE INDEX `service_type_subtype_index` ON `service` (`service_type`,`subtype`);