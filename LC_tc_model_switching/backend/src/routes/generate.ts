import express from 'express'
import {
  createLLMProvider,
  InvalidModelSelectionError,
  NoConfiguredLLMError
} from '../llm/providerFactory'
import { getDefaultModelSelection } from '../llm/modelCatalog'
import { getProviderErrorResponse } from '../llm/providerError'
import { StructuredOutputValidationError } from '../llm/structuredGeneration'
import { GenerateRequestSchema, GenerateResponseSchema } from '../schemas'
import { SYSTEM_PROMPT, buildPrompt } from '../prompt'

export const generateRouter = express.Router()

generateRouter.post('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Validate request body
    const validationResult = GenerateRequestSchema.safeParse(req.body)
    
    if (!validationResult.success) {
      res.status(400).json({
        error: `Validation error: ${validationResult.error.message}`
      })
      return
    }

    const request = validationResult.data

    // Build prompts
    const userPrompt = buildPrompt(request)

    try {
      const llmProvider = createLLMProvider(
        request.provider && request.model
          ? { provider: request.provider, model: request.model }
          : undefined
      )
      const generatedResponse = await llmProvider.generateTests(SYSTEM_PROMPT, userPrompt)
      const responseValidation = GenerateResponseSchema.safeParse(generatedResponse)
      if (!responseValidation.success) {
        res.status(502).json({
          error: 'LLM response does not match expected schema'
        })
        return
      }

      res.json(responseValidation.data)
    } catch (llmError) {
      if (llmError instanceof InvalidModelSelectionError) {
        res.status(400).json({ error: llmError.message })
        return
      }
      if (llmError instanceof NoConfiguredLLMError) {
        res.status(503).json({ error: llmError.message })
        return
      }
      if (llmError instanceof StructuredOutputValidationError) {
        res.status(502).json({
          error: process.env.NODE_ENV === 'production'
            ? 'The selected model returned an invalid test case format. Please try again or choose another model.'
            : llmError.message
        })
        return
      }
      const providerError = getProviderErrorResponse(
        llmError,
        request.provider || getDefaultModelSelection()?.provider || 'groq'
      )
      if (providerError) {
        res.status(providerError.status).json({ error: providerError.message })
        return
      }
      console.error('LLM error:', llmError)
      res.status(502).json({
        error: 'Failed to generate tests from LLM service'
      })
      return
    }
  } catch (error) {
    console.error('Error in generate route:', error)
    res.status(500).json({
      error: 'Internal server error'
    })
  }
})