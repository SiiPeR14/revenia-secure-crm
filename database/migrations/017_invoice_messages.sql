ALTER TABLE conversations ADD COLUMN invoice_id uuid;
ALTER TABLE conversations ADD COLUMN invoice_updated_at timestamptz;
ALTER TABLE conversations ADD CONSTRAINT conversation_invoice_tenant_fk FOREIGN KEY(invoice_id,tenant_id) REFERENCES invoices(id,tenant_id);
ALTER TABLE conversations ADD CONSTRAINT conversation_invoice_snapshot CHECK((invoice_id IS NULL)=(invoice_updated_at IS NULL));
CREATE UNIQUE INDEX invoice_draft_revision ON conversations(tenant_id,invoice_id,invoice_updated_at,client_id,channel) WHERE invoice_id IS NOT NULL;
