CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar(255) NOT NULL,
	"claimant" varchar(42) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar(255) NOT NULL,
	"type" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"transaction_hash" varchar(66),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"current_owner" varchar(42) NOT NULL,
	"legal_identifier" varchar(255) NOT NULL,
	"location" text NOT NULL,
	"area_sqm" integer NOT NULL,
	"valuation_inr" integer NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"owner_name" varchar(255) NOT NULL,
	"registered_date" timestamp DEFAULT now() NOT NULL,
	"metadata_uri" text
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar(255) NOT NULL,
	"previous_owner" varchar(42) NOT NULL,
	"new_owner" varchar(42) NOT NULL,
	"consideration_inr" integer,
	"status" varchar(50) DEFAULT 'COMPLETED' NOT NULL,
	"transaction_hash" varchar(66) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;