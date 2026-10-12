import {
  LLMProviderIdSchema,
  ModelOption,
  ModelSelection
} from './types'

function isConfigured(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

export function getConfiguredModels(): ModelOption[] {
  const groqApiKey = process.env.groq_API_KEY
  const groqModel = process.env.groq_MODEL || 'llama-3.3-70b-versatile'
  const openAIKey = process.env.OPENAI_API_KEY
  const openAIModel = process.env.OPENAI_MODEL?.trim()
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const anthropicModel = process.env.ANTHROPIC_MODEL?.trim()

  return [
    {
      provider: 'openai',
      model: openAIModel || '',
      label: openAIModel
        ? `OpenAI - ${openAIModel}${isConfigured(openAIKey) ? '' : ' (add API key)'}`
        : 'OpenAI - (add model ID in backend .env)',
      configured: isConfigured(openAIKey) && Boolean(openAIModel)
    },
    {
      provider: 'groq',
      model: groqModel,
      label: `Groq - ${groqModel}${isConfigured(groqApiKey) ? '' : ' (add API key)'}`,
      configured: isConfigured(groqApiKey)
    },
    {
      provider: 'anthropic',
      model: anthropicModel || '',
      label: anthropicModel
        ? `Anthropic - ${anthropicModel}${isConfigured(anthropicKey) ? '' : ' (add API key)'}`
        : 'Anthropic - (add model ID in backend .env)',
      configured: isConfigured(anthropicKey) && Boolean(anthropicModel)
    }
  ]
}

export function getDefaultModelSelection(models = getConfiguredModels()): ModelSelection | undefined {
  const configuredProvider = process.env.LLM_DEFAULT_PROVIDER
  const preferredModel = process.env.LLM_DEFAULT_MODEL

  if (configuredProvider || preferredModel) {
    const parsedProvider = LLMProviderIdSchema.safeParse(configuredProvider)
    if (!parsedProvider.success || !preferredModel) {
      throw new Error('LLM_DEFAULT_PROVIDER and LLM_DEFAULT_MODEL must be configured together')
    }

    const preferred = models.find(
      option => option.configured &&
        option.provider === parsedProvider.data &&
        option.model === preferredModel
    )
    if (!preferred) {
      throw new Error('Configured default LLM provider/model is not available')
    }
    return preferred
  }

  return models.find(option => option.configured && option.provider === 'groq') ||
    models.find(option => option.configured)
}
