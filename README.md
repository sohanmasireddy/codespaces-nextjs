# Companion Chat

A Claude-inspired Next.js chat UI powered by Cloudflare Workers AI. The same Pages Router UI and `/api/chat` endpoint are used on Vercel and Cloudflare; credentials remain on the server.

## Local development

1. Copy `.env.example` to `.env.local` and set your Cloudflare account ID and API token.
2. Start the app:

   ```sh
   npm install
   npm run dev
   ```

The Cloudflare token needs permission to run Workers AI models. The app persists conversations in the browser's IndexedDB; it does not need a database. Add the provided PNG logo at `public/model-logo.png` to display it beside the model name. Without that file, the logo space is omitted.

## Models and capabilities

The selector offers Qwen 3.8 27B, Gemma 4 26B, and Llama 4 Scout. Images are sent as image URL data parts supported by all three models. Thinking settings are model-specific:

- **Qwen 3.8:** Auto, Fast, and Thinking. In Thinking mode the supported `reasoning_effort` values are Low, Medium, and Maximum (`xhigh`).
- **Gemma 4:** Auto, Fast, and Thinking. Its documented `chat_template_kwargs.enable_thinking` switch is used; the model does not expose a reasoning-effort level.
- **Llama 4 Scout:** Auto and Fast only. It has no documented thinking/reasoning control.

Fast disables model thinking where the provider exposes that switch and caps the response at 512 tokens; it is not a guarantee of lower provider latency. Auto uses the model's default thinking behavior and a 2,048-token response cap. Web search is not configured. Videos can be previewed, but are not sent for analysis. Plain-text documents and source files (TXT, MD, CSV, JSON, YAML, XML, HTML, CSS, JS/TS, Python, and common source formats) are read and included in the prompt; PDF and other binary document extraction are not supported.

## Deploy to Vercel

1. Import the repository into Vercel and keep the standard Next.js framework preset.
2. In **Project Settings → Environment Variables**, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for the environments you deploy.
3. Deploy with the normal Vercel build. The standard `next build` script is used; no Vercel-only AI provider or client credential is required.

## Deploy to Cloudflare Workers

The Cloudflare deployment uses the OpenNext adapter; local development and Vercel still use the same Next.js application and API source.

1. Install the Cloudflare adapter and Wrangler if not already present:

   ```sh
   npm install --save-dev @opennextjs/cloudflare wrangler
   ```

2. Authenticate with `npx wrangler login`, then set the server-side secrets:

   ```sh
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   ```

3. Set a unique Worker name in `wrangler.jsonc`, then preview or deploy:

   ```sh
   npm run preview
   npm run deploy
   ```

OpenNext requires the `nodejs_compat` Worker compatibility flag. The chat route uses standard `Request`, `Response`, `fetch`, and Web Streams APIs, not Cloudflare bindings, so the route does not need to be duplicated for Vercel. Cloudflare deployment was not run as part of this implementation.
