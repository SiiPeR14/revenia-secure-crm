import {api,readJson} from '@/lib/api/http';import {runSecurityChecks} from '@/lib/security-center/service';import {z} from 'zod';
export async function POST(request:Request){return api(request,'security.scan','security:read',async({session})=>{z.object({}).strict().parse(await readJson(request));return runSecurityChecks(session);},201);}

