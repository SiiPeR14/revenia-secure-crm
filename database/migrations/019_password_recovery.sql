-- Global identity data: accessible only through narrow SECURITY DEFINER functions.
CREATE TABLE password_recovery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 session_version integer,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 consumed_at timestamptz,
 delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON password_recovery FROM PUBLIC,revenia_app;

CREATE FUNCTION revenia_recovery_issue(p_email text,p_hash text,p_payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid; v_version integer;
BEGIN
 SELECT id,session_version INTO v_user,v_version FROM users WHERE email=lower(p_email) AND disabled_at IS NULL;
 INSERT INTO password_recovery(user_id,session_version,token_hash,payload) VALUES(v_user,v_version,p_hash,p_payload);
END $$;

CREATE FUNCTION revenia_recovery_claim(p_id uuid DEFAULT NULL) RETURNS TABLE(id uuid,payload jsonb,eligible boolean,lease_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Short retention for encrypted tokens and unknown-account requests.
 DELETE FROM password_recovery r WHERE r.expires_at<now()-interval '1 day';
 UPDATE password_recovery r SET payload=NULL,delivery_state='failed'
 WHERE r.payload IS NOT NULL AND (r.expires_at<=now() OR r.attempts>=3) AND (r.lease_until IS NULL OR r.lease_until<now());
 RETURN QUERY
 WITH candidate AS (
 SELECT r.id FROM password_recovery r WHERE r.expires_at>now() AND r.consumed_at IS NULL AND r.attempts<3
 AND (p_id IS NULL OR r.id=p_id) AND (r.delivery_state='pending' OR (r.delivery_state='sending' AND r.lease_until<now()))
 ORDER BY r.created_at LIMIT 1 FOR UPDATE SKIP LOCKED
 )
 UPDATE password_recovery r SET delivery_state='sending',attempts=r.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '1 minute'
 FROM candidate c WHERE r.id=c.id RETURNING r.id,r.payload,r.user_id IS NOT NULL,r.lease_id;
END $$;

CREATE FUNCTION revenia_recovery_delivered(p_id uuid,p_lease uuid,p_success boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE password_recovery SET delivery_state=CASE WHEN p_success THEN 'sent' WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
 payload=CASE WHEN p_success OR attempts>=3 THEN NULL ELSE payload END,lease_until=NULL,lease_id=NULL
 WHERE id=p_id AND lease_id=p_lease AND delivery_state='sending';
$$;

CREATE FUNCTION revenia_recovery_consume(p_hash text,p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid; v_version integer; v_current integer; v_disabled timestamptz; v_id uuid;
BEGIN
 IF p_password !~ '^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN RETURN false; END IF;
 SELECT r.user_id INTO v_user FROM password_recovery r WHERE r.token_hash=p_hash AND r.expires_at>now() AND r.consumed_at IS NULL;
 IF v_user IS NULL THEN RETURN false; END IF;
 -- Lock the account first: simultaneous tokens cannot overwrite each other.
 SELECT session_version,disabled_at INTO v_current,v_disabled FROM users WHERE id=v_user FOR UPDATE;
 SELECT r.id,r.session_version INTO v_id,v_version FROM password_recovery r WHERE r.token_hash=p_hash AND r.expires_at>now() AND r.consumed_at IS NULL FOR UPDATE;
 IF v_id IS NULL OR v_current<>v_version OR v_disabled IS NOT NULL THEN RETURN false; END IF;
 UPDATE users SET password_hash=p_password,session_version=session_version+1 WHERE id=v_user;
 UPDATE sessions SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=v_user;
 UPDATE password_recovery SET consumed_at=now(),payload=NULL WHERE user_id=v_user AND consumed_at IS NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION revenia_recovery_issue(text,text,jsonb),revenia_recovery_claim(uuid),revenia_recovery_delivered(uuid,uuid,boolean),revenia_recovery_consume(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_recovery_issue(text,text,jsonb),revenia_recovery_claim(uuid),revenia_recovery_delivered(uuid,uuid,boolean),revenia_recovery_consume(text,text) TO revenia_app;
