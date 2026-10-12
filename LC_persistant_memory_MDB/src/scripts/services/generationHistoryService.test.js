import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationHistoryService } from './generationHistoryService.js';

function createServiceHarness({ env = {} } = {}) {
  const inserted = [];
  let idCounter = 0;
  let transactionEnded = false;
  let clientClosed = false;
  const historyCollection = {
    insertOne: async document => inserted.push(document),
    find: () => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => inserted
        })
      })
    })
  };
  const client = {
    connect: async () => {},
    close: async () => { clientClosed = true; },
    db: databaseName => {
      assert.equal(databaseName, 'test_database');
      return {
        collection: name => {
          assert.equal(name, 'generation_history');
          return historyCollection;
        }
      };
    },
    startSession: () => ({
      withTransaction: async callback => {
        await callback();
        transactionEnded = true;
      },
      endSession: async () => {}
    })
  };
  const service = createGenerationHistoryService({
    createClient: uri => {
      assert.equal(uri, 'mongodb://localhost');
      return client;
    },
    getEnv: () => ({
      MONGODB_URI: 'mongodb://localhost',
      DB_NAME: 'test_database',
      GENERATION_HISTORY_COLLECTION_NAME: 'generation_history',
      ...env
    }),
    createId: () => `generation-${++idCounter}`,
    now: () => new Date('2026-10-11T00:00:00.000Z')
  });

  return { service, inserted, getTransactionEnded: () => transactionEnded, getClientClosed: () => clientClosed };
}

test('saves one generation history record in a transaction', async () => {
  const { service, inserted, getTransactionEnded, getClientClosed } = createServiceHarness();
  const parsedResponse = { newTestCases: [{ testCaseId: 'TC-1' }] };
  const generationId = await service.saveGeneration({
    request: {
      prompt: 'Detailed prompt',
      userQuery: 'As a patient, I can sign in',
      conversationId: 'conversation-1',
      executionId: 'execution-1',
      temperature: 0.3
    },
    completion: { content: '{"newTestCases":[]}', provider: 'test', model: 'model-1' },
    parsedResponse,
    responseData: { tokens: { total: 10 } }
  });

  assert.equal(generationId, 'generation-1');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]._id, generationId);
  assert.equal(inserted[0].memoryRecordId, generationId);
  assert.equal(inserted[0].generationId, generationId);
  assert.equal(inserted[0].metadata.userQuery, 'As a patient, I can sign in');
  assert.deepEqual(inserted[0].metadata.generatedTestCases, parsedResponse.newTestCases);
  assert.equal(inserted[0].metadata.conversationId, 'conversation-1');
  assert.equal(inserted[0].metadata.executionId, 'execution-1');
  assert.equal(inserted[0].metadata.generatedAt.toISOString(), '2026-10-11T00:00:00.000Z');
  assert.equal(inserted[0].createdAt, inserted[0].metadata.generatedAt);
  assert.deepEqual(inserted[0].output.parsed, parsedResponse);
  assert.equal(getTransactionEnded(), true);
  assert.equal(getClientClosed(), true);
});

test('correlates a memory record to its execution and conversation IDs', async () => {
  const { service, inserted } = createServiceHarness();
  const firstMemoryRecordId = await service.saveGeneration({
    request: {
      prompt: 'Generate cases',
      conversationId: 'conversation-1',
      executionId: 'execution-1'
    },
    completion: { content: 'generated' },
    parsedResponse: { newTestCases: [] },
    responseData: { tokens: { total: 1 } }
  });
  const secondMemoryRecordId = await service.saveGeneration({
    request: {
      prompt: 'Generate more cases',
      conversationId: 'conversation-1',
      executionId: 'execution-2'
    },
    completion: { content: 'more generated' },
    parsedResponse: { newTestCases: [] },
    responseData: { tokens: { total: 1 } }
  });

  assert.equal(inserted[0].memoryRecordId, firstMemoryRecordId);
  assert.equal(inserted[0].executionId, 'execution-1');
  assert.equal(inserted[0].conversationId, 'conversation-1');
  assert.equal(inserted[0].input.conversationId, 'conversation-1');
  assert.notEqual(firstMemoryRecordId, secondMemoryRecordId);
  assert.equal(inserted[1].executionId, 'execution-2');
});

test('does not connect when collection names are still placeholders', async () => {
  let clientCreated = false;
  const service = createGenerationHistoryService({
    createClient: () => {
      clientCreated = true;
      throw new Error('Mongo client must not be created');
    },
    getEnv: () => ({
      MONGODB_URI: 'mongodb://localhost',
      DB_NAME: 'test_database',
      GENERATION_HISTORY_COLLECTION_NAME: 'your_generation_history_collection_name'
    })
  });

  await assert.rejects(
    service.listHistory(),
    /Set GENERATION_HISTORY_COLLECTION_NAME/
  );
  assert.equal(clientCreated, false);
});
