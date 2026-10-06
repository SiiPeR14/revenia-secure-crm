-- An external downgrade must not leave more active users than licensed seats.
CREATE OR REPLACE FUNCTION revenia_reserve_job_usage(p_job uuid,p_lease uuid,p_required boolean)
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
  IF (SELECT count(*) FROM memberships WHERE tenant_id=t)>a.seats
    THEN RETURN 'PLAN_SEAT_LIMIT'; END IF;
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

CREATE FUNCTION revenia_billing_member_count() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT count(*)::integer FROM memberships
  WHERE tenant_id::text=current_setting('app.current_tenant',true)
$$;
REVOKE ALL ON FUNCTION revenia_billing_member_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_billing_member_count() TO revenia_app;
