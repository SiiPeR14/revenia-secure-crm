import {z} from 'zod';

export const listInput=z.object({q:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const moneyInput=z.string().regex(/^\d{1,11}(\.\d{1,2})?$/);
export const clientInput=z.object({name:z.string().trim().min(2).max(120),company:z.string().trim().min(2).max(160),email:z.email().trim().toLowerCase().max(200),phone:z.string().trim().max(40).default(''),value:moneyInput.default('0'),status:z.enum(['Potencial','Activo','Inactivo']).default('Potencial')}).strict();
export const clientPatch=clientInput.extend({phone:clientInput.shape.phone.removeDefault(),value:clientInput.shape.value.removeDefault(),status:clientInput.shape.status.removeDefault()}).partial().extend({version:z.number().int().positive()}).strict().refine(v=>Object.keys(v).length>1,'Indica al menos un cambio');
export const taskInput=z.object({title:z.string().trim().min(2).max(200),clientId:z.uuid().nullable().default(null),channel:z.enum(['Tarea','Llamada','Email','WhatsApp']).default('Tarea'),dueAt:z.iso.datetime({offset:true}),status:z.enum(['Pendiente','Completada']).default('Pendiente')}).strict();
export const taskPatch=taskInput.extend({clientId:taskInput.shape.clientId.removeDefault(),channel:taskInput.shape.channel.removeDefault(),status:taskInput.shape.status.removeDefault()}).partial().extend({version:z.number().int().positive()}).strict().refine(v=>Object.keys(v).length>1,'Indica al menos un cambio');
export const archiveInput=z.object({version:z.number().int().positive()}).strict();
export class ApiError extends Error {constructor(public status:number,public code:string,public detail:string){super(code);}}
export const clientOutput=z.object({id:z.uuid(),name:z.string(),company:z.string(),email:z.email(),phone:z.string(),status:z.enum(['Potencial','Activo','Inactivo']),value:z.string(),version:z.number().int(),updatedAt:z.iso.datetime()});
export const taskOutput=z.object({id:z.uuid(),title:z.string(),clientId:z.uuid().nullable(),invoiceId:z.uuid().nullable(),channel:z.string(),status:z.enum(['Pendiente','Completada']),dueAt:z.iso.datetime(),version:z.number().int(),updatedAt:z.iso.datetime()});
