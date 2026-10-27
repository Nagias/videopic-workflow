CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`rel_path` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_sec` real,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_sha256_unique` ON `media` (`sha256`);--> statement-breakpoint
CREATE TABLE `node_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`output_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_nodes` (
	`run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text NOT NULL,
	`cache_key` text,
	`output_json` text,
	`message` text,
	`error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`run_id`, `node_id`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`graph_json` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`graph_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
