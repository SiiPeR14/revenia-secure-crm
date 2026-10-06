import {z} from 'zod';
import {withTenant} from '../lib/db/tenant-transaction.ts';
import {closeDatabase} from '../lib/db/pool.ts';

try{
  const tenants=z.array(z.uuid()).min(1).parse((process.env.WORKER_TENANT_IDS??'').split(',').map(s=>s.trim()).filter(Boolean));
  for(const tenant of tenants){
    const result=await withTenant(tenant,db=>db.query('SELECT 1 FROM engine_heartbeat WHERE last_seen_at>now()-interval \'90 seconds\''));
    if(!result.rowCount)throw new Error('Heartbeat missing');
  }
  console.log('El motor ha registrado actividad reciente para todas sus empresas.');
}catch{console.error('No hay actividad reciente del motor para alguna empresa configurada.');process.exitCode=1;}
finally{await closeDatabase();}
