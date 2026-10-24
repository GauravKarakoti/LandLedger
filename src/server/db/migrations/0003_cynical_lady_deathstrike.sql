ALTER TABLE "disputes" DROP CONSTRAINT "disputes_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_property_id_idx" ON "disputes" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_claimant_idx" ON "disputes" USING btree ("claimant");--> statement-breakpoint
CREATE INDEX "events_property_id_idx" ON "events" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_timestamp_idx" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "properties_owner_idx" ON "properties" USING btree ("current_owner");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_legal_id_idx" ON "properties" USING btree ("legal_identifier");--> statement-breakpoint
CREATE INDEX "transfers_property_id_idx" ON "transfers" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "transfers_new_owner_idx" ON "transfers" USING btree ("new_owner");--> statement-breakpoint
CREATE INDEX "transfers_tx_hash_idx" ON "transfers" USING btree ("transaction_hash");