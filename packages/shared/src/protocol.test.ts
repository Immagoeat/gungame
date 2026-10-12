import { describe, expect, it } from 'vitest';
import { encodeMessage, parseClientMessage, PROTOCOL_VERSION } from './protocol';

describe('protocol', () => {
  it('round-trips a client message', () => {
    const raw = encodeMessage({ t: 'hello', version: PROTOCOL_VERSION, name: 'Ace' });
    expect(parseClientMessage(raw)).toEqual({ t: 'hello', version: PROTOCOL_VERSION, name: 'Ace' });
  });

  it('rejects malformed and unknown messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"t":"hack"}')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
  });
});
