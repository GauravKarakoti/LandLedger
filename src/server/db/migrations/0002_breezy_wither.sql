CREATE TABLE "disputes" (
	"id" integer PRIMARY KEY NOT NULL,
	"property_id" varchar(255) NOT NULL,
	"claimant" varchar(42) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;