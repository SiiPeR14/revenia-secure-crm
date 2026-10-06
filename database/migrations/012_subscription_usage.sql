-- Platform billing is separate from each tenant's invoice payments/provider keys.
-- Provisioning is intentionally restricted to the migration/operator role until
-- the platform subscription reconciliation service is installed.
CREATE TABLE billing_plans (
  id text PRIMARY KEY CHECK (id IN ('starter','pro','business','enterprise')),
  name text NOT NULL,
  max_members integer CHECK (max_members > 0),
  monthly_messages integer CHECK (monthly_messages >= 0),
  ai_enabled boolean NOT NULL
);
INSERT INTO billing_plans VALUES
  ('starter','Starter',5,1000,false),('pro','Pro',20,5000,true),
  ('business','Business',50,15000,true),('enterprise','Enterprise',NULL,NULL,true);
GRANT SELECT ON billing_plans TO revenia_app;

CREATE TABLE billing_accounts (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES billing_plans(id),
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  seats integer NOT NULL CHECK (seats BETWEEN 1 AND 100000),
  access_until timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_usage (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  metric text NOT NULL CHECK (metric IN ('messages','ai','automations','checkouts')),
  usage_month date NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,job_id),
  FOREIGN KEY(job_id,tenant_id) REFERENCES engine_jobs(id,tenant_id) ON DELETE RESTRICT
);
CREATE INDEX billing_usage_month ON billing_usage(tenant_id,usage_month,metric);
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_accounts_isolation ON billing_accounts
  USING (tenant_id::text=current_setting('app.current_tenant',true))
  WITH CHECK (tenant_id::text=current_setting('app.current_tenant',true));
ALTER TABLE billing_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_usage_isolation ON billing_usage
  USING (tenant_id::text=current_setting('app.current_tenant',true))
  WITH CHECK (tenant_id::text=current_setting('app.current_tenant',true));
GRANT SELECT ON billing_accounts,billing_usage TO revenia_app;

-- Serializes quota reservations with plan changes. Lease ownership is checked
-- in the database; no caller-supplied metric, month, cap or amount is accepted.
CREATE FUNCTION revenia_reserve_job_usage(p_job uuid,p_lease uuid,p_required boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid; a billing_accounts%ROWTYPE; p billing_plans%ROWTYPE;
  j engine_jobs%ROWTYPE; m text; n bigint; month_start date;
BEGIN
  t:=nullif(current_setting('app.current_tenant',true),'')::uuid;
  IF t IS NULL THEN RETURN 'BILLING_TENANT_REQUIRED'; END IF;
  SELECT * INTO a FROM billing_accounts WHERE tenant_id=t FOR UPDATE;
  IF NOT FOUND THEN
    IF p_required IS DISTINCT FROM false THEN RETURN 'SUBSCRIPTION_REQUIRED'; END IF;
    RETURN 'unconfigured';
  END IF;
  IF a.status NOT IN ('active','trialing') OR a.access_until<=clock_timestamp()
    THEN RETURN 'SUBSCRIPTION_INACTIVE'; END IF;
  SELECT * INTO p FROM billing_plans WHERE id=a.plan_id FOR SHARE;
  IF NOT FOUND OR (p.max_members IS NOT NULL AND a.seats>p.max_members)
    THEN RETURN 'SUBSCRIPTION_INVALID'; END IF;
  SELECT * INTO j FROM engine_jobs WHERE id=p_job AND tenant_id=t
    AND status='running' AND lease_token=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN 'BILLING_LEASE_INVALID'; END IF;
  IF j.kind='ai' AND NOT p.ai_enabled THEN RETURN 'PLAN_FEATURE_UNAVAILABLE'; END IF;
  -- A retry retains its original reservation, including across UTC months.
  IF EXISTS(SELECT 1 FROM billing_usage WHERE tenant_id=t AND job_id=p_job)
    THEN RETURN 'existing'; END IF;
  m:=CASE j.kind WHEN 'email' THEN 'messages' WHEN 'whatsapp' THEN 'messages'
     WHEN 'ai' THEN 'ai' WHEN 'task' THEN 'automations' WHEN 'checkout' THEN 'checkouts' END;
  IF m IS NULL THEN RETURN 'BILLING_KIND_INVALID'; END IF;
  month_start:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
  IF m='messages' AND p.monthly_messages IS NOT NULL THEN
    SELECT count(*) INTO n FROM billing_usage WHERE tenant_id=t AND usage_month=month_start AND metric=m;
    IF n>=p.monthly_messages THEN RETURN 'PLAN_MESSAGE_LIMIT'; END IF;
  END IF;
  INSERT INTO billing_usage(tenant_id,job_id,metric,usage_month) VALUES(t,p_job,m,month_start);
  RETURN 'reserved';
END $$;
REVOKE ALL ON FUNCTION revenia_reserve_job_usage(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_reserve_job_usage(uuid,uuid,boolean) TO revenia_app;

-- Memberships consume licensed seats, including read-only users. Pending invites
-- do not reserve a seat; concurrent acceptances are checked at INSERT time.
CREATE FUNCTION revenia_enforce_billing_seats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a billing_accounts%ROWTYPE; maximum integer; used bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM memberships WHERE tenant_id=NEW.tenant_id AND user_id=NEW.user_id)
    THEN RETURN NEW; END IF;
  SELECT * INTO a FROM billing_accounts WHERE tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF a.status NOT IN ('active','trialing') OR a.access_until<=clock_timestamp()
    THEN RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE' USING ERRCODE='P0001'; END IF;
  SELECT max_members INTO maximum FROM billing_plans WHERE id=a.plan_id FOR SHARE;
  SELECT count(*) INTO used FROM memberships WHERE tenant_id=NEW.tenant_id;
  IF used>=a.seats OR (maximum IS NOT NULL AND used>=maximum)
    THEN RAISE EXCEPTION 'PLAN_SEAT_LIMIT' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION revenia_enforce_billing_seats() FROM PUBLIC;
CREATE TRIGGER billing_seat_limit BEFORE INSERT ON memberships
  FOR EACH ROW EXECUTE FUNCTION revenia_enforce_billing_seats();
