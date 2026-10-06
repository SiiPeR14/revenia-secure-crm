import {recoveryHttp} from '@/lib/auth/recovery-http';
export const POST=(request:Request)=>recoveryHttp(request,'reset');
