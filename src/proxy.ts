import {NextResponse,type NextRequest} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import {contentSecurityPolicy} from './lib/security/headers';
export function proxy(request:NextRequest){
 const nonce=randomBytes(16).toString('base64');const csp=contentSecurityPolicy(nonce,process.env.NODE_ENV!=='production');
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);headers.set('x-request-id',randomUUID());
 const response=NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',csp);return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};

