import type { Metadata } from 'next';
import '../globals.css';
import DocumentShell from '@/components/DocumentShell';
import { baseMetadata } from '@/lib/baseMetadata';

export const metadata: Metadata = {
  ...baseMetadata,
  title: 'Admin | Linnevik',
  // Adminvyn ska aldrig indexeras eller dyka upp i sökresultat.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Adminvyns rot-layout, skild från butikens (app/[locale]/layout.tsx). Den
 * innehåller bara skalet. Menyn ligger i (dashboard)/layout.tsx så att
 * /admin/login slipper den.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocumentShell lang="sv">
      <div className="admin-viz min-h-screen font-body" style={{ background: 'var(--viz-plane)' }}>
        {children}
      </div>
    </DocumentShell>
  );
}
