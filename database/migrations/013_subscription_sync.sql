CREATE TABLE billing_bindings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id text NOT NULL CHECK (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  subscription_id text NOT NULL CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  error_code text,
  UNIQUE(livemode,customer_id), UNIQUE(livemode,subscription_id)
);
ALTER TABLE billing_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_bindings_isolation ON billing_bindings
  USING (tenant_id::text=current_setting('app.current_tenant',true))
  WITH CHECK (tenant_id::text=current_setting('app.current_tenant',true));
GRANT SELECT ON billing_bindings TO revenia_app;
GRANT UPDATE(next_sync_at,last_synced_at,error_code) ON billing_bindings TO revenia_app;

-- Only an operator can bind a Stripe identity. The reconciler may apply a
-- snapshot only to that exact binding, with access bounded to 24 hours.
CREATE FUNCTION revenia_apply_subscription(p_customer text,p_subscription text,p_live boolean,
  p_plan text,p_status text,p_seats integer,p_until timestamptz,p_cancel boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid; b billing_bindings%ROWTYPE; maximum integer;
BEGIN
  t:=nullif(current_setting('app.current_tenant',true),'')::uuid;
  SELECT * INTO b FROM billing_bindings WHERE tenant_id=t FOR SHARE;
  IF NOT FOUND OR b.customer_id<>p_customer OR b.subscription_id<>p_subscription
    OR b.livemode IS DISTINCT FROM p_live THEN RETURN false; END IF;
  SELECT max_members INTO maximum FROM billing_plans WHERE id=p_plan FOR SHARE;
  IF NOT FOUND OR p_seats IS NULL OR p_seats<1 OR p_seats>100000
    OR (maximum IS NOT NULL AND p_seats>maximum)
    OR p_status IS NULL OR p_status NOT IN ('trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')
    OR p_until IS NULL OR NOT isfinite(p_until) OR p_cancel IS NULL THEN RETURN false; END IF;
  INSERT INTO billing_accounts(tenant_id,plan_id,status,seats,access_until,cancel_at_period_end)
    VALUES(t,p_plan,p_status,p_seats,least(p_until,clock_timestamp()+interval '24 hours'),p_cancel)
    ON CONFLICT(tenant_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,
      seats=EXCLUDED.seats,access_until=EXCLUDED.access_until,
      cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=now();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION revenia_apply_subscription(text,text,boolean,text,text,integer,timestamptz,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_apply_subscription(text,text,boolean,text,text,integer,timestamptz,boolean) TO revenia_app;

CREATE FUNCTION revenia_suspend_subscription(p_customer text,p_subscription text,p_live boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid;
BEGIN
  t:=nullif(current_setting('app.current_tenant',true),'')::uuid;
  PERFORM 1 FROM billing_bindings WHERE tenant_id=t AND customer_id=p_customer
    AND subscription_id=p_subscription AND livemode=p_live FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE billing_accounts SET status='paused',access_until=least(access_until,now()),updated_at=now() WHERE tenant_id=t;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION revenia_suspend_subscription(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_suspend_subscription(text,text,boolean) TO revenia_app;
