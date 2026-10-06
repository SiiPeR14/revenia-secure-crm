import {it} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {deploymentIssues} from './deployment.ts';
const configured=()=>({SESSION_SECRET:randomBytes(48).toString('hex'),FIELD_ENCRYPTION_KEK:randomBytes(32).toString('hex'),APP_URL:'https://crm.example.com',DATABASE_URL:'postgresql://revenia_app:long-private-password@db.example.com/revenia?sslmode=verify-full',REDIS_URL:'rediss://:private-password@redis.example.com:6380',WORKER_TENANT_IDS:randomUUID(),EXTERNAL_OPERATIONS_ENABLED:'false',ENGINE_DAILY_LIMIT:'100',PLATFORM_BILLING_ENABLED:'false'});
it('accepts a structurally configured deployment without activating providers',()=>assert.deepEqual(deploymentIssues(configured()),[]));
it('blocks demo configuration, privileged credentials and insecure origins',()=>{
  const result=deploymentIssues({...configured(),APP_URL:'http://localhost:3000',DATABASE_URL:'postgresql://revenia_admin:password@host/db',MIGRATION_DATABASE_URL:'secret',FIELD_ENCRYPTION_KEK:'cd2faefcf93779453bc60b54cb2fec09382ffedc37acb17e0c5997ee198c36ef',DEV_OWNER_PASSWORD:'demo'});
  assert.equal(result.length,5);assert.ok(result.every(line=>!line.includes('postgresql://')&&!line.includes('cd2faef')));
});
