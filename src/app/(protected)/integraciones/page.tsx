import {requireSession} from '@/lib/auth/current-session';
import {ProviderSettings} from '@/components/provider-settings';
export default async function IntegrationsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const [session,query]=await Promise.all([requireSession(),searchParams]);
 return <ProviderSettings session={session} query={query}/>;
}
