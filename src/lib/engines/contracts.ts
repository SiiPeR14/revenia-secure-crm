import { z } from "zod";

export const providerSchema = z.enum(['resend','whatsapp','stripe','openai']);
export type Provider = z.infer<typeof providerSchema>;
const secret = z.string().trim().min(10).max(4000);
export const credentialsSchema = z.discriminatedUnion('provider',[
  z.object({provider:z.literal('resend'),apiKey:secret,from:z.email().max(200),inboundAddress:z.email().max(200).optional(),webhookSecret:secret}),
  z.object({provider:z.literal('whatsapp'),apiKey:secret,phoneId:z.string().regex(/^\d{5,40}$/),appSecret:secret,verifyToken:secret,graphVersion:z.string().regex(/^v\d{1,3}\.0$/)}),
  z.object({provider:z.literal('stripe'),apiKey:secret,webhookSecret:secret}),
  z.object({provider:z.literal('openai'),apiKey:secret,model:z.string().regex(/^[a-zA-Z0-9._:-]{2,100}$/),inputPricePerMillion:z.coerce.number().min(0).max(1000),outputPricePerMillion:z.coerce.number().min(0).max(10000)})
]);
export type Credentials = z.infer<typeof credentialsSchema>;
export const taskPayload = z.object({ruleId:z.uuid(),sourceId:z.uuid(),source:z.enum(['quote','opportunity','invoice']),sourceUpdatedAt:z.iso.datetime().optional(),clientId:z.uuid().nullable(),title:z.string().min(2).max(200)});
export const emailPayload = z.object({conversationId:z.uuid(),clientId:z.uuid(),to:z.email(),subject:z.string().min(1).max(200),body:z.string().min(1).max(4000)});
export const whatsappPayload = z.object({conversationId:z.uuid(),clientId:z.uuid(),to:z.string().regex(/^\+?[1-9]\d{6,14}$/),template:z.string().regex(/^[a-z0-9_]{1,100}$/),language:z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/)});
export const aiPayload = z.object({opportunityId:z.uuid(),context:z.string().min(1).max(2000)});
export const checkoutPayload = z.object({invoiceId:z.uuid(),number:z.string().max(50),amountCents:z.number().int().positive().max(99999999),currency:z.enum(['eur','usd','gbp']),tenantId:z.uuid()});
export const payloadSchemas = {task:taskPayload,email:emailPayload,whatsapp:whatsappPayload,ai:aiPayload,checkout:checkoutPayload};
export type Kind = keyof typeof payloadSchemas;
export type Job = {id:string;tenant_id:string;actor_id:string;kind:Kind;payload:unknown;status:string;attempts:number;lease_token:string;created_at:Date;first_attempt_at:Date|null;result:Record<string,unknown>;error_code:string|null;connection_version?:string|null};
export function providerFor(kind:Kind):Provider|null { return ({task:null,email:'resend',whatsapp:'whatsapp',ai:'openai',checkout:'stripe'} as const)[kind]; }

export class EngineError extends Error {
  constructor(public code:string,public retryable=false,public uncertain=false){super(code);}
}
export function retryDelay(attempt:number){return Math.min(3600,30*2**Math.max(0,attempt-1));}
export function retryAllowed(job:Pick<Job,'kind'|'attempts'|'first_attempt_at'>,now=Date.now()) {
  return ['email','checkout','task'].includes(job.kind) && job.attempts<5 && (!job.first_attempt_at || now-job.first_attempt_at.getTime()<6*60*60*1000);
}
