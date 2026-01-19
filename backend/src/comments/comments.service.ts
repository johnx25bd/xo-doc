/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { InjectConnection } from 'nest-knexjs';
import { Knex } from 'knex';
import { EventEmitter2 } from 'eventemitter2';
import {
  Comment,
  CommentThread,
  FieldNameComment,
  FieldNameCommentThread,
  FieldNameUser,
  TableComment,
  TableCommentThread,
  TableUser,
} from '@hedgedoc/database';
import {
  CommentInterface,
  CommentThreadInterface,
} from '@hedgedoc/commons';

import { ConsoleLoggerService } from '../logger/console-logger.service.js';
import { NoteEvent, NoteEventMap, CommentEventPayload } from '../events.js';
import { NotInDBError, PermissionError } from '../errors/errors.js';
import {
  getCurrentDateTime,
  dateTimeToDB,
  dateTimeToISOString,
  dbToDateTime,
} from '../utils/datetime.js';
import { BadRequestException } from '@nestjs/common';

/** Default display name for guest users when no name is provided */
const GUEST_DEFAULT_NAME = 'Guest';

/** Default display name when a registered user's display name is missing */
const USER_DISPLAY_NAME_FALLBACK = 'Unknown';

/** Maximum allowed length for comment content */
const MAX_COMMENT_LENGTH = 10000;

/**
 * Guest information for creating comments without authentication.
 */
export interface GuestInfo {
  /** Display name for the guest */
  name: string;
  /** Session UUID for identifying the guest's comments */
  session: string;
}

