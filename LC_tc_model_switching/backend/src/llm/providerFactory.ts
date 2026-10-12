import { GroqClient } from './groqClient'
import { AnthropicClient } from './anthropicClient'
import { getConfiguredModels, getDefaultModelSelection } from './modelCatalog'
import { OpenAIClient } from './openAIClient'
import { LLMProvider, ModelSelection } from './types'

export class InvalidModelSelectionError extends Error {}

export class NoConfiguredLLMError extends Error {}

export function createLLMProvider(selection?: ModelSelection): LLMProvider {
  const availableModels = getConfiguredModels().filter(option => option.configured)
  const selectedModel = selection
    ? availableModels.find(option => option.provider === selection.provider && option.model === selection.model)
    : getDefaultModelSelection(availableModels)

  if (!selectedModel) {
    if (selection) {
      throw new InvalidModelSelectionError('The selected provider/model is not configured')
    }
    throw new NoConfiguredLLMError('No LLM provider is configured')
  }

  switch (selectedModel.provider) {
    case 'groq':
      return new GroqClient(selectedModel.model)
    case 'openai':
      return new OpenAIClient(selectedModel.model)
    case 'anthropic':
      return new AnthropicClient(selectedModel.model)
  }
}
