CREATE TABLE `transport_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text,
	`from_island_id` text NOT NULL,
	`to_island_id` text NOT NULL,
	`connection_type` text NOT NULL,
	`directionality` text NOT NULL,
	`sequence` integer,
	`distance_m` real,
	`geo_json` text,
	`source` text NOT NULL,
	`source_object_id` text NOT NULL,
	`modeled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `transport_route`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`from_island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_island_id`) REFERENCES `island`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transport_connection_type_check" CHECK("transport_connection"."connection_type" in ('ferry', 'bridge', 'causeway', 'land_link')),
	CONSTRAINT "transport_connection_directionality_check" CHECK("transport_connection"."directionality" in ('forward', 'bidirectional')),
	CONSTRAINT "transport_connection_distinct_islands_check" CHECK("transport_connection"."from_island_id" <> "transport_connection"."to_island_id"),
	CONSTRAINT "transport_connection_distance_non_negative" CHECK("transport_connection"."distance_m" is null or "transport_connection"."distance_m" >= 0)
);
--> statement-breakpoint
CREATE INDEX `transport_connection_route_id_index` ON `transport_connection` (`route_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_from_island_index` ON `transport_connection` (`from_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_to_island_index` ON `transport_connection` (`to_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_type_index` ON `transport_connection` (`connection_type`);--> statement-breakpoint
CREATE TABLE `transport_route` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`route_type` text NOT NULL,
	`geo_json` text NOT NULL,
	`source` text NOT NULL,
	`source_object_id` text NOT NULL,
	`modeled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transport_route_type_index` ON `transport_route` (`route_type`);