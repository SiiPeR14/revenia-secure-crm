ALTER TABLE automations DROP CONSTRAINT automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK(trigger_type IN ('quote_inactive','opportunity_inactive','invoice_overdue'));
ALTER TABLE tasks ADD COLUMN invoice_id uuid;
ALTER TABLE tasks ADD CONSTRAINT tasks_invoice_tenant_fk
  FOREIGN KEY(invoice_id,tenant_id) REFERENCES invoices(id,tenant_id) ON DELETE RESTRICT;
CREATE INDEX tasks_invoice_idx ON tasks(tenant_id,invoice_id) WHERE invoice_id IS NOT NULL;
