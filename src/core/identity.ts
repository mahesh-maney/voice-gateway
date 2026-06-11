import type { Repository } from '../repository/repository.js';
import type { SourcePlatform } from '../domain/canonical-command.js';
import { AccountNotLinkedError } from './errors.js';
import { logger } from '../util/logger.js';

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
    logger.debug('identity.lookup.start', {
      platform: input.platform,
      hasAccessToken: !!input.accessToken,
      hasPlatformUserId: !!input.platformUserId,
      // Never log the raw token value — only its presence
    });

    if (input.accessToken) {
      logger.debug('identity.lookup.token', { platform: input.platform });
      const user = await this.repo.getUserByAccessToken(input.accessToken);
      if (user) {
        logger.info('identity.resolved', {
          platform: input.platform,
          userId: user.id,
          method: 'accessToken',
        });
        return user.id;
      }
      logger.debug('identity.token.miss', { platform: input.platform });
    }

    if (input.platformUserId) {
      logger.debug('identity.lookup.platformId', {
        platform: input.platform,
        platformUserId: input.platformUserId,
      });
      const user = await this.repo.getUserByPlatformId(input.platform, input.platformUserId);
      if (user) {
        logger.info('identity.resolved', {
          platform: input.platform,
          userId: user.id,
          method: 'platformUserId',
          platformUserId: input.platformUserId,
        });
        return user.id;
      }
      logger.debug('identity.platformId.miss', {
        platform: input.platform,
        platformUserId: input.platformUserId,
      });
    }

    logger.warn('identity.failed', {
      platform: input.platform,
      hasAccessToken: !!input.accessToken,
      hasPlatformUserId: !!input.platformUserId,
      reason: 'AccountNotLinked',
    });
    throw new AccountNotLinkedError();
  }
}
