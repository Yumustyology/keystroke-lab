// The name of the app being tested, as the UI shows it. Local dev (`npm run dev` / `npm run lab`)
// names it; production builds — like the public GitHub Pages copy — stay neutral. Set
// VITE_TARGET_APP at build time to override either.
export const APP = import.meta.env.VITE_TARGET_APP || (import.meta.env.DEV ? 'Aperture' : 'your app');
export const APP_TITLE = APP.charAt(0).toUpperCase() + APP.slice(1);
