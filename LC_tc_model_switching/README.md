# User Story to Test Cases

This application generates QA test cases from a user story. The backend uses LangChain structured output and supports Groq, OpenAI, and Anthropic chat models.

## Configure an AI provider

The backend reads provider credentials from the project-root `.env` file. If you do not already have one, copy `.env.example` to `.env`, then add an API key and supported model ID for each provider you want to enable:

```env
groq_API_KEY=...
groq_MODEL=llama-3.3-70b-versatile

OPENAI_API_KEY=...
OPENAI_MODEL=...

ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

Provider options are exposed only when both that provider's key and model are configured. Keys remain on the backend and must not be added to frontend environment variables. For the current test-case-generation task, Groq is the default when it is configured; otherwise, the first configured provider is used. To set a task-specific default, configure both `LLM_DEFAULT_PROVIDER` and `LLM_DEFAULT_MODEL` to match an enabled option. The UI's model selector remains a manual per-request override and does not change that default.

Provider errors are returned with actionable messages: HTTP 429 quota exhaustion is distinguished from temporary rate limiting, unavailable model IDs are identified, and credential/access errors are reported separately. Rate-limited requests are not retried automatically.

The backend listens on port `8090` by default. During local development, Vite proxies `/api` requests to `API_PROXY_TARGET` (default `http://localhost:8090`), avoiding browser CORS issues even if Vite has to use a different frontend port. For a separately hosted frontend, set `VITE_API_BASE_URL` to the deployed backend's API URL.

## Run locally

Install dependencies at the project root and start both workspaces:

```powershell
npm install
npm run dev
```

The model selector loads the configured choices from `GET /api/models`. Generation requests include the selected `provider` and `model` in `POST /api/generate-tests`.
