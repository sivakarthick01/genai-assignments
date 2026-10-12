import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { z } from 'zod'
import { GeneratedCasesSchema, GenerateResponse } from '../schemas'

const StructuredGeneratedCasesSchema = z.object({
  cases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    steps: z.array(z.string()),
    testData: z.string().nullable(),
    expectedResult: z.string(),
    category: z.string()
  }))
})

function validateGeneratedCases(value: unknown) {
  const structuredResult = StructuredGeneratedCasesSchema.safeParse(value)
  return structuredResult.success
    ? GeneratedCasesSchema.safeParse(structuredResult.data)
    : structuredResult
}

function parseJsonContent(content: AIMessage['content']) {
  const text = typeof content === 'string'
    ? content
    : content
        .map(part => typeof part === 'string' ? part : 'text' in part ? part.text : '')
        .join('\n')
        .trim()

  if (!text) return undefined

  const fencedJson = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const jsonText = fencedJson || text.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) return undefined

  try {
    return validateGeneratedCases(JSON.parse(jsonText))
  } catch {
    return undefined
  }
}

export async function generateStructuredTests(
  model: BaseChatModel,
  modelName: string,
  systemPrompt: string,
  userPrompt: string
): Promise<GenerateResponse> {
  const structuredModel = model.withStructuredOutput(StructuredGeneratedCasesSchema, { includeRaw: true })
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]
  let promptTokens = 0
  let completionTokens = 0
  let validationError = 'The model returned an empty or invalid structured response'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await structuredModel.invoke(messages)
    const rawMessage = result.raw instanceof AIMessage ? result.raw : undefined
    const usage = rawMessage?.usage_metadata
    promptTokens += usage?.input_tokens ?? 0
    completionTokens += usage?.output_tokens ?? 0

    let parsedResponse = validateGeneratedCases(result.parsed)
    let rawJsonIssues: string | undefined

    if (!parsedResponse.success && rawMessage) {
      for (const toolCall of rawMessage.tool_calls ?? []) {
        const toolArguments = validateGeneratedCases(toolCall.args)
        if (toolArguments.success) {
          parsedResponse = toolArguments
          break
        }
      }

      if (!parsedResponse.success) {
        const jsonResponse = parseJsonContent(rawMessage.content)
        if (jsonResponse?.success) {
          parsedResponse = jsonResponse
        } else if (jsonResponse) {
          rawJsonIssues = jsonResponse.error.issues
            .map(issue => `${issue.path.join('.') || 'response'}: ${issue.message}`)
            .join('; ')
        }
      }
    }

    if (parsedResponse.success) {
      return {
        ...parsedResponse.data,
        model: modelName,
        promptTokens,
        completionTokens
      }
    }

    const schemaIssues = parsedResponse.error.issues
      .map(issue => `${issue.path.join('.') || 'response'}: ${issue.message}`)
      .join('; ')
    const toolCallIssues = rawMessage
      ? (rawMessage.tool_calls ?? []).map(toolCall => {
          const validation = validateGeneratedCases(toolCall.args)
          return validation.success
            ? `${toolCall.name}: valid`
            : `${toolCall.name}: ${validation.error.issues
                .map(issue => `${issue.path.join('.') || 'response'}: ${issue.message}`)
                .join('; ')}`
        }).join(' | ')
      : ''
    const rawMessageDetails = rawMessage
      ? `raw content type: ${typeof rawMessage.content}; tool calls: ${rawMessage.tool_calls?.length ?? 0}; ` +
        `additional fields: ${Object.keys(rawMessage.additional_kwargs).join(', ') || 'none'}`
      : 'raw model response unavailable'
    validationError = `${rawJsonIssues ? `raw JSON: ${rawJsonIssues}; ` : ''}${schemaIssues}; ${rawMessageDetails}` +
      (toolCallIssues ? `; tool-call validation: ${toolCallIssues}` : '')

    if (attempt < 2) {
      messages.push(new HumanMessage(
        `Your previous response did not match the required schema (${validationError}). ` +
        'Generate the complete test cases again. Every case must include string id, title, expectedResult, ' +
        'category, an array of string steps, and optional string testData.'
      ))
    }
  }

  throw new StructuredOutputValidationError(
    `${modelName} returned test cases that do not match the expected schema: ${validationError}`
  )
}

export class StructuredOutputValidationError extends Error {}
