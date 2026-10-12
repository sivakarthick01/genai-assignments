import { ChatAnthropic } from '@langchain/anthropic'
import { GenerateResponse } from '../schemas'
import { LLMProvider } from './types'
import { generateStructuredTests } from './structuredGeneration'

export class AnthropicClient implements LLMProvider {
  private readonly apiKey: string
  private readonly modelName: string

  constructor(modelName: string) {
    this.apiKey = process.env.ANTHROPIC_API_KEY || ''
    this.modelName = modelName

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
  }

  generateTests(systemPrompt: string, userPrompt: string): Promise<GenerateResponse> {
    const model = new ChatAnthropic({
      apiKey: this.apiKey,
      model: this.modelName,
      temperature: 0.2
    })

    return generateStructuredTests(model, this.modelName, systemPrompt, userPrompt)
  }
}
