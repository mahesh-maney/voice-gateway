import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/repository/in-memory.repository.js';
import { IdentityResolver } from '../src/core/identity.js';
import { AccountNotLinkedError } from '../src/core/errors.js';

const resolver = new IdentityResolver(new InMemoryRepository());

describe('IdentityResolver', () => {
  it('resolves userId from access token', async () => {
    const userId = await resolver.resolveUserId({
      platform: 'alexa',
      accessToken: 'demo-token-ravi',
    });
    expect(userId).toBe('user_42');
  });

  it('resolves userId from platform user id when no access token is provided', async () => {
    const userId = await resolver.resolveUserId({
      platform: 'alexa',
      platformUserId: 'amzn1.ask.account.RAVI',
    });
    expect(userId).toBe('user_42');
  });

  it('access token takes priority — resolves even when platformUserId is unknown', async () => {
    const userId = await resolver.resolveUserId({
      platform: 'alexa',
      accessToken: 'demo-token-ravi',
      platformUserId: 'amzn1.ask.account.NOBODY',
    });
    expect(userId).toBe('user_42');
  });

  it('throws AccountNotLinkedError for an unknown access token', async () => {
    await expect(
      resolver.resolveUserId({ platform: 'alexa', accessToken: 'not-a-real-token' }),
    ).rejects.toThrow(AccountNotLinkedError);
  });

  it('throws AccountNotLinkedError for an unknown platform user id', async () => {
    await expect(
      resolver.resolveUserId({ platform: 'alexa', platformUserId: 'amzn1.ask.account.GHOST' }),
    ).rejects.toThrow(AccountNotLinkedError);
  });

  it('throws AccountNotLinkedError when neither token nor platformUserId is provided', async () => {
    await expect(
      resolver.resolveUserId({ platform: 'alexa' }),
    ).rejects.toThrow(AccountNotLinkedError);
  });

  it('throws AccountNotLinkedError for the wrong platform even if the userId exists on another', async () => {
    // 'amzn1.ask.account.RAVI' is registered for 'alexa', not 'google'
    await expect(
      resolver.resolveUserId({ platform: 'google', platformUserId: 'amzn1.ask.account.RAVI' }),
    ).rejects.toThrow(AccountNotLinkedError);
  });
});
