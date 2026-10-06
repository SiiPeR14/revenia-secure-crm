import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/current-session";
import { getNavigationCounts } from "@/lib/domain/operations-service";
import {cookies} from 'next/headers';
import {accountIdentity} from '@/lib/auth/account-service';

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const [counts,identity] = await Promise.all([getNavigationCounts(session.tenantId),accountIdentity((await cookies()).get('revenia_session')!.value)]);
  return <AppShell session={session} counts={counts} identity={identity}>{children}</AppShell>;
}
