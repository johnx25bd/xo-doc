/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { PermissionLevel } from '@hedgedoc/commons';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OptionalSessionGuard } from '../../../auth/optional-session.guard.js';
import { CommentsService, GuestInfo } from '../../../comments/comments.service.js';
import { CommentThreadDto } from '../../../dtos/comment-thread.dto.js';
import { CommentDto } from '../../../dtos/comment.dto.js';
import { CreateCommentThreadDto } from '../../../dtos/create-comment-thread.dto.js';
import { CreateCommentDto } from '../../../dtos/create-comment.dto.js';
import { ResolveThreadDto } from '../../../dtos/resolve-thread.dto.js';
import { UpdateCommentDto } from '../../../dtos/update-comment.dto.js';
import { PermissionError } from '../../../errors/errors.js';
import { ConsoleLoggerService } from '../../../logger/console-logger.service.js';
import { PermissionService } from '../../../permissions/permission.service.js';
import { PermissionsGuard } from '../../../permissions/permissions.guard.js';
import { RequirePermission } from '../../../permissions/require-permission.decorator.js';
import { OpenApi } from '../../utils/decorators/openapi.decorator.js';
import { RequestGuestSession } from '../../utils/decorators/request-guest-session.decorator.js';
import { RequestNoteId } from '../../utils/decorators/request-note-id.decorator.js';
import { RequestUserId } from '../../utils/decorators/request-user-id.decorator.js';
import { GetNoteIdInterceptor } from '../../utils/interceptors/get-note-id.interceptor.js';

/**
 * Controller for comment operations on notes.
 *
 * Provides REST API endpoints for:
 * - Listing comment threads on a note
 * - Creating new comment threads
 * - Adding replies to threads
 * - Editing and deleting comments
 * - Resolving/unresolving threads
 *
 * Permission model (mirrors document permissions):
 * - View/create comments: READ permission on note
 * - Edit own comment: Author or WRITE permission
 * - Delete own comment: Author or WRITE permission
 * - Delete others' comments: WRITE permission
 * - Resolve own thread: Thread author (logged in only)
 * - Resolve any thread: WRITE permission
 *
 * Guests can comment but cannot resolve threads.
 */
@UseGuards(OptionalSessionGuard, PermissionsGuard)
@OpenApi(403)
@ApiTags('comments')
@Controller('notes')
export class CommentsController {
  constructor(
    private readonly logger: ConsoleLoggerService,
    private readonly commentsService: CommentsService,
    private readonly permissionService: PermissionService,
  ) {
    this.logger.setContext(CommentsController.name);
  }

  /**
   * Get all comment threads for a note.
   */
  @Get(':noteAlias/comments')
  @OpenApi(200, 401, 404)
  @RequirePermission(PermissionLevel.READ)
  @UseInterceptors(GetNoteIdInterceptor)
  async getThreads(
    @RequestNoteId() noteId: number,
  ): Promise<CommentThreadDto[]> {
    return await this.commentsService.getThreadsForNote(noteId);
  }

  /**
   * Create a new comment thread on a note.
   */
  @Post(':noteAlias/comments')
  @OpenApi(201, 400, 401, 404)
  @RequirePermission(PermissionLevel.READ)
  @UseInterceptors(GetNoteIdInterceptor)
  async createThread(
    @RequestNoteId() noteId: number,
    @RequestUserId() userId: number | undefined,
    @RequestGuestSession() guestSession: string | null,
    @Body() createThreadDto: CreateCommentThreadDto,
  ): Promise<CommentThreadDto> {
    const guestInfo = this.resolveGuestInfo(
      userId,
      guestSession,
      createThreadDto.guestName,
    );

    return await this.commentsService.createThread(
      noteId,
      userId ?? null,
      guestInfo,
      createThreadDto.anchorText,
      createThreadDto.anchorStart,
      createThreadDto.anchorEnd,
      createThreadDto.initialComment,
    );
  }

  /**
   * Get a single comment thread by ID.
   */
  @Get('threads/:threadId')
  @OpenApi(200, 401, 404)
  async getThread(
    @Param('threadId', ParseIntPipe) threadId: number,
    @RequestUserId() userId: number | undefined,
  ): Promise<CommentThreadDto> {
    // Check permission on the parent note
    const noteId = await this.commentsService.getNoteIdForThread(threadId);
    await this.checkNotePermission(userId, noteId, PermissionLevel.READ);

    return await this.commentsService.getThread(threadId);
  }

  /**
   * Add a comment (reply) to an existing thread.
   */
  @Post('threads/:threadId/comments')
  @OpenApi(201, 400, 401, 404)
  async addComment(
    @Param('threadId', ParseIntPipe) threadId: number,
    @RequestUserId() userId: number | undefined,
    @RequestGuestSession() guestSession: string | null,
    @Body() createCommentDto: CreateCommentDto,
  ): Promise<CommentDto> {
    // Check permission on the parent note
    const noteId = await this.commentsService.getNoteIdForThread(threadId);
    await this.checkNotePermission(userId, noteId, PermissionLevel.READ);

    const guestInfo = this.resolveGuestInfo(
      userId,
      guestSession,
      createCommentDto.guestName,
    );

    return await this.commentsService.addComment(
      threadId,
      userId ?? null,
      guestInfo,
      createCommentDto.content,
    );
  }

