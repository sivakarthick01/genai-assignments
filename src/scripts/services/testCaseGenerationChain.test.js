import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestCaseGenerationChain } from './testCaseGenerationChain.js';

test('generation chain invokes the configured model and parses its response', async () => {
  const completion = {
    content: '{"newTestCases":[{"testCaseId":"TC-1"}]}',
    provider: 'test-provider',
    model: 'test-model',
    usage: { totalTokens: 12 }
  };
  const chain = createTestCaseGenerationChain({
    complete: async request => {
      assert.equal(request.prompt, 'Generate cases');
      assert.equal(request.temperature, 0.4);
      return completion;
    },
    parseOutput: content => JSON.parse(content)
  });

  const result = await chain.invoke({ prompt: 'Generate cases', temperature: 0.4 });

  assert.equal(result.completion, completion);
  assert.deepEqual(result.parsedResponse, { newTestCases: [{ testCaseId: 'TC-1' }] });
});

test('generation chain preserves message-based requests', async () => {
  const messages = [{ role: 'user', content: 'Generate cases' }];
  const chain = createTestCaseGenerationChain({
    complete: async request => {
      assert.equal(request.messages, messages);
      return { content: '{"newTestCases":[]}' };
    },
    parseOutput: content => JSON.parse(content)
  });

  const result = await chain.invoke({ messages });

  assert.deepEqual(result.parsedResponse, { newTestCases: [] });
});

test('generation chain rejects requests without a prompt or messages', async () => {
  const chain = createTestCaseGenerationChain({
    complete: async () => {
      throw new Error('Model invocation must not run');
    }
  });

  await assert.rejects(chain.invoke({}), /Prompt or messages is required/);
});
