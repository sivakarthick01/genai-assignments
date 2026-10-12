import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { MongoDBChatMessageHistory } from '@langchain/mongodb';
import { MongoClient } from 'mongodb';

const PLACEHOLDER_VALUE = /^your_/i;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CONTEXT_MESSAGE_LENGTH = 2500;
const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidConversationId(conversationId) {
  return typeof conversationId === 'string' && CONVERSATION_ID_PATTERN.test(conversationId);
}

function getConversationSettings(env) {
  const collectionName = env.CONVERSATION_HISTORY_COLLECTION_NAME;
  if (!env.MONGODB_URI || !env.DB_NAME || !collectionName || PLACEHOLDER_VALUE.test(collectionName)) {
    throw new Error(
      'Persistent conversation memory is not configured. Set MONGODB_URI, DB_NAME, and CONVERSATION_HISTORY_COLLECTION_NAME.'
    );
  }

  const otherCollections = [
    env.COLLECTION_NAME,
    env.USER_STORIES_COLLECTION_NAME,
    env.GENERATION_HISTORY_COLLECTION_NAME
  ].filter(Boolean);
  if (otherCollections.includes(collectionName)) {
    throw new Error('Conversation history must use a MongoDB collection separate from test cases, user stories, generation history, and generation memory.');
  }

  return {
    uri: env.MONGODB_URI,
    databaseName: env.DB_NAME,
    collectionName
  };
}

function messageText(content) {
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

function formatHistoryMessage(message) {
  const role = message.getType() === 'human' ? 'user' : 'assistant';
  const text = messageText(message.content);
  return {
    role,
    content: text.length > MAX_CONTEXT_MESSAGE_LENGTH
      ? `${text.slice(0, MAX_CONTEXT_MESSAGE_LENGTH / 2)}\n...[conversation memory truncated]...\n${text.slice(-MAX_CONTEXT_MESSAGE_LENGTH / 2)}`
      : text
  };
}

function currentUserContent(request) {
  if (typeof request.prompt === 'string' && request.prompt.length > 0) return request.prompt;
  const latestUserMessage = [...(request.messages || [])]
    .reverse()
    .find(message => message.role === 'user' || message.role === 'human');
  return latestUserMessage ? messageText(latestUserMessage.content) : '';
}

function buildRequestWithHistory(request, historyMessages) {
  const priorMessages = historyMessages
    .filter(message => message.getType() === 'human' || message.getType() === 'ai')
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(formatHistoryMessage);
  const suppliedMessages = Array.isArray(request.messages) ? request.messages : [];
  const systemMessages = suppliedMessages.filter(message => message.role === 'system');
  if (request.systemPrompt && systemMessages.length === 0) {
    systemMessages.unshift({ role: 'system', content: request.systemPrompt });
  }
  const currentMessages = suppliedMessages.length > 0
    ? suppliedMessages.filter(message => message.role !== 'system')
    : request.prompt
      ? [{ role: 'user', content: request.prompt }]
      : [];

  const {
    prompt,
    messages,
    systemPrompt,
    ...completionOptions
  } = request;

  return {
    ...completionOptions,
    messages: [...systemMessages, ...priorMessages, ...currentMessages]
  };
}

export function createPersistentConversationService({
  createClient = uri => new MongoClient(uri),
  createHistory = options => new MongoDBChatMessageHistory(options),
  getEnv = () => process.env
} = {}) {
  async function withHistory(conversationId, callback) {
    if (!isValidConversationId(conversationId)) {
      throw new Error('A valid UUID conversationId is required.');
    }

    const settings = getConversationSettings(getEnv());
    const client = createClient(settings.uri);

    try {
      await client.connect();
      const collection = client.db(settings.databaseName).collection(settings.collectionName);
      const history = createHistory({ collection, sessionId: conversationId });
      return await callback(history);
    } finally {
      await client.close();
    }
  }

  return {
    async run({ conversationId, request, generate }) {
      return withHistory(conversationId, async history => {
        const existingMessages = await history.getMessages();
        const completionRequest = buildRequestWithHistory(request, existingMessages);
        const result = await generate(completionRequest);
        const userContent = currentUserContent(request);

        if (userContent) {
          await history.addMessages([
            new HumanMessage(userContent),
            new AIMessage(result.completion.content || '')
          ]);
        }

        return {
          ...result,
          conversationId,
          contextMessagesUsed: Math.min(
            existingMessages.filter(message => message.getType() === 'human' || message.getType() === 'ai').length,
            MAX_CONTEXT_MESSAGES
          )
        };
      });
    },

    async getMessages(conversationId) {
      return withHistory(conversationId, history => history.getMessages());
    },

    async clear(conversationId) {
      return withHistory(conversationId, history => history.clear());
    }
  };
}

export const persistentConversationService = createPersistentConversationService();