  /**
   * Update a comment's content.
   *
   * Only the comment author or users with WRITE permission can edit.
   */
  @Patch('comments/:commentId')
  @OpenApi(200, 400, 401, 403, 404)
  async updateComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @RequestUserId() userId: number | undefined,
    @RequestGuestSession() guestSession: string | null,
    @Body() updateCommentDto: UpdateCommentDto,
  ): Promise<CommentDto> {
    await this.checkCommentEditPermission(userId, guestSession, commentId);

    return await this.commentsService.updateComment(
      commentId,
      updateCommentDto.content,
    );
  }

  /**
   * Delete a comment.
   *
   * Only the comment author or users with WRITE permission can delete.
   */
  @Delete('comments/:commentId')
  @OpenApi(204, 401, 403, 404)
  async deleteComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @RequestUserId() userId: number | undefined,
    @RequestGuestSession() guestSession: string | null,
  ): Promise<void> {
    await this.checkCommentEditPermission(userId, guestSession, commentId);
    await this.commentsService.deleteComment(commentId);
  }

  /**
   * Resolve or unresolve a comment thread.
   *
   * Thread resolution follows the Google Docs model:
   * - Thread authors can resolve their own threads (must be logged in)
   * - Users with WRITE permission can resolve any thread
   * - Guests cannot resolve threads
   */
  @Patch('threads/:threadId/resolve')
  @OpenApi(200, 400, 401, 403, 404)
  async resolveThread(
    @Param('threadId', ParseIntPipe) threadId: number,
    @RequestUserId() userId: number | undefined,
    @Body() resolveDto: ResolveThreadDto,
  ): Promise<CommentThreadDto> {
    // Guests cannot resolve threads
    if (userId === undefined) {
      throw new ForbiddenException(
        'You must be logged in to resolve comment threads',
      );
    }

    await this.checkThreadResolvePermission(userId, threadId);

    return await this.commentsService.resolveThread(
      threadId,
      resolveDto.resolved,
      userId,
    );
  }

  /**
   * Delete a comment thread and all its comments.
   *
   * Only users with WRITE permission on the note can delete threads.
   */
  @Delete('threads/:threadId')
  @OpenApi(204, 401, 403, 404)
  async deleteThread(
    @Param('threadId', ParseIntPipe) threadId: number,
    @RequestUserId() userId: number | undefined,
  ): Promise<void> {
    const noteId = await this.commentsService.getNoteIdForThread(threadId);
    await this.checkNotePermission(userId, noteId, PermissionLevel.WRITE);

    await this.commentsService.deleteThread(threadId);
  }

  /**
   * Check if a user has the required permission on a note.
   *
   * @throws ForbiddenException if permission is not sufficient
   */
  private async checkNotePermission(
    userId: number | undefined,
    noteId: number,
    requiredLevel: PermissionLevel,
  ): Promise<void> {
    const permission = await this.permissionService.determinePermission(
      userId ?? 0, // 0 represents guest/anonymous for permission checks
      noteId,
    );

    if (permission < requiredLevel) {
      throw new ForbiddenException(
        'You do not have permission to access this note',
      );
    }
  }

  /**
   * Check if a user can edit/delete a comment.
   *
   * Allowed if:
   * - User is the comment author (logged in)
   * - Guest session matches the comment's guest session
   * - User has WRITE permission on the note
   *
   * @throws ForbiddenException if user cannot edit the comment
   */
  private async checkCommentEditPermission(
    userId: number | undefined,
    guestSession: string | null,
    commentId: number,
  ): Promise<void> {
    const { authorId, guestSession: commentGuestSession, threadId } =
      await this.commentsService.getCommentAuthor(commentId);
    const noteId = await this.commentsService.getNoteIdForThread(threadId);

    // Check if user is the author
    if (userId !== undefined && authorId === userId) {
      return; // Author can edit their own comment
    }

    // Check if guest session matches
    if (
      guestSession !== null &&
      commentGuestSession !== null &&
      guestSession === commentGuestSession
    ) {
      return; // Guest can edit their own comment
    }

    // Check if user has WRITE permission on the note
    const permission = await this.permissionService.determinePermission(
      userId ?? 0,
      noteId,
    );

    if (permission >= PermissionLevel.WRITE) {
      return; // User with WRITE permission can edit any comment
    }

    throw new ForbiddenException(
      'You do not have permission to edit this comment',
    );
  }

  /**
   * Check if a user can resolve/unresolve a thread.
   *
   * Allowed if:
   * - User is the thread author (first comment author) and logged in
   * - User has WRITE permission on the note
   *
   * Guests cannot resolve threads.
   *
   * @throws ForbiddenException if user cannot resolve the thread
   */
  private async checkThreadResolvePermission(
    userId: number,
    threadId: number,
  ): Promise<void> {
    const { authorId } = await this.commentsService.getThreadAuthor(threadId);
    const noteId = await this.commentsService.getNoteIdForThread(threadId);

    // Check if user is the thread author (Google Docs model)
    if (authorId === userId) {
      return; // Thread author can resolve their own thread
    }

    // Check if user has WRITE permission on the note
    const permission = await this.permissionService.determinePermission(
      userId,
      noteId,
    );

    if (permission >= PermissionLevel.WRITE) {
      return; // User with WRITE permission can resolve any thread
    }

    throw new ForbiddenException(
      'You do not have permission to resolve this thread',
    );
  }

  /**
   * Resolve guest information for comment creation.
   *
   * If the user is logged in, returns null (no guest info needed).
   * If the user is a guest, returns the guest info with name and session.
   */
  private resolveGuestInfo(
    userId: number | undefined,
    guestSession: string | null,
    guestName: string | undefined,
  ): GuestInfo | null {
    if (userId !== undefined) {
      return null; // Logged-in users don't need guest info
    }

    // Generate a session UUID if not provided
    const session =
      guestSession ??
      crypto.randomUUID();

    return {
      name: guestName || 'Guest',
      session,
    };
  }
}
