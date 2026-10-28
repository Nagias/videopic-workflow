CREATE TABLE `assets` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`params_json` text NOT NULL,
	`output_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_kind_idx` ON `assets` (`kind`,`updated_at`);