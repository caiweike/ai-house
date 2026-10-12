import { ReactNode } from 'react';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
function convexUrl(): string {
  const url = (import.meta.env.VITE_CONVEX_URL || (import.meta.env.DEV ? 'http://127.0.0.1:4212' : '')) as string;
  if (!url) {
    throw new Error('尚未配置小屋服务地址。');
  }
  return url;
}

const convex = new ConvexReactClient(convexUrl(), { unsavedChangesWarning: false });

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
