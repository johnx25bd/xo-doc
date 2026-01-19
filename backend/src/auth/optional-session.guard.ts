/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { AuthProviderType } from '@hedgedoc/commons';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { CompleteRequest } from '../api/utils/request.type';
import { ConsoleLoggerService } from '../logger/console-logger.service';

/**
 * This guard checks for an optional session.
 *
 * Unlike SessionGuard, this guard allows requests without a valid session (guests).
 * If a session exists, the userId and authProviderType are attached to the request.
 * If no session exists, the request proceeds with undefined userId (guest mode).
 *
 * Use this guard for endpoints that should be accessible to both authenticated
 * users and guests, such as comments on publicly accessible notes.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly logger: ConsoleLoggerService) {
    this.logger.setContext(OptionalSessionGuard.name);
  }

  /**
   * Checks if the request has a valid session and attaches user info if present.
   *
   * @param context The execution context containing the request.
   * @returns always true (allows both authenticated and guest access)
   */
  canActivate(context: ExecutionContext): boolean {
    const request: CompleteRequest = context.switchToHttp().getRequest();
    const userId = request.session?.userId;
    const authProviderType = request.session?.authProviderType;

    if (userId && authProviderType) {
      // User is authenticated
      request.userId = userId;
      request.authProviderType = authProviderType;
      this.logger.debug(`Authenticated user ${userId} accessing resource`, 'canActivate');
    } else {
      // Guest access - mark as guest provider
      request.userId = undefined;
      request.authProviderType = AuthProviderType.GUEST;
      this.logger.debug('Guest accessing resource', 'canActivate');
    }

    return true;
  }
}
