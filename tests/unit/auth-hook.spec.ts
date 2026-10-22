import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handle } from '../../src/hooks.server';

const dependencies = vi.hoisted(() => ({ getSession: vi.fn(), handler: vi.fn() }));

vi.mock('$app/environment', () => ({ building: false }));
vi.mock('../../src/lib/server/auth', () => ({ auth: { api: { getSession: dependencies.getSession } } }));
vi.mock('../../src/lib/config/config.server', () => ({
  config: { auth: { session: { cookiePrefix: 'somakase' } } }
}));
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler: dependencies.handler }));

type HandleInput = Parameters<typeof handle>[0];

function input(headers?: HeadersInit): HandleInput {
  return {
    event: {
      request: new Request('http://localhost/api/map/analytics', { headers }),
      locals: { session: null, user: null }
    },
    resolve: vi.fn()
  } as unknown as HandleInput;
}

beforeEach(() => {
  dependencies.getSession.mockReset().mockResolvedValue(null);
  dependencies.handler.mockReset().mockResolvedValue(new Response('resolved'));
});

describe('session lookup in the server hook', () => {
  it.each([undefined, { cookie: 'preferences=light; analytics=visitor' }])(
    'skips anonymous session lookup while retaining the Better Auth handler',
    async (headers) => {
      const request = input(headers);
      const response = await handle(request);
      expect(dependencies.getSession).not.toHaveBeenCalled();
      expect(request.event.locals.session).toBeNull();
      expect(request.event.locals.user).toBeNull();
      expect(dependencies.handler).toHaveBeenCalledWith(expect.objectContaining(request));
      expect(await response.text()).toBe('resolved');
    }
  );

  it.each([
    'somakase.session_token',
    '__Secure-somakase.session_token',
    'somakase-session_token',
    '__Secure-somakase-session_token'
  ])('resolves authenticated locals for %s cookies', async (cookieName) => {
    const session = { session: { id: 'session-1' }, user: { id: 'user-1' } };
    dependencies.getSession.mockResolvedValue(session);
    const request = input({ cookie: `${cookieName}=signed-token` });
    await handle(request);
    expect(dependencies.getSession).toHaveBeenCalledWith({ headers: request.event.request.headers });
    expect(request.event.locals.session).toEqual(session.session);
    expect(request.event.locals.user).toEqual(session.user);
  });

  it('retains session resolution for authorization headers and rejects invalid sessions', async () => {
    const request = input({ authorization: 'Bearer token' });
    await handle(request);
    expect(dependencies.getSession).toHaveBeenCalledOnce();
    expect(request.event.locals.session).toBeNull();
    expect(request.event.locals.user).toBeNull();
  });
});
