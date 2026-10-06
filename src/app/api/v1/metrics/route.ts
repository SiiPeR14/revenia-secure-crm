import {api} from '@/lib/api/http';import {metricsSnapshot} from '@/lib/observability/metrics';
export async function GET(request:Request){return api(request,'metrics.read','security:read',async()=>metricsSnapshot());}

