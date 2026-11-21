# Companion Chat

A Claude-inspired Next.js chat UI powered by Cloudflare Workers AI. The Pages Router UI is statically exported for Cloudflare Pages, and a Pages Function handles `/api/chat`; credentials remain on the server.

## Local development

1. Copy `.env.example` to `.dev.vars` and set your Cloudflare account ID and API token.
2. Start the Pages runtime:

   ```sh
   npm install
   npm run dev
   ```

`npm run dev` builds the static site and runs it with the Pages Functions runtime.

The Cloudflare token needs permission to run Workers AI models. The app persists conversations in the browser's IndexedDB; it does not need a database. The monochrome model-initial icons are the PNG files in `public/` named `model-qwen.png`, `model-gemma.png`, and `model-llama.png`.

## Models and capabilities

The selector offers Qwen 3.8 27B, Gemma 4 26B, and Llama 4 Scout. Images are sent as image URL data parts supported by all three models. Thinking settings are model-specific:

- **Qwen 3.8:** Auto, Fast, and Thinking. In Thinking mode the supported `reasoning_effort` values are Low, Medium, and Maximum (`xhigh`).
- **Gemma 4:** Auto, Fast, and Thinking. Its documented `chat_template_kwargs.enable_thinking` switch is used; the model does not expose a reasoning-effort level.
- **Llama 4 Scout:** Auto and Fast only. It has no documented thinking/reasoning control.

Fast disables model thinking where the provider exposes that switch and caps the response at 512 tokens; it is not a guarantee of lower provider latency. Auto uses the model's default thinking behavior and a 2,048-token response cap. Web search is not configured. Videos can be previewed, but are not sent for analysis. Plain-text documents and source files (TXT, MD, CSV, JSON, YAML, XML, HTML, CSS, JS/TS, Python, and common source formats) are read and included in the prompt; PDF and other binary document extraction are not supported.

## Deploy to Cloudflare Pages

The site is statically exported to `out`, and `functions/api/chat.ts` provides the `/api/chat` Pages Function.

For a Git-integrated Pages project, use:

- **Build command:** `npm run build`
- **Build output directory:** `out`

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as encrypted variables in **Pages → Settings → Variables and Secrets**. Locally, create a `.dev.vars` file with those values to use the Pages Functions dev server.

To deploy from the CLI, authenticate and deploy:

```sh
npx wrangler login
npx wrangler pages project create companion-chat
npx wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name=companion-chat
npx wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name=companion-chat
npm run deploy
```

The project-create command is only needed once. `npm run preview` builds the static site and runs it with the Pages Functions runtime locally.
