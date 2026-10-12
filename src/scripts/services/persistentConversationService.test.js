import test from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  createPersistentConversationService,
  isValidConversationId
} from './persistentConversationService.js';

const conversationId = '00000000-0000-4000-8000-000000000001';

function createHarness({ env = {} } = {}) {
  const histories = new Map();
  let clientClosed = false;
  const service = createPersistentConversationService({
    createClient: () => ({
      connect: async () => {},
      close: async () => { clientClosed = true; },
      db: name => {
        assert.equal(name, 'test_database');
        return { collection: collectionName => ({ collectionName }) };
      }
    }),
    createHistory: ({ collection, sessionId }) => {
      assert.equal(collection.collectionName, 'conversation_history');
      if (!histories.has(sessionId)) histories.set(sessionId, []);
      const messages = histories.get(sessionId);
      return {
        getMessages: async () => [...messages],
        addMessages: async newMessages => messages.push(...newMessages),
        clear: async () => { messages.splice(0); }
      };
    },
    getEnv: () => ({
      MONGODB_URI: 'mongodb://localhost',
      DB_NAME: 'test_database',
      CONVERSATION_HISTORY_COLLECTION_NAME: 'conversation_history',
      COLLECTION_NAME: 'test_cases',
      USER_STORIES_COLLECTION_NAME: 'user_stories',
      GENERATION_HISTORY_COLLECTION_NAME: 'generation_history',
      GENERATION_MEMORY_COLLECTION_NAME: 'generation_memory',
      ...env
    })
  });

  return { service, histories, getClientClosed: () => clientClosed };
}

test('validates conversation IDs as UUIDs', () => {
  assert.equal(isValidConversationId(conversationId), true);
  assert.equal(isValidConversationId('{"$ne":null}'), false);
  assert.equal(isValidConversationId(''), false);
});

test('reuses prior conversation turns across separate generation calls', async () => {
  const { service, histories, getClientClosed } = createHarness();
  const first = await service.run({
    conversationId,
    request: { prompt: 'Create cases for login' },
    generate: async request => {
      assert.deepEqual(request.messages, [{ role: 'user', content: 'Create cases for login' }]);
      return { completion: { content: 'Created login cases' }, parsedResponse: {} };
    }
  });

  const second = await service.run({
    conversationId,
    request: { prompt: 'Add password reset edge cases' },
    generate: async request => {
      assert.deepEqual(request.messages, [
        { role: 'user', content: 'Create cases for login' },
        { role: 'assistant', content: 'Created login cases' },
        { role: 'user', content: 'Add password reset edge cases' }
      ]);
      return { completion: { content: 'Added reset cases' }, parsedResponse: {} };
    }
  });

  assert.equal(first.contextMessagesUsed, 0);
  assert.equal(second.contextMessagesUsed, 2);
  assert.equal(histories.get(conversationId).length, 4);
  assert.equal(second.conversationId, conversationId);
  assert.equal(getClientClosed(), true);
});

test('does not save an unsuccessful generation to persistent history', async () => {
  const { service, histories } = createHarness();

  await assert.rejects(
    service.run({
      conversationId,
      request: { prompt: 'This generation fails' },
      generate: async () => { throw new Error('LLM failed'); }
    }),
    /LLM failed/
  );
  assert.equal(histories.get(conversationId).length, 0);
});

test('bounds injected memory to six messages while retaining the start and end of long prompts', async () => {
  const { service, histories } = createHarness();
  const longMessage = `${'start '.repeat(300)}${'middle '.repeat(300)}${'end '.repeat(300)}`;
  histories.set(conversationId, [
    new HumanMessage('old turn'),
    new AIMessage('old response'),
    new HumanMessage('second turn'),
    new AIMessage('second response'),
    new HumanMessage(longMessage),
    new AIMessage('latest response'),
    new HumanMessage('most recent turn'),
    new AIMessage('most recent response')
  ]);

  await service.run({
    conversationId,
    request: { prompt: 'Continue' },
    generate: async request => {
      assert.equal(request.messages.length, 7);
      const retainedPrompt = request.messages[2].content;
      assert.ok(retainedPrompt.startsWith('start '));
      assert.ok(retainedPrompt.endsWith('end '));
      assert.ok(retainedPrompt.includes('[conversation memory truncated]'));
      return { completion: { content: 'continued' } };
    }
  });
});

test('does not connect for invalid IDs or unconfigured collections', async () => {
  let clientCreated = false;
  const service = createPersistentConversationService({
    createClient: () => {
      clientCreated = true;
      throw new Error('Mongo client must not be created');
    },
    getEnv: () => ({
      MONGODB_URI: 'mongodb://localhost',
      DB_NAME: 'test_database',
      CONVERSATION_HISTORY_COLLECTION_NAME: 'your_conversation_history_collection_name'
    })
  });

  await assert.rejects(
    service.run({ conversationId: 'not-a-uuid', request: {}, generate: async () => ({}) }),
    /valid UUID conversationId/
  );
  await assert.rejects(
    service.getMessages(conversationId),
    /CONVERSATION_HISTORY_COLLECTION_NAME/
  );
  assert.equal(clientCreated, false);
});

test('rejects collection collisions and clear removes a conversation', async () => {
  const { service } = createHarness({
    env: { CONVERSATION_HISTORY_COLLECTION_NAME: 'test_cases' }
  });
  await assert.rejects(service.getMessages(conversationId), /separate from test cases/);

  const secondHarness = createHarness();
  secondHarness.histories.set(conversationId, [new HumanMessage('older'), new AIMessage('answer')]);
  await secondHarness.service.run({
    conversationId,
    request: { prompt: 'another turn' },
    generate: async () => ({ completion: { content: 'response' } })
  });
  await secondHarness.service.clear(conversationId);
  assert.deepEqual(await secondHarness.service.getMessages(conversationId), []);
});
