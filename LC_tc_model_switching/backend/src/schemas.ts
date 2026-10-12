import { z } from 'zod'
import { LLMProviderIdSchema } from './llm/types'

export const GenerateRequestSchema = z.object({
  storyTitle: z.string().min(1, 'Story title is required'),
  summary: z.string().min(1, 'Summary is required'),
  acceptanceCriteria: z.string().min(1, 'Acceptance criteria is required'),
  description: z.string().optional(),
  additionalInfo: z.string().optional(),
  provider: LLMProviderIdSchema.optional(),
  model: z.string().min(1).optional()
}).superRefine((request, context) => {
  if ((request.provider && !request.model) || (!request.provider && request.model)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provider and model must be supplied together',
      path: ['provider']
    })
  }
})

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.string()),
  testData: z.string().nullish().transform(value => value ?? undefined),
  expectedResult: z.string(),
  category: z.string()
})

export const GeneratedCasesSchema = z.object({
  cases: z.array(TestCaseSchema)
})

export const GenerateResponseSchema = z.object({
  cases: z.array(TestCaseSchema),
  model: z.string().optional(),
  promptTokens: z.number(),
  completionTokens: z.number()
})

// Type exports
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type TestCase = z.infer<typeof TestCaseSchema>
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>