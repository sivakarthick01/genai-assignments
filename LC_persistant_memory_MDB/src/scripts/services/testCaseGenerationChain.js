import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { chatCompletion, parseAndRepairLlmOutput } from '../utilities/llmService.js';

export function createTestCaseGenerationChain({
  complete = chatCompletion,
  parseOutput = parseAndRepairLlmOutput
} = {}) {
  return RunnableSequence.from([
    RunnableLambda.from(request => {
      if (!request?.prompt && (!Array.isArray(request?.messages) || request.messages.length === 0)) {
        throw new Error('Prompt or messages is required');
      }
      return { request };
    }),
    RunnableLambda.from(async ({ request }) => ({
      request,
      completion: await complete(request)
    })),
    RunnableLambda.from(({ completion }) => ({
      completion,
      parsedResponse: parseOutput(completion.content || '')
    }))
  ]);
}

export const testCaseGenerationChain = createTestCaseGenerationChain();
