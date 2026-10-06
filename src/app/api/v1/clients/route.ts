import {api,readJson} from '@/lib/api/http';
import {listClients,addClient} from '@/lib/domain/crm-service';
export async function GET(request:Request){return api(request,'clients.list','crm:read',({session})=>listClients(session,Object.fromEntries(new URL(request.url).searchParams)));}
export async function POST(request:Request){return api(request,'clients.create','crm:write',async({session})=>({data:await addClient(session,await readJson(request))}),201);}

