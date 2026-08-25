import { Clock3 } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';

// Platshållare i väntan på leveransfaktura/prislista från Franzén's Textil i
// Kinna AB — se catalog/external_suppliers/franzen/main.md. Ingen landad
// kostnad att räkna på förrän den kommer, så sidan får stå tom tills dess.
export default function AdminFranzenPricingPage() {
  return (
    <>
      <PageHeader
        kicker="Sändning · väntar på underlag"
        title="Prisbild – Franzén"
        accent={accentFor('/admin')}
        description="Påslakan, lakan, örngott, handdukar, morgonrockar, tofflor, handtvål. Kopplade till Franzén's Textil i Kinna AB i katalogen — men ingen faktura, inget kostnadsunderlag än."
      />

      <EmptyState
        icon={Clock3}
        title="Kommer i morgon"
        description="Så fort prislistan är i hand landar den här — samma uppställning som Prisbild för Kina-sändningen: landad kostnad, marginal, konkurrentjämförelse. Fram tills dess får du nöja dig med att veta att skenet bedrar: den här sidan ser tom ut, men den är minst lika välfylld som Örngott-lagret."
      />
    </>
  );
}
