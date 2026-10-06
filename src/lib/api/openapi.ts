import {z} from 'zod';
import {clientInput,clientPatch,clientOutput,taskInput,taskPatch,taskOutput,archiveInput} from './contracts.ts';
function schema(s:z.ZodType){const result=z.toJSONSchema(s,{target:'draft-2020-12',io:'input',unrepresentable:'any'});delete result.$schema;return result;}
const errorSchema={type:'object',required:['error'],properties:{error:{type:'object',required:['code','message','requestId'],properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string',format:'uuid'}}}}};
const ref=(name:string)=>({'$ref':'#/components/schemas/'+name});
const single=(name:string)=>({type:'object',required:['data'],properties:{data:ref(name)}});
const list=(name:string)=>({type:'object',required:['data','pagination'],properties:{data:{type:'array',items:ref(name)},pagination:{type:'object',required:['page','limit','total'],properties:{page:{type:'integer'},limit:{type:'integer'},total:{type:'integer'}}}}});
const content=(s:object)=>({'application/json':{schema:s}});
function operation(id:string,summary:string,response:object,status='200',body?:string,listParams=false,item=false){
 return {operationId:id,summary,security:[{sessionCookie:[]}],parameters:[...(item?[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}]:[]),...(listParams?[{name:'q',in:'query',schema:{type:'string',maxLength:100}},{name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:10000,default:1}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:20}}]:[])],...(body?{requestBody:{required:true,content:content(ref(body))}}:{}),responses:{[status]:{description:'Operación completada',...(status==='204'?{}:{content:content(response)})},...Object.fromEntries([400,401,403,404,409,413,415,429,503].map(n=>[n,{description:'Error controlado; consultar error.code',content:content(ref('Error'))}]))}};
}
export const openapi={
 openapi:'3.1.0',info:{title:'Revenia CRM API',version:'1.0.0',description:'API privada con sesión de navegador. Escrituras requieren Origin igual a APP_URL y JSON de máximo 16 KiB. 120 peticiones por minuto por usuario/empresa; 429 con Retry-After. Cantidades monetarias como strings decimales. PATCH y archivo requieren version para evitar pérdida de cambios.'},servers:[{url:'/'}],
 paths:{
 '/api/v1/clients':{get:operation('listClients','Clientes activos de la empresa',list('Client'),'200',undefined,true),post:operation('createClient','Crear cliente',single('Client'),'201','ClientInput')},
 '/api/v1/clients/{id}':{get:operation('getClient','Consultar cliente',single('Client'),'200',undefined,false,true),patch:operation('editClient','Editar cliente con versión',single('Client'),'200','ClientPatch',false,true),delete:operation('archiveClient','Archivar sin borrar relaciones',{},'204','ArchiveInput',false,true)},
 '/api/v1/tasks':{get:operation('listTasks','Consultar tareas',list('Task'),'200',undefined,true),post:operation('createTask','Crear tarea',single('Task'),'201','TaskInput')},
 '/api/v1/tasks/{id}':{patch:operation('editTask','Editar o reabrir tarea con versión',single('Task'),'200','TaskPatch',false,true)}
 },components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'revenia_session'}},schemas:{ClientInput:schema(clientInput),ClientPatch:schema(clientPatch),Client:schema(clientOutput),TaskInput:schema(taskInput),TaskPatch:schema(taskPatch),Task:schema(taskOutput),ArchiveInput:schema(archiveInput),Error:errorSchema}}
};

