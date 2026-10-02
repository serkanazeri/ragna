# Open WebUI integration

Open WebUI is the local engineering chat interface; the public dashboard remains independently available on Cloudflare.

```bash
npm run secrets:init
npm run build
npm run db:local
npm run preview
# In a second terminal, with Docker running:
npm run webui
```

Open http://localhost:3000 and create the first local administrator. The pinned image is `ghcr.io/open-webui/open-webui:v0.11.1`. The port binds to loopback only. Docker stores Open WebUI data in its named volume. Startup/pull requires Docker and may download a substantial image.

The Compose configuration connects its OpenAI-compatible provider to `http://host.docker.internal:8787/v1`. Select the **ragna** model. API calls require `RAGNA_API_KEY`, loaded from the ignored `.dev.vars` file. The adapter returns citations in text; its SSE output is buffered after the full answer has passed validation.

For native source cards, import `ragna_pipe.py` in **Admin Panel → Functions**, enable it, and select **RAGNA · Evidence Workbench**. Review the function code before enabling it: Open WebUI Functions execute server-side Python. The Pipe reads its API key from the server environment, emits citation/status events, and always requests the public corpus. It does not trust an Open WebUI role or prompt to grant operations access.

To use the deployed backend instead, set the OpenAI connection base URL to `https://your-worker.workers.dev/v1`; for the Pipe set its `RAGNA_BASE_URL` valve to the origin without `/v1`. Only a trusted local installation should receive the operator key. The public workbench needs no such key.

For local generation, run Ollama on the host, add `OLLAMA_BASE_URL=http://localhost:11434` to `.dev.vars`, and start Wrangler with `--var MODEL_ROUTE:local-first`. Keep the model name aligned with `ollama list`. The RAG API uses only the latest user question; multi-turn query rewriting and file attachment ingestion are not implemented.

References: [Open WebUI quick start](https://docs.openwebui.com/getting-started/quick-start/), [Pipe Functions](https://docs.openwebui.com/features/extensibility/plugin/functions/pipe/). Open WebUI's own license and branding rules apply independently from this repository's MIT license.
