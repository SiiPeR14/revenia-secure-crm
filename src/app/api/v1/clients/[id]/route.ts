import {api,readJson} from '@/lib/api/http';
import {archiveInput} from '@/lib/api/contracts';
import {getClient,editClient,archiveClient} from '@/lib/domain/crm-service';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,ctx:Context){return api(request,'clients.get','crm:read',async({session})=>({data:await getClient(session,(await ctx.params).id)}));}
export async function PATCH(request:Request,ctx:Context){return api(request,'clients.edit','crm:write',async({session})=>({data:await editClient(session,(await ctx.params).id,await readJson(request))}));}
export async function DELETE(request:Request,ctx:Context){return api(request,'clients.archive','crm:write',async({session})=>{const p=archiveInput.parse(await readJson(request));await archiveClient(session,(await ctx.params).id,p.version);},204);}

