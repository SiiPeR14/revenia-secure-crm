ALTER TABLE webhook_receipts ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE webhook_receipts ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE webhook_receipts ADD COLUMN quarantined_at timestamptz;
CREATE INDEX webhook_receipts_ready ON webhook_receipts(tenant_id,available_at) WHERE processed_at IS NULL AND quarantined_at IS NULL;
CREATE INDEX engine_jobs_rule_source ON engine_jobs(tenant_id,(payload->>'ruleId'),(payload->>'sourceId'),(payload->>'sourceUpdatedAt')) WHERE kind='task';
