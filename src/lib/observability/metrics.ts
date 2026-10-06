type Metric={count:number;errors:number;totalMs:number;buckets:number[]};
const boundaries=[50,100,250,500,1000,5000];
const shared=globalThis as typeof globalThis&{reveniaMetrics?:Map<string,Metric>};
const metrics=shared.reveniaMetrics??=new Map();
export function observeRequest(route:string,status:number,duration:number){
 const m=metrics.get(route)??{count:0,errors:0,totalMs:0,buckets:boundaries.map(()=>0)};m.count++;m.errors+=Number(status>=500);m.totalMs+=duration;
 boundaries.forEach((n,i)=>{if(duration<=n)m.buckets[i]!++;});metrics.set(route,m);
}
export function metricsSnapshot(){return {scope:'Proceso actual; contadores reiniciados al reiniciar el servidor.',capturedAt:new Date().toISOString(),routes:[...metrics].map(([route,m])=>({route,...m,boundariesMs:boundaries}))};}
