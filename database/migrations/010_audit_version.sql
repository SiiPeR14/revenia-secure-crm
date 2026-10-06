ALTER TABLE audit_logs ADD COLUMN hash_version smallint NOT NULL DEFAULT 1 CHECK(hash_version IN (1,2));
-- Keep the default at 1 so older workers remain correctly labelled during a rolling update.
