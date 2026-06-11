import type { Repository } from '../repository/repository.js';
import type { SourcePlatform } from '../domain/canonical-command.js';
import { AccountNotLinkedError } from './errors.js';

/**
 * Turns a platform's account-linking token (or platform user id) into OUR
 * internal user id. This is a SHARED gateway concern — every adapter relies
 * on it, so the core never sees a platform-specific user id.
 */
export class IdentityResolver {
  constructor(private readonly repo: Repository) {}

  async resolveUserId(input: {
    platform: SourcePlatform;
    accessToken?: string;
    platformUserId?: string;
  }): Promise<string> {
    if (input.accessToken) {
      const user = await this.repo.getUserByAccessToken(input.accessToken);
      if (user) return user.id;
    }
    if (input.platformUserId) {
      const user = await this.repo.getUserByPlatformId(input.platform, input.platformUserId);
      if (user) return user.id;
    }
    throw new AccountNotLinkedError();
  }
}
