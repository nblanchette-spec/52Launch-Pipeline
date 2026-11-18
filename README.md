# 52Launch Production Studio

52Launch Production Studio is an agency production pipeline and storyboard OS built with React, Vite, and Express. It manages the end-to-end commercial film workflow from client intake and Brand Bible creation to Creative Briefs, Shot Boards, Storyboard Frames, Frame Checks, Video Studio renders, Voiceover generation, Shoot Plans, and Master PDF / Google Drive deliverables.

## Environment Variables

Configure these environment variables before running the server:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes (or via `FAL_KEY`) | — | Google Gemini API key for LLM, image, and TTS routes. |
| `FAL_KEY` | Yes (for Fal generation) | — | fal.ai API key for storyboard frames, video renders, and Fal OpenRouter LLM fallback. |
| `APP_USERNAME` | When Basic Auth is enabled | `admin` | HTTP Basic Auth username protecting pages and `/api/*`. |
| `APP_PASSWORD` | Yes in production (unless bypassed) | — | HTTP Basic Auth password. Production startup refuses to run if unset unless `ALLOW_UNAUTHENTICATED=true`. |
| `ALLOW_UNAUTHENTICATED` | No | `false` | Set to `true` only if authentication is enforced upstream by your hosting platform. |
| `DATA_DIR` | No | `./data` | Directory where project JSON records and uploaded/generated assets are stored. |
| `PORT` | No | `3000` | HTTP port the Express server listens on. |
| `NODE_ENV` | No | `development` (`production` via `npm start`) | Set to `production` to serve the built `dist/` bundle and enforce production startup checks. |

## Prerequisites

- **Node.js `>=22.18`** (required so `node server.ts` executes TypeScript directly in production)

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file based on `.env.example` and populate `GEMINI_API_KEY`, `FAL_KEY`, and optionally `APP_USERNAME` / `APP_PASSWORD`.
3. Start the development server (Express API + Vite middleware on port 3000):
   ```bash
   npm run dev
   ```
4. Verify TypeScript types:
   ```bash
   npm run lint
   ```

## Deploying to Production

1. Install dependencies and build the frontend bundle:
   ```bash
   npm install
   npm run build
   ```
2. Set production environment variables (`GEMINI_API_KEY`, `FAL_KEY`, `APP_USERNAME`, `APP_PASSWORD`, `DATA_DIR`, `PORT`).
3. Start the server:
   ```bash
   npm start
   ```

## Important Production Notes

- **Persistent Storage for `DATA_DIR`**: Mount `DATA_DIR` (for example `/var/data/52launch`) on a persistent disk or volume. Container filesystems are ephemeral and will lose saved projects and generated media across restarts or deploys if `DATA_DIR` stays inside temporary container storage.
- **Firebase & Google OAuth Production Domains**: Before deploying, add your production domain to **Firebase Authentication -> Settings -> Authorized domains** and add the production origin (`https://your-domain.com`) to your **Google OAuth Client's Authorized JavaScript origins** in Google Cloud Console so Google Drive sign-in works in production.
