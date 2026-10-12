import { z } from 'zod'
import type { GenerateResponse } from '../schemas'

export const LLMProviderIdSchema = z.enum(['groq', 'openai', 'anthropic'])

export const ModelSelectionSchema = z.object({
  provider: LLMProviderIdSchema,
  model: z.string().min(1)
})

export type LLMProviderId = z.infer<typeof LLMProviderIdSchema>
export type ModelSelection = z.infer<typeof ModelSelectionSchema>

export interface ModelOption extends ModelSelection {
  label: string
  configured: boolean
}

export interface LLMProvider {
  generateTests(systemPrompt: string, userPrompt: string): Promise<GenerateResponse>
}
