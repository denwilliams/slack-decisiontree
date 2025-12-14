CREATE TABLE "decision_trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edit_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"tree_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "edit_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "node_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"label" text NOT NULL,
	"next_node_id" uuid,
	"order_index" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tree_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"node_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"parent_node_id" uuid,
	"order_index" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tree_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text,
	"current_node_id" uuid,
	"session_data" jsonb,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edit_tokens" ADD CONSTRAINT "edit_tokens_tree_id_decision_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."decision_trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_options" ADD CONSTRAINT "node_options_node_id_tree_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."tree_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_options" ADD CONSTRAINT "node_options_next_node_id_tree_nodes_id_fk" FOREIGN KEY ("next_node_id") REFERENCES "public"."tree_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_nodes" ADD CONSTRAINT "tree_nodes_tree_id_decision_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."decision_trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_sessions" ADD CONSTRAINT "tree_sessions_tree_id_decision_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."decision_trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_sessions" ADD CONSTRAINT "tree_sessions_current_node_id_tree_nodes_id_fk" FOREIGN KEY ("current_node_id") REFERENCES "public"."tree_nodes"("id") ON DELETE no action ON UPDATE no action;