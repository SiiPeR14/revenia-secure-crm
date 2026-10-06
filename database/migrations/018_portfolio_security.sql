ALTER TABLE clients ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE clients ADD COLUMN archived_at timestamptz;
ALTER TABLE tasks ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
CREATE FUNCTION revenia_increment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version:=OLD.version+1; NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER clients_version BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION revenia_increment_version();
CREATE TRIGGER tasks_version BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION revenia_increment_version();
CREATE INDEX clients_active_list_idx ON clients(tenant_id,updated_at DESC,id) WHERE archived_at IS NULL;
CREATE INDEX tasks_list_idx ON tasks(tenant_id,updated_at DESC,id);

CREATE TABLE security_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 actor_id uuid NOT NULL REFERENCES users(id), rules_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','failed')),
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 results jsonb NOT NULL DEFAULT '[]', scope text NOT NULL,
 UNIQUE(tenant_id,id)
);
CREATE TABLE security_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 rule_id text NOT NULL, title text NOT NULL, severity text NOT NULL CHECK(severity IN ('high','medium','low','info')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','pending_verification','resolved','accepted')),
 evidence text NOT NULL, remediation text NOT NULL, first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL DEFAULT now(), verified_at timestamptz,
 latest_run_id uuid NOT NULL, reason text, review_at timestamptz,
 UNIQUE(tenant_id,rule_id), FOREIGN KEY(tenant_id,latest_run_id) REFERENCES security_runs(tenant_id,id)
);
CREATE INDEX security_runs_recent_idx ON security_runs(tenant_id,started_at DESC);
CREATE INDEX security_findings_status_idx ON security_findings(tenant_id,status,severity);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['security_runs','security_findings'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id::text=current_setting(''app.current_tenant'',true)) WITH CHECK (tenant_id::text=current_setting(''app.current_tenant'',true))',n);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO revenia_app',n);
 END LOOP;
END $$;
