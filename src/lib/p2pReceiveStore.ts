type IncomingFile = {
  fileId: string;
  filename: string;
  mime: string;
  size: number;
  totalChunks: number;
  receivedChunks: Map<number, Uint8Array>;
};

type IncomingMessage = {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  files: Map<string, IncomingFile>;
};

const incomingMessages = new Map<string, IncomingMessage>();

export function getIncoming(messageId: string) {
  return incomingMessages.get(messageId);
}

export function createIncoming(meta: IncomingMessage) {
  incomingMessages.set(meta.messageId, meta);
}
