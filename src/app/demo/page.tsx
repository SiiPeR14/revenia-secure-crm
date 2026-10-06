import {DemoCrm} from "@/components/demo-crm";

export default async function DemoPage({searchParams}:{searchParams:Promise<{plan?:string}>}){
  const query=await searchParams;
  const plan=query.plan ? query.plan.charAt(0).toUpperCase()+query.plan.slice(1) : "Pro";
  return <DemoCrm plan={plan}/>;
}
