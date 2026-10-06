import {api,readJson} from '@/lib/api/http';
import {listTasks,addTask} from '@/lib/domain/crm-service';
export async function GET(request:Request){return api(request,'tasks.list','crm:read',({session})=>listTasks(session,Object.fromEntries(new URL(request.url).searchParams)));}
export async function POST(request:Request){return api(request,'tasks.create','crm:write',async({session})=>({data:await addTask(session,await readJson(request))}),201);}

