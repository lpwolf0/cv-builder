# CV Builder

Interactive builder for the navy-sidebar graphic CV. Edit on the left, live preview on the right, download a real (selectable-text) PDF.

    npm install        # playwright (Chromium is used for PDF export)
    npm start          # http://localhost:3000
    npm run qa         # end-to-end tests; writes screenshots + PDFs to a temp folder

Structure
- `public/js/model.js` – central CV data model (+ sanitiser). Swap `public/js/store.js` storage adapter for Supabase later.
- `public/js/template/` – fixed design: `cvTemplate.js` (data -> blocks), `paginate.js` (overflow -> extra pages), `render.js`.
- `public/css/cv.css` – the CV design only; `public/css/app.css` – editor UI (all classes prefixed `ui-`).
- `public/js/editor/` – forms and photo cropper. `server.js` – static files + `POST /api/pdf` (same template code rendered in headless Chromium; nothing stored).

Fonts: Lato is the original body font. The original's "Now" and "Aileron" fonts are not bundled, so Poppins and Liberation Sans stand in. Drop the real files into `public/fonts/` and edit `public/css/fonts.css` to match exactly.
