import { describe, expect, it, vi } from 'vitest';
import { JsonRpcPeer, JsonRpcRemoteError } from '../../src/core/json-rpc.js';
import { AdapterError } from '../../src/errors.js';
import { createLinkedTransports, ScriptedJsonRpcServer, ScriptedRpcError } from '../../src/testing/index.js';

function setup(options: ConstructorParameters<typeof JsonRpcPeer>[1] = {}) {
  const [clientSide, serverSide] = createLinkedTransports();
  const client = new JsonRpcPeer(clientSide, options);
  const server = new ScriptedJsonRpcServer(serverSide);
  return { client, server, clientSide, serverSide };
}

describe('JsonRpcPeer', () => {
  it('correlates responses to requests, also out of order', async () => {
    const { client, server } = setup();
    let releaseSlow!: () => void;
    server.handle('slow', () => new Promise((resolve) => (releaseSlow = () => resolve({ v: 'slow' }))));
    server.handle('fast', (params) => ({ echo: params }));
    const slow = client.request('slow');
    const fast = await client.request('fast', { x: 1 });
    expect(fast).toEqual({ echo: { x: 1 } });
    releaseSlow();
    expect(await slow).toEqual({ v: 'slow' });
    expect(client.pendingRequestCount).toBe(0);
  });

  it('rejects with JsonRpcRemoteError on error responses', async () => {
    const { client, server } = setup();
    server.handle('thread/resume', () => {
      throw new ScriptedRpcError({ code: -32600, message: 'thread not found' });
    });
    const error = await client.request('thread/resume', { threadId: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JsonRpcRemoteError);
    expect((error as JsonRpcRemoteError).code).toBe(-32600);
    expect((error as JsonRpcRemoteError).method).toBe('thread/resume');
  });

  it('times out, drops the pending entry and reports a late response', async () => {
    const onLateResponse = vi.fn();
    const { client, server } = setup({ onLateResponse });
    let release!: () => void;
    server.handle('hang', () => new Promise((resolve) => (release = () => resolve({}))));
    const error = await client.request('hang', undefined, { timeoutMs: 20 }).catch((e: unknown) => e);
    expect((error as AdapterError).code).toBe('timeout');
    expect(client.pendingRequestCount).toBe(0);
    release();
    await vi.waitFor(() => expect(onLateResponse).toHaveBeenCalledTimes(1));
  });

  it('delivers notifications in both directions', async () => {
    const { client, server } = setup();
    const seen: string[] = [];
    client.onNotification((n) => seen.push(n.method));
    server.notify('turn/started', { turn: { id: 't1' } });
    client.notify('initialized', {});
    await server.waitFor('initialized');
    await vi.waitFor(() => expect(seen).toEqual(['turn/started']));
  });

  it('tracks server-initiated requests until answered exactly once', async () => {
    const { client, server } = setup();
    const answered = new Promise<unknown>((resolve) => {
      client.onRequest((request) => {
        expect(client.pendingIncoming.map((r) => r.id)).toContain(request.id);
        setTimeout(() => {
          request.respond({ decision: 'decline' });
          expect(() => request.respond({ decision: 'accept' })).toThrow(/already answered/);
          resolve(undefined);
        }, 5);
      });
    });
    const result = await server.request('item/commandExecution/requestApproval', { itemId: 'i1' });
    await answered;
    expect(result).toEqual({ decision: 'decline' });
    expect(client.pendingIncoming).toHaveLength(0);
  });

  it('answers -32601 when no request handler is registered', async () => {
    const { server } = setup();
    const error = await server.request('item/tool/call', {}).catch((e: unknown) => e);
    expect((error as JsonRpcRemoteError).code).toBe(-32601);
  });

  it('fails all pending requests when the transport closes', async () => {
    const { client, server } = setup();
    server.handle('never', () => new Promise(() => {}));
    const pending = client.request('never');
    await server.waitFor('never');
    server.close();
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe('runtime_crashed');
    expect(client.closed).toBe(true);
    await expect(client.request('again')).rejects.toBeInstanceOf(AdapterError);
  });

  it('reports malformed lines without closing', async () => {
    const onProtocolError = vi.fn();
    const [clientSide, serverSide] = createLinkedTransports();
    const client = new JsonRpcPeer(clientSide, { onProtocolError });
    const notifications = vi.fn();
    client.onNotification(notifications);
    serverSide.send('not json');
    serverSide.send('[1,2]');
    serverSide.send('{"foo":1}');
    serverSide.send('{"method":"ok"}');
    await vi.waitFor(() => expect(notifications).toHaveBeenCalledTimes(1));
    expect(onProtocolError).toHaveBeenCalledTimes(3);
    expect(client.closed).toBe(false);
  });

  it('omits the jsonrpc field by default and adds it when configured', async () => {
    const [clientSide, serverSide] = createLinkedTransports();
    const raw: string[] = [];
    serverSide.onLine((line) => raw.push(line));
    const plain = new JsonRpcPeer(clientSide);
    plain.notify('a');
    const versioned = new JsonRpcPeer(clientSide, { includeVersion: true });
    versioned.notify('b');
    await vi.waitFor(() => expect(raw).toHaveLength(2));
    expect(JSON.parse(raw[0]!)).toEqual({ method: 'a' });
    expect(JSON.parse(raw[1]!)).toEqual({ jsonrpc: '2.0', method: 'b' });
  });

  it('honours abort signals', async () => {
    const { client, server } = setup();
    server.handle('hang', () => new Promise(() => {}));
    const controller = new AbortController();
    const pending = client.request('hang', undefined, { signal: controller.signal });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect(client.pendingRequestCount).toBe(0);
  });
});
