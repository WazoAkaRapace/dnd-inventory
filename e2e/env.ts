/**
 * Constantes partagées entre playwright.config.ts (racine) et le setup E2E.
 *
 * Ports fixes mais surchargeables par env (`E2E_API_PORT`, `E2E_WEB_PORT`) :
 * la config Playwright a besoin d'un baseURL statique, on ne peut pas laisser
 * le stack négocier des ports libres comme le fait scripts/generate-screenshots.ts.
 */
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4740);
export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5175);

export const API_BASE = `http://127.0.0.1:${E2E_API_PORT}`;
export const WEB_BASE = `http://127.0.0.1:${E2E_WEB_PORT}`;
