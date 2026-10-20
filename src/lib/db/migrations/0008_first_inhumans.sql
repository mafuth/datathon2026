PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transport_connection` (
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
	CONSTRAINT "transport_connection_type_check" CHECK("__new_transport_connection"."connection_type" in ('ferry', 'bus', 'bridge', 'causeway', 'land_link')),
	CONSTRAINT "transport_connection_directionality_check" CHECK("__new_transport_connection"."directionality" in ('forward', 'bidirectional')),
	CONSTRAINT "transport_connection_distance_non_negative" CHECK("__new_transport_connection"."distance_m" is null or "__new_transport_connection"."distance_m" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_transport_connection`("id", "route_id", "from_island_id", "to_island_id", "connection_type", "directionality", "sequence", "distance_m", "geo_json", "source", "source_object_id", "modeled") SELECT "id", "route_id", "from_island_id", "to_island_id", "connection_type", "directionality", "sequence", "distance_m", "geo_json", "source", "source_object_id", "modeled" FROM `transport_connection`;--> statement-breakpoint
DROP TABLE `transport_connection`;--> statement-breakpoint
ALTER TABLE `__new_transport_connection` RENAME TO `transport_connection`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transport_connection_route_id_index` ON `transport_connection` (`route_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_from_island_index` ON `transport_connection` (`from_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_to_island_index` ON `transport_connection` (`to_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_type_index` ON `transport_connection` (`connection_type`);