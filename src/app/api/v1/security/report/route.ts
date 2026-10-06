import {api} from '@/lib/api/http';import {securityOverview} from '@/lib/security-center/service';
export async function GET(request:Request){return api(request,'security.report','security:read',async({session})=>({generatedAt:new Date().toISOString(),...await securityOverview(session)}));}

