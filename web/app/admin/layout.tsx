import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin | Linnevik',
  // Adminvyn ska aldrig indexeras eller dyka upp i sökresultat.
  robots: { index: false, follow: false, nocache: true },
};

/** Bara skalet. Menyn ligger i (dashboard)/layout.tsx så att /admin/login slipper den. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-viz min-h-screen font-body" style={{ background: 'var(--viz-plane)' }}>
      {children}
    </div>
  );
}
