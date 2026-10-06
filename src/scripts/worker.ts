import {deliverRecovery} from '../lib/auth/recovery-service.ts';
import {sendRecovery,recoveryAvailable} from '../lib/auth/recovery-delivery.ts';
import { setTimeout as pause } from 'node:timers/promises';
import {existsSync} from 'node:fs';
import { z } from 'zod';
import { claimJob,processJob,scheduleRules } from '../lib/engines/queue.ts';
import { closeDatabase } from '../lib/db/pool.ts';
import {processWebhookInbox} from '../lib/engines/events.ts';
import {withTenant} from '../lib/db/tenant-transaction.ts';
import {syncPlatformBilling} from '../lib/billing/reconcile.ts';

const tenants=z.array(z.uuid()).min(1).parse((process.env.WORKER_TENANT_IDS??'').split(',').map(s=>s.trim()).filter(Boolean));
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const once=process.argv.includes('--once');
const stopRequested=()=>stopping||Boolean(process.env.WORKER_STOP_FILE&&existsSync(process.env.WORKER_STOP_FILE));
const heartbeat=async(tenant:string)=>{await withTenant(tenant,db=>db.query('INSERT INTO engine_heartbeat(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO UPDATE SET last_seen_at=now()',[tenant]));};
try{
  do{
    if(process.env.RECOVERY_MAIL_PROVIDER&&recoveryAvailable()){
      try{for(let i=0;i<20&&!stopRequested();i++){if(!await deliverRecovery(sendRecovery))break;}}catch{console.error('[WORKER] Recovery delivery failed; bounded retry pending');if(once)process.exitCode=1;}
    }
    for(const tenant of tenants){
      if(stopRequested())break;
      try{
        await heartbeat(tenant);
        await syncPlatformBilling(tenant);
        await processWebhookInbox(tenant,stopRequested,()=>heartbeat(tenant));
        const scheduled=await scheduleRules(tenant);
        let processed=0;
        for(let i=0;i<20&&!stopRequested();i++){
          const job=await claimJob(tenant);if(!job)break;
          await processJob(job);processed++;await heartbeat(tenant);
        }
        if(once||scheduled||processed)console.log(JSON.stringify({worker:'revenia',scheduled,processed}));
      }catch{console.error('[WORKER] Cycle failed; will retry without exposing credentials');if(once)process.exitCode=1;}
    }
    if(!once&&!stopRequested())await pause(5000);
  }while(!once&&!stopRequested());
}finally{await closeDatabase();}
