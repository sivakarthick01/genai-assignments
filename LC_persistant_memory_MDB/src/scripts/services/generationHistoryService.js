import { randomUUID } from 'crypto';
import { MongoClient } from 'mongodb';

const PLACEHOLDER_VALUE = /^your_/i;

function getCollectionSettings(env) {
  const historyCollectionName = env.GENERATION_HISTORY_COLLECTION_NAME;

  if (!env.MONGODB_URI || !env.DB_NAME || !historyCollectionName || PLACEHOLDER_VALUE.test(historyCollectionName)) {
    const details = !historyCollectionName || PLACEHOLDER_VALUE.test(historyCollectionName)
      ? 'Set GENERATION_HISTORY_COLLECTION_NAME.'
      : 'Set MONGODB_URI and DB_NAME.';
    throw new Error(`Generation memory storage is not configured. ${details}`);
  }

  return {
    uri: env.MONGODB_URI,
    databaseName: env.DB_NAME,
    historyCollectionName
  };
}

export function createGenerationHistoryService({
  createClient = uri => new MongoClient(uri),
  getEnv = () => process.env,
  createId = randomUUID,
  now = () => new Date()
} = {}) {
  async function withCollections(callback) {
    const settings = getCollectionSettings(getEnv());
    const client = createClient(settings.uri);

    try {
      await client.connect();
      const database = client.db(settings.databaseName);
      return await callback({
        client,
        historyCollection: database.collection(settings.historyCollectionName)
      });
    } finally {
      await client.close();
    }
  }

  return {
    async saveGeneration({ request, completion, parsedResponse, responseData }) {
      const memoryRecordId = createId();
      const createdAt = now();
      const input = {
        prompt: request.prompt || null,
        messages: request.messages || null,
        systemPrompt: request.systemPrompt || null,
        conversationId: request.conversationId || null
      };
      const userQuery = typeof request.userQuery === 'string' && request.userQuery.trim()
        ? request.userQuery
        : request.prompt || null;
      const generation = {
        _id: memoryRecordId,
        memoryRecordId,
        generationId: memoryRecordId,
        executionId: request.executionId || null,
        conversationId: request.conversationId || null,
        createdAt,
        metadata: {
          userQuery,
          generatedTestCases: Array.isArray(parsedResponse?.newTestCases)
            ? parsedResponse.newTestCases
            : [],
          conversationId: request.conversationId || null,
          executionId: request.executionId || null,
          generatedAt: createdAt
        },
        input,
        settings: {
          provider: request.provider || null,
          model: request.model || null,
          temperature: request.temperature ?? null,
          maxTokens: request.maxTokens ?? null
        },
        output: {
          parsed: parsedResponse,
          rawContent: completion.content || ''
        },
        model: completion.model || null,
        provider: completion.provider || null,
        fallbackUsed: completion.fallbackUsed || false,
        tokens: responseData.tokens
      };
      await withCollections(async ({ client, historyCollection }) => {
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            await historyCollection.insertOne(generation, { session });
          });
        } finally {
          await session.endSession();
        }
      });

      return memoryRecordId;
    },

    async listHistory(limit = 20) {
      return withCollections(({ historyCollection }) =>
        historyCollection.find({}).sort({ createdAt: -1 }).limit(limit).toArray()
      );
    }
  };
}

export const generationHistoryService = createGenerationHistoryService();