/**
 * Service for managing comment threads and comments on notes.
 *
 * Handles all CRUD operations for the commenting system, including:
 * - Creating and deleting comment threads
 * - Adding, editing, and deleting comments within threads
 * - Resolving and unresolving threads
 * - Permission checks for comment operations
 *
 * All operations emit events for real-time synchronization.
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectConnection()
    private readonly knex: Knex,
    private readonly logger: ConsoleLoggerService,
    private eventEmitter: EventEmitter2<NoteEventMap>,
  ) {
    this.logger.setContext(CommentsService.name);
  }

  /**
   * Get all comment threads for a note with their comments.
   *
   * @param noteId - The ID of the note
   * @param transaction - Optional existing transaction
   * @returns Array of comment threads with nested comments
   */
  async getThreadsForNote(
    noteId: number,
    transaction?: Knex,
  ): Promise<CommentThreadInterface[]> {
    if (transaction === undefined) {
      return await this.knex.transaction(async (trx) => {
        return await this.innerGetThreadsForNote(noteId, trx);
      });
    }
    return await this.innerGetThreadsForNote(noteId, transaction);
  }

  private async innerGetThreadsForNote(
    noteId: number,
    transaction: Knex,
  ): Promise<CommentThreadInterface[]> {
    // Get all threads for the note
    const threads = await transaction(TableCommentThread)
      .select('*')
      .where(FieldNameCommentThread.noteId, noteId)
      .orderBy(FieldNameCommentThread.createdAt, 'asc');

    // Get all comments for these threads
    const threadIds = threads.map((t) => t[FieldNameCommentThread.id]);
    if (threadIds.length === 0) {
      return [];
    }

    const comments = await transaction(TableComment)
      .select(
        `${TableComment}.*`,
        `${TableUser}.${FieldNameUser.username}`,
        `${TableUser}.${FieldNameUser.displayName}`,
      )
      .leftJoin(
        TableUser,
        `${TableComment}.${FieldNameComment.authorId}`,
        `${TableUser}.${FieldNameUser.id}`,
      )
      .whereIn(FieldNameComment.threadId, threadIds)
      .orderBy(`${TableComment}.${FieldNameComment.createdAt}`, 'asc');

    // Get resolver usernames for resolved threads
    const resolverIds = threads
      .filter((t) => t[FieldNameCommentThread.resolvedBy] !== null)
      .map((t) => t[FieldNameCommentThread.resolvedBy]);

    const resolvers =
      resolverIds.length > 0
        ? await transaction(TableUser)
            .select(FieldNameUser.id, FieldNameUser.username)
            .whereIn(FieldNameUser.id, resolverIds)
        : [];

    const resolverMap = new Map(
      resolvers.map((r) => [r[FieldNameUser.id], r[FieldNameUser.username]]),
    );

    // Group comments by thread
    const commentsByThread = new Map<number, CommentInterface[]>();
    for (const comment of comments) {
      const threadId = comment[FieldNameComment.threadId];
      if (!commentsByThread.has(threadId)) {
        commentsByThread.set(threadId, []);
      }
      commentsByThread.get(threadId)!.push(this.commentToDto(comment));
    }

    // Build thread DTOs
    return threads.map((thread) =>
      this.threadToDto(
        thread,
        commentsByThread.get(thread[FieldNameCommentThread.id]) || [],
        resolverMap.get(thread[FieldNameCommentThread.resolvedBy]) || null,
      ),
    );
  }

  /**
   * Get a single comment thread by ID.
   *
   * @param threadId - The ID of the thread
   * @param transaction - Optional existing transaction
   * @returns The comment thread with nested comments
   * @throws NotInDBError if the thread doesn't exist
   */
  async getThread(
    threadId: number,
    transaction?: Knex,
  ): Promise<CommentThreadInterface> {
    if (transaction === undefined) {
      return await this.knex.transaction(async (trx) => {
        return await this.innerGetThread(threadId, trx);
      });
    }
    return await this.innerGetThread(threadId, transaction);
  }

  private async innerGetThread(
    threadId: number,
    transaction: Knex,
  ): Promise<CommentThreadInterface> {
    const thread = await transaction(TableCommentThread)
      .select('*')
      .where(FieldNameCommentThread.id, threadId)
      .first();

    if (!thread) {
      throw new NotInDBError(
        `Comment thread with ID ${threadId} not found`,
        this.logger.getContext(),
        'getThread',
      );
    }

    const comments = await transaction(TableComment)
      .select(
        `${TableComment}.*`,
        `${TableUser}.${FieldNameUser.username}`,
        `${TableUser}.${FieldNameUser.displayName}`,
      )
      .leftJoin(
        TableUser,
        `${TableComment}.${FieldNameComment.authorId}`,
        `${TableUser}.${FieldNameUser.id}`,
      )
      .where(FieldNameComment.threadId, threadId)
      .orderBy(`${TableComment}.${FieldNameComment.createdAt}`, 'asc');

    let resolverUsername: string | null = null;
    if (thread[FieldNameCommentThread.resolvedBy] !== null) {
      const resolver = await transaction(TableUser)
        .select(FieldNameUser.username)
        .where(FieldNameUser.id, thread[FieldNameCommentThread.resolvedBy])
        .first();
      resolverUsername = resolver?.[FieldNameUser.username] || null;
    }

    return this.threadToDto(
      thread,
      comments.map((c) => this.commentToDto(c)),
      resolverUsername,
    );
  }

  /**
   * Create a new comment thread with an initial comment.
   *
   * @param noteId - The ID of the note to create the thread on
   * @param authorId - The user ID of the author (null for guests)
   * @param guestInfo - Guest information if not authenticated
   * @param anchorText - The highlighted text
   * @param anchorStart - Character offset start (nullable)
   * @param anchorEnd - Character offset end (nullable)
   * @param initialComment - Content of the first comment
   * @returns The created thread with its initial comment
   */
  async createThread(
    noteId: number,
    authorId: number | null,
    guestInfo: GuestInfo | null,
    anchorText: string,
    anchorStart: number | null,
    anchorEnd: number | null,
    initialComment: string,
  ): Promise<CommentThreadInterface> {
    // Validate input
    this.validateCommentContent(initialComment);

    return await this.knex.transaction(async (trx) => {
      const now = dateTimeToDB(getCurrentDateTime());

      // Create the thread
      const [createdThread] = await trx(TableCommentThread)
        .insert({
          [FieldNameCommentThread.noteId]: noteId,
          [FieldNameCommentThread.anchorText]: anchorText,
          [FieldNameCommentThread.anchorStart]: anchorStart,
          [FieldNameCommentThread.anchorEnd]: anchorEnd,
          [FieldNameCommentThread.resolved]: false,
          [FieldNameCommentThread.resolvedBy]: null,
          [FieldNameCommentThread.resolvedAt]: null,
          [FieldNameCommentThread.createdAt]: now,
          [FieldNameCommentThread.updatedAt]: now,
        })
        .returning('*');

      const threadId = createdThread[FieldNameCommentThread.id];

      // Create the initial comment
      const [createdComment] = await trx(TableComment)
        .insert({
          [FieldNameComment.threadId]: threadId,
          [FieldNameComment.authorId]: authorId,
          [FieldNameComment.guestName]: guestInfo?.name || null,
          [FieldNameComment.guestSession]: guestInfo?.session || null,
          [FieldNameComment.content]: initialComment,
          [FieldNameComment.createdAt]: now,
          [FieldNameComment.updatedAt]: now,
        })
        .returning('*');

      // Get author info for the DTO
      const { username: authorUsername, displayName: authorDisplayName } =
        await this.getUserDisplayInfo(trx, authorId, guestInfo?.name ?? null);

      this.logger.debug(
        `Created comment thread ${threadId} on note ${noteId}`,
        'createThread',
      );

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_THREAD_CREATED, {
        noteId,
        threadId,
      } as CommentEventPayload);

      const commentDto: CommentInterface = {
        id: createdComment[FieldNameComment.id],
        threadId,
        authorUsername,
        authorDisplayName,
        isGuest: authorId === null,
        content: createdComment[FieldNameComment.content],
        createdAt: dateTimeToISOString(
          dbToDateTime(createdComment[FieldNameComment.createdAt]),
        ),
        updatedAt: dateTimeToISOString(
          dbToDateTime(createdComment[FieldNameComment.updatedAt]),
        ),
      };

      return this.threadToDto(createdThread, [commentDto], null);
    });
  }

  /**
   * Add a comment (reply) to an existing thread.
   *
   * @param threadId - The ID of the thread
   * @param authorId - The user ID of the author (null for guests)
   * @param guestInfo - Guest information if not authenticated
   * @param content - The comment content
   * @returns The created comment
   * @throws NotInDBError if the thread doesn't exist
   */
  async addComment(
    threadId: number,
    authorId: number | null,
    guestInfo: GuestInfo | null,
    content: string,
  ): Promise<CommentInterface> {
    // Validate input
    this.validateCommentContent(content);

    return await this.knex.transaction(async (trx) => {
      // Verify thread exists and get noteId
      const thread = await trx(TableCommentThread)
        .select(FieldNameCommentThread.id, FieldNameCommentThread.noteId)
        .where(FieldNameCommentThread.id, threadId)
        .first();

      if (!thread) {
        throw new NotInDBError(
          `Comment thread with ID ${threadId} not found`,
          this.logger.getContext(),
          'addComment',
        );
      }

      const now = dateTimeToDB(getCurrentDateTime());

      // Create the comment
      const [createdComment] = await trx(TableComment)
        .insert({
          [FieldNameComment.threadId]: threadId,
          [FieldNameComment.authorId]: authorId,
          [FieldNameComment.guestName]: guestInfo?.name || null,
          [FieldNameComment.guestSession]: guestInfo?.session || null,
          [FieldNameComment.content]: content,
          [FieldNameComment.createdAt]: now,
          [FieldNameComment.updatedAt]: now,
        })
        .returning('*');

      // Update thread's updatedAt
      await trx(TableCommentThread)
        .where(FieldNameCommentThread.id, threadId)
        .update({ [FieldNameCommentThread.updatedAt]: now });

      // Get author info for the DTO
      const { username: authorUsername, displayName: authorDisplayName } =
        await this.getUserDisplayInfo(trx, authorId, guestInfo?.name ?? null);

      const commentId = createdComment[FieldNameComment.id];

      this.logger.debug(
        `Added comment ${commentId} to thread ${threadId}`,
        'addComment',
      );

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_ADDED, {
        noteId: thread[FieldNameCommentThread.noteId],
        threadId,
        commentId,
      } as CommentEventPayload);

      return {
        id: commentId,
        threadId,
        authorUsername,
        authorDisplayName,
        isGuest: authorId === null,
        content: createdComment[FieldNameComment.content],
        createdAt: dateTimeToISOString(
          dbToDateTime(createdComment[FieldNameComment.createdAt]),
        ),
        updatedAt: dateTimeToISOString(
          dbToDateTime(createdComment[FieldNameComment.updatedAt]),
        ),
      };
    });
  }

  /**
   * Update a comment's content.
   *
   * @param commentId - The ID of the comment
   * @param content - The new content
   * @returns The updated comment
   * @throws NotInDBError if the comment doesn't exist
   */
  async updateComment(
    commentId: number,
    content: string,
  ): Promise<CommentInterface> {
    // Validate input
    this.validateCommentContent(content);

    return await this.knex.transaction(async (trx) => {
      const now = dateTimeToDB(getCurrentDateTime());

      // Get existing comment
      const existingComment = await trx(TableComment)
        .select('*')
        .where(FieldNameComment.id, commentId)
        .first();

      if (!existingComment) {
        throw new NotInDBError(
          `Comment with ID ${commentId} not found`,
          this.logger.getContext(),
          'updateComment',
        );
      }

      // Update the comment
      const [updatedComment] = await trx(TableComment)
        .where(FieldNameComment.id, commentId)
        .update({
          [FieldNameComment.content]: content,
          [FieldNameComment.updatedAt]: now,
        })
        .returning('*');

      // Get thread info for event
      const thread = await trx(TableCommentThread)
        .select(FieldNameCommentThread.noteId)
        .where(FieldNameCommentThread.id, updatedComment[FieldNameComment.threadId])
        .first();

      if (!thread) {
        throw new NotInDBError(
          `Thread for comment ${commentId} not found`,
          this.logger.getContext(),
          'updateComment',
        );
      }

      // Update thread's updatedAt
      await trx(TableCommentThread)
        .where(FieldNameCommentThread.id, updatedComment[FieldNameComment.threadId])
        .update({ [FieldNameCommentThread.updatedAt]: now });

      // Get author info for the DTO
      const { username: authorUsername, displayName: authorDisplayName } =
        await this.getUserDisplayInfo(
          trx,
          updatedComment[FieldNameComment.authorId],
          updatedComment[FieldNameComment.guestName],
        );

      this.logger.debug(`Updated comment ${commentId}`, 'updateComment');

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_UPDATED, {
        noteId: thread[FieldNameCommentThread.noteId],
        threadId: updatedComment[FieldNameComment.threadId],
        commentId,
      } as CommentEventPayload);

      return {
        id: commentId,
        threadId: updatedComment[FieldNameComment.threadId],
        authorUsername,
        authorDisplayName,
        isGuest: updatedComment[FieldNameComment.authorId] === null,
        content: updatedComment[FieldNameComment.content],
        createdAt: dateTimeToISOString(
          dbToDateTime(updatedComment[FieldNameComment.createdAt]),
        ),
        updatedAt: dateTimeToISOString(
          dbToDateTime(updatedComment[FieldNameComment.updatedAt]),
        ),
      };
    });
  }

  /**
   * Delete a comment.
   *
   * @param commentId - The ID of the comment
   * @throws NotInDBError if the comment doesn't exist
   */
  async deleteComment(commentId: number): Promise<void> {
    return await this.knex.transaction(async (trx) => {
      // Get comment info for event
      const comment = await trx(TableComment)
        .select(FieldNameComment.threadId)
        .where(FieldNameComment.id, commentId)
        .first();

      if (!comment) {
        throw new NotInDBError(
          `Comment with ID ${commentId} not found`,
          this.logger.getContext(),
          'deleteComment',
        );
      }

      const threadId = comment[FieldNameComment.threadId];

      // Get thread info for event
      const thread = await trx(TableCommentThread)
        .select(FieldNameCommentThread.noteId)
        .where(FieldNameCommentThread.id, threadId)
        .first();

      if (!thread) {
        throw new NotInDBError(
          `Thread for comment ${commentId} not found`,
          this.logger.getContext(),
          'deleteComment',
        );
      }

      // Delete the comment
      await trx(TableComment).where(FieldNameComment.id, commentId).delete();

      // Update thread's updatedAt
      const now = dateTimeToDB(getCurrentDateTime());
      await trx(TableCommentThread)
        .where(FieldNameCommentThread.id, threadId)
        .update({ [FieldNameCommentThread.updatedAt]: now });

      this.logger.debug(`Deleted comment ${commentId}`, 'deleteComment');

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_DELETED, {
        noteId: thread[FieldNameCommentThread.noteId],
        threadId,
        commentId,
      } as CommentEventPayload);
    });
  }

  /**
   * Resolve or unresolve a comment thread.
   *
   * @param threadId - The ID of the thread
   * @param resolved - Whether to resolve (true) or unresolve (false)
   * @param userId - The ID of the user performing the action
   * @returns The updated thread
   * @throws NotInDBError if the thread doesn't exist
   */
  async resolveThread(
    threadId: number,
    resolved: boolean,
    userId: number,
  ): Promise<CommentThreadInterface> {
    return await this.knex.transaction(async (trx) => {
      // Verify thread exists
      const thread = await trx(TableCommentThread)
        .select('*')
        .where(FieldNameCommentThread.id, threadId)
        .first();

      if (!thread) {
        throw new NotInDBError(
          `Comment thread with ID ${threadId} not found`,
          this.logger.getContext(),
          'resolveThread',
        );
      }

      const now = dateTimeToDB(getCurrentDateTime());

      // Update resolution status
      const [updatedThread] = await trx(TableCommentThread)
        .where(FieldNameCommentThread.id, threadId)
        .update({
          [FieldNameCommentThread.resolved]: resolved,
          [FieldNameCommentThread.resolvedBy]: resolved ? userId : null,
          [FieldNameCommentThread.resolvedAt]: resolved ? now : null,
          [FieldNameCommentThread.updatedAt]: now,
        })
        .returning('*');

      // Get resolver username
      let resolverUsername: string | null = null;
      if (resolved) {
        const resolver = await trx(TableUser)
          .select(FieldNameUser.username)
          .where(FieldNameUser.id, userId)
          .first();
        resolverUsername = resolver?.[FieldNameUser.username] || null;
      }

      // Get comments for the thread
      const comments = await trx(TableComment)
        .select(
          `${TableComment}.*`,
          `${TableUser}.${FieldNameUser.username}`,
          `${TableUser}.${FieldNameUser.displayName}`,
        )
        .leftJoin(
          TableUser,
          `${TableComment}.${FieldNameComment.authorId}`,
          `${TableUser}.${FieldNameUser.id}`,
        )
        .where(FieldNameComment.threadId, threadId)
        .orderBy(`${TableComment}.${FieldNameComment.createdAt}`, 'asc');

      this.logger.debug(
        `${resolved ? 'Resolved' : 'Unresolved'} thread ${threadId}`,
        'resolveThread',
      );

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_THREAD_RESOLVED, {
        noteId: updatedThread[FieldNameCommentThread.noteId],
        threadId,
        resolved,
      } as CommentEventPayload);

      return this.threadToDto(
        updatedThread,
        comments.map((c) => this.commentToDto(c)),
        resolverUsername,
      );
    });
  }

  /**
   * Delete a comment thread and all its comments.
   *
   * @param threadId - The ID of the thread
   * @throws NotInDBError if the thread doesn't exist
   */
  async deleteThread(threadId: number): Promise<void> {
    return await this.knex.transaction(async (trx) => {
      // Get thread info for event
      const thread = await trx(TableCommentThread)
        .select(FieldNameCommentThread.noteId)
        .where(FieldNameCommentThread.id, threadId)
        .first();

      if (!thread) {
        throw new NotInDBError(
          `Comment thread with ID ${threadId} not found`,
          this.logger.getContext(),
          'deleteThread',
        );
      }

      const noteId = thread[FieldNameCommentThread.noteId];

      // Delete thread (comments cascade due to FK)
      await trx(TableCommentThread)
        .where(FieldNameCommentThread.id, threadId)
        .delete();

      this.logger.debug(`Deleted thread ${threadId}`, 'deleteThread');

      // Emit event for real-time sync
      this.eventEmitter.emit(NoteEvent.COMMENT_THREAD_DELETED, {
        noteId,
        threadId,
      } as CommentEventPayload);
    });
  }

  /**
   * Get the author ID of the first comment in a thread (thread author).
   * Used for permission checks (thread authors can resolve their own threads).
   *
   * @param threadId - The ID of the thread
   * @returns The author ID and guest session of the first comment
   * @throws NotInDBError if the thread doesn't exist or has no comments
   */
  async getThreadAuthor(
    threadId: number,
  ): Promise<{ authorId: number | null; guestSession: string | null }> {
    const firstComment = await this.knex(TableComment)
      .select(FieldNameComment.authorId, FieldNameComment.guestSession)
      .where(FieldNameComment.threadId, threadId)
      .orderBy(FieldNameComment.createdAt, 'asc')
      .first();

    if (!firstComment) {
      throw new NotInDBError(
        `No comments found in thread ${threadId}`,
        this.logger.getContext(),
        'getThreadAuthor',
      );
    }

    return {
      authorId: firstComment[FieldNameComment.authorId],
      guestSession: firstComment[FieldNameComment.guestSession],
    };
  }

  /**
   * Get the author ID and guest session of a comment.
   * Used for permission checks.
   *
   * @param commentId - The ID of the comment
   * @returns The author ID, guest session, and thread ID
   * @throws NotInDBError if the comment doesn't exist
   */
  async getCommentAuthor(commentId: number): Promise<{
    authorId: number | null;
    guestSession: string | null;
    threadId: number;
  }> {
    const comment = await this.knex(TableComment)
      .select(
        FieldNameComment.authorId,
        FieldNameComment.guestSession,
        FieldNameComment.threadId,
      )
      .where(FieldNameComment.id, commentId)
      .first();

    if (!comment) {
      throw new NotInDBError(
        `Comment with ID ${commentId} not found`,
        this.logger.getContext(),
        'getCommentAuthor',
      );
    }

    return {
      authorId: comment[FieldNameComment.authorId],
      guestSession: comment[FieldNameComment.guestSession],
      threadId: comment[FieldNameComment.threadId],
    };
  }

  /**
   * Get the note ID for a thread.
   *
   * @param threadId - The ID of the thread
   * @returns The note ID
   * @throws NotInDBError if the thread doesn't exist
   */
  async getNoteIdForThread(threadId: number): Promise<number> {
    const thread = await this.knex(TableCommentThread)
      .select(FieldNameCommentThread.noteId)
      .where(FieldNameCommentThread.id, threadId)
      .first();

    if (!thread) {
      throw new NotInDBError(
        `Comment thread with ID ${threadId} not found`,
        this.logger.getContext(),
        'getNoteIdForThread',
      );
    }

    return thread[FieldNameCommentThread.noteId];
  }

  /**
   * Get the note ID for a comment.
   *
   * @param commentId - The ID of the comment
   * @returns The note ID
   * @throws NotInDBError if the comment doesn't exist
   */
  async getNoteIdForComment(commentId: number): Promise<number> {
    const result = await this.knex(TableComment)
      .select(`${TableCommentThread}.${FieldNameCommentThread.noteId}`)
      .join(
        TableCommentThread,
        `${TableComment}.${FieldNameComment.threadId}`,
        `${TableCommentThread}.${FieldNameCommentThread.id}`,
      )
      .where(`${TableComment}.${FieldNameComment.id}`, commentId)
      .first();

    if (!result) {
      throw new NotInDBError(
        `Comment with ID ${commentId} not found`,
        this.logger.getContext(),
        'getNoteIdForComment',
      );
    }

    return result[FieldNameCommentThread.noteId];
  }

  /**
   * Validate comment content before inserting or updating.
   *
   * @throws BadRequestException if content is invalid
   */
  private validateCommentContent(content: string): void {
    if (!content || !content.trim()) {
      throw new BadRequestException('Comment content cannot be empty');
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(
        `Comment exceeds maximum length of ${MAX_COMMENT_LENGTH} characters`,
      );
    }
  }

  /**
   * Fetch user display info (username and displayName) for a given user ID.
   * Returns guest defaults if authorId is null.
   *
   * @param trx - Knex transaction
   * @param authorId - User ID or null for guests
   * @param guestName - Guest name if authorId is null
   * @returns Object with username (null for guests) and displayName
   */
  private async getUserDisplayInfo(
    trx: Knex,
    authorId: number | null,
    guestName: string | null,
  ): Promise<{ username: string | null; displayName: string }> {
    if (authorId === null) {
      return {
        username: null,
        displayName: guestName || GUEST_DEFAULT_NAME,
      };
    }

    const user = await trx(TableUser)
      .select(FieldNameUser.username, FieldNameUser.displayName)
      .where(FieldNameUser.id, authorId)
      .first();

    return {
      username: user?.[FieldNameUser.username] ?? null,
      displayName: user?.[FieldNameUser.displayName] ?? USER_DISPLAY_NAME_FALLBACK,
    };
  }

  /**
   * Convert a database comment row to a DTO.
   */
  private commentToDto(
    row: Comment & {
      [FieldNameUser.username]?: string | null;
      [FieldNameUser.displayName]?: string;
    },
  ): CommentInterface {
    const isGuest = row[FieldNameComment.authorId] === null;
    return {
      id: row[FieldNameComment.id],
      threadId: row[FieldNameComment.threadId],
      authorUsername: isGuest ? null : (row[FieldNameUser.username] ?? null),
      authorDisplayName: isGuest
        ? (row[FieldNameComment.guestName] ?? GUEST_DEFAULT_NAME)
        : (row[FieldNameUser.displayName] ?? USER_DISPLAY_NAME_FALLBACK),
      isGuest,
      content: row[FieldNameComment.content],
      createdAt: dateTimeToISOString(
        dbToDateTime(row[FieldNameComment.createdAt]),
      ),
      updatedAt: dateTimeToISOString(
        dbToDateTime(row[FieldNameComment.updatedAt]),
      ),
    };
  }

  /**
   * Convert a database thread row to a DTO.
   */
  private threadToDto(
    row: CommentThread,
    comments: CommentInterface[],
    resolverUsername: string | null,
  ): CommentThreadInterface {
    return {
      id: row[FieldNameCommentThread.id],
      noteId: row[FieldNameCommentThread.noteId],
      anchorText: row[FieldNameCommentThread.anchorText],
      anchorStart: row[FieldNameCommentThread.anchorStart],
      anchorEnd: row[FieldNameCommentThread.anchorEnd],
      resolved: row[FieldNameCommentThread.resolved],
      resolvedByUsername: resolverUsername,
      resolvedAt: row[FieldNameCommentThread.resolvedAt]
        ? dateTimeToISOString(
            dbToDateTime(row[FieldNameCommentThread.resolvedAt]),
          )
        : null,
      comments,
      createdAt: dateTimeToISOString(
        dbToDateTime(row[FieldNameCommentThread.createdAt]),
      ),
      updatedAt: dateTimeToISOString(
        dbToDateTime(row[FieldNameCommentThread.updatedAt]),
      ),
    };
  }
}
