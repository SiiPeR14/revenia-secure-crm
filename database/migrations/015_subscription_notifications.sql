CREATE TABLE billing_event_receipts (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id text NOT NULL CHECK(event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text NOT NULL CHECK(length(event_type)<=100),
  body_hash text NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,event_id)
);
ALTER TABLE billing_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_event_receipts_isolation ON billing_event_receipts
  USING (tenant_id::text=current_setting('app.current_tenant',true))
  WITH CHECK (tenant_id::text=current_setting('app.current_tenant',true));
GRANT SELECT,INSERT ON billing_event_receipts TO revenia_app;

CREATE FUNCTION revenia_platform_webhook_target(p_customer text,p_subscription text,p_live boolean)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT tenant_id FROM billing_bindings WHERE customer_id=p_customer
    AND subscription_id=p_subscription AND livemode=p_live
$$;
REVOKE ALL ON FUNCTION revenia_platform_webhook_target(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_platform_webhook_target(text,text,boolean) TO revenia_app;
