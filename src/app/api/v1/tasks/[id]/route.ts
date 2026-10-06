import {api,readJson} from '@/lib/api/http';
import {editTask} from '@/lib/domain/crm-service';
export async function PATCH(request:Request,ctx:{params:Promise<{id:string}>}){return api(request,'tasks.edit','crm:write',async({session})=>({data:await editTask(session,(await ctx.params).id,await readJson(request))}));}

