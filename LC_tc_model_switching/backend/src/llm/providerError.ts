import { LLMProviderId } from './types'

export interface ProviderErrorResponse {
  status: number
  message: string
}

function getErrorFields(error: unknown): {
  status?: number
  code?: string
  message: string
  retryAfter?: string
} {
  if (!error || typeof error !== 'object') {
    return { message: String(error) }
  }

  const value = error as {
    status?: unknown
    code?: unknown
    type?: unknown
    message?: unknown
    headers?: { get?: (name: string) => string | null }
  }
  const code = typeof value.code === 'string'
    ? value.code
    : typeof value.type === 'string'
      ? value.type
      : undefined

  return {
    status: typeof value.status === 'number' ? value.status : undefined,
    code,
    message: typeof value.message === 'string' ? value.message : '',
    retryAfter: value.headers?.get?.('retry-after') ?? undefined
  }
}

export function getProviderErrorResponse(
  error: unknown,
  provider: LLMProviderId
): ProviderErrorResponse | undefined {
  const { status, code, message, retryAfter } = getErrorFields(error)
  const providerName = provider === 'openai'
    ? 'OpenAI'
    : provider === 'anthropic'
      ? 'Anthropic'
      : 'Groq'
  const normalizedCode = code?.toLowerCase() || ''
  const normalizedMessage = message.toLowerCase()
  const quotaExhausted = [
    'credit_balance_exhausted',
    'insufficient_quota',
    'billing_hard_limit_reached'
  ].includes(normalizedCode) ||
    normalizedMessage.includes('no credits remaining') ||
    normalizedMessage.includes('insufficient_quota')

  if (status === 429 && quotaExhausted) {
    return {
      status: 429,
      message: `${providerName} API quota is exhausted. Add API credits or choose another configured model.`
    }
  }

  if (status === 429) {
    const waitHint = retryAfter && /^\d+$/.test(retryAfter)
      ? ` Retry after ${retryAfter} seconds.`
      : ' Please wait a moment before trying again.'
    return {
      status: 429,
      message: `${providerName} is rate-limiting requests.${waitHint} You can also choose another configured model.`
    }
  }

  if (status === 404 || [
    'model_not_found',
    'model_decommissioned',
    'not_found_error'
  ].includes(normalizedCode) || /model.{0,30}(not found|unavailable|decommissioned)|unknown model/.test(normalizedMessage)) {
    return {
      status: 502,
      message: `The ${providerName} model is unavailable or not enabled for this API key. Check the configured model ID or choose another model.`
    }
  }

  if (status === 401 || status === 403) {
    return {
      status: 502,
      message: `${providerName} rejected the API credentials or model access. Check the backend API key and account permissions.`
    }
  }

  if (status === 503 || status === 529) {
    return {
      status: 503,
      message: `${providerName} is temporarily unavailable. Try again later or choose another configured model.`
    }
  }

  return undefined
}
