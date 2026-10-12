import { ChatGroq } from '@langchain/groq'
import { GenerateResponse } from '../schemas'
import { LLMProvider } from './types'
import { generateStructuredTests } from './structuredGeneration'

export class GroqClient implements LLMProvider {
  private readonly apiKey: string
  private readonly apiBaseUrl: string
  private readonly modelName: string

  constructor(modelName = process.env.groq_MODEL || 'llama-3.3-70b-versatile') {
    this.apiKey = process.env.groq_API_KEY || ''
    this.apiBaseUrl = process.env.groq_API_BASE || 'https://api.groq.com/openai/v1'
    this.modelName = modelName

    if (!this.apiKey) {
      throw new Error('groq_API_KEY is not configured')
    }
  }

  generateTests(systemPrompt: string, userPrompt: string): Promise<GenerateResponse> {
    const model = new ChatGroq({
      apiKey: this.apiKey,
      baseUrl: this.apiBaseUrl.replace(/\/openai\/v1\/?$/, ''),
      model: this.modelName,
      temperature: 0.2
    })

    return generateStructuredTests(model, this.modelName, systemPrompt, userPrompt)
  }
}
