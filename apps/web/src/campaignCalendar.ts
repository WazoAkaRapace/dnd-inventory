/**
 * Sonde légère de l'horloge de campagne (#159) — le chip d'en-tête et la vue
 * semaine partagent la même entrée de cache react-query, et tout le monde
 * invalide ensemble sur campaign:change (l'écho est volontaire : le MD roule
 * sur plusieurs écrans et l'avance doit suivre partout).
 *
 * Vit hors des pages lazy : App.tsx (le chip) importe ce module sans tirer le
 * chunk de la fiche ou du carnet.
 */

import type { CampaignCalendarResponse } from '@table-sync/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import { useSyncEvent } from './sync';

/** GET /campaign/calendar sans plage : { state } — le jour courant suffit. */
export function useLightDay(partyId: number | null) {
  return useQuery({
    queryKey: ['campaign-day', partyId ?? 0],
    enabled: partyId !== null && partyId > 0,
    queryFn: async () => {
      const res = await api.get<CampaignCalendarResponse>(
        `/api/parties/${partyId}/campaign/calendar`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Invalide les requêtes du calendrier partagé pour CE groupe sur chaque
 * événement campaign:change (avance, journal, horloge, carnet). Le propre écho
 * du MD traverse (campaign:change est echo-exempt par design — multi-écrans).
 */
export function useCampaignInvalidation(partyId: number | null) {
  const qc = useQueryClient();
  const pid = partyId ?? 0;
  useSyncEvent(
    (event) => {
      if (event.type !== 'campaign:change' || event.partyId !== pid) return;
      void qc.invalidateQueries({ queryKey: ['campaign-calendar', pid] });
      void qc.invalidateQueries({ queryKey: ['campaign-day', pid] });
      // Registre (ids des lignes pour la retouche MD) : une écriture d'un
      // autre membre peut créer une ligne (upsert journal) — le carnet MD
      // doit relire ses ids (la clé ne vit que chez le MD).
      void qc.invalidateQueries({ queryKey: ['campaign-ledger', pid] });
    },
    [pid, qc],
  );
}
