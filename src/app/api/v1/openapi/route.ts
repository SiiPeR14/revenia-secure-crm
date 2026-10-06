import {api} from '@/lib/api/http';import {openapi} from '@/lib/api/openapi';
export async function GET(request:Request){return api(request,'openapi.read','crm:read',async()=>openapi);}

