DROP INDEX "atoll_name_unique";--> statement-breakpoint
DROP INDEX "island_atoll_id_index";--> statement-breakpoint
DROP INDEX "island_name_index";--> statement-breakpoint
DROP INDEX "population_island_id_index";--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "service_island_id_index";--> statement-breakpoint
DROP INDEX "service_type_subtype_index";--> statement-breakpoint
DROP INDEX "transport_connection_route_id_index";--> statement-breakpoint
DROP INDEX "transport_connection_from_island_index";--> statement-breakpoint
DROP INDEX "transport_connection_to_island_index";--> statement-breakpoint
DROP INDEX "transport_connection_type_index";--> statement-breakpoint
DROP INDEX "transport_route_type_index";--> statement-breakpoint
DROP INDEX "two_factor_user_id_index";--> statement-breakpoint
DROP INDEX "user_publicId_unique";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "public_id_index";--> statement-breakpoint
ALTER TABLE `population` ALTER COLUMN "amount" TO "amount" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `atoll_name_unique` ON `atoll` (`name`);--> statement-breakpoint
CREATE INDEX `island_atoll_id_index` ON `island` (`atoll_id`);--> statement-breakpoint
CREATE INDEX `island_name_index` ON `island` (`name`);--> statement-breakpoint
CREATE INDEX `population_island_id_index` ON `population` (`island_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `service_island_id_index` ON `service` (`island_id`);--> statement-breakpoint
CREATE INDEX `service_type_subtype_index` ON `service` (`service_type`,`subtype`);--> statement-breakpoint
CREATE INDEX `transport_connection_route_id_index` ON `transport_connection` (`route_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_from_island_index` ON `transport_connection` (`from_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_to_island_index` ON `transport_connection` (`to_island_id`);--> statement-breakpoint
CREATE INDEX `transport_connection_type_index` ON `transport_connection` (`connection_type`);--> statement-breakpoint
CREATE INDEX `transport_route_type_index` ON `transport_route` (`route_type`);--> statement-breakpoint
CREATE INDEX `two_factor_user_id_index` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_publicId_unique` ON `user` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `public_id_index` ON `user` (`public_id`);