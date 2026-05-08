export interface SSEHandlers {
  onChunk: (text: string) => void;
  onThinking: (text: string) => void;
  onDone: (payload: any) => void;
  onError: (message: string) => void;
}

export async function consumeSSEStream(response: Response, handlers: SSEHandlers): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;

      const payload = JSON.parse(line.slice(6));

      if (payload.type === 'chunk') {
        handlers.onChunk(payload.text);
      } else if (payload.type === 'thinking') {
        handlers.onThinking(payload.text);
      } else if (payload.type === 'done') {
        handlers.onDone(payload);
      } else if (payload.type === 'error') {
        handlers.onError(payload.message || 'Stream error');
      }
    }
  }
}
