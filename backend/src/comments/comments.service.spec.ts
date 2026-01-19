/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  FieldNameComment,
  FieldNameCommentThread,
  FieldNameUser,
  TableComment,
  TableCommentThread,
  TableUser,
} from '@hedgedoc/database';
import { BadRequestException, Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2 } from 'eventemitter2';
import { Test, TestingModule } from '@nestjs/testing';
import type { Tracker } from 'knex-mock-client';

import appConfigMock from '../config/mock/app.config.mock';
import databaseConfigMock from '../config/mock/database.config.mock';
import { mockKnexDb } from '../database/mock/provider';
import { NotInDBError } from '../errors/errors';
import { NoteEvent } from '../events';
import { LoggerModule } from '../logger/logger.module';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  const noteId = 1;
  const threadId = 10;
  const commentId = 100;
  const userId = 42;
  const guestSession = 'test-guest-session-uuid';

  let service: CommentsService;
  let tracker: Tracker;
  let knexProvider: Provider;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    [tracker, knexProvider] = mockKnexDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        knexProvider,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
      imports: [
        LoggerModule,
        await ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfigMock, databaseConfigMock],
        }),
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    tracker.reset();
    jest.clearAllMocks();
  });

  describe('getThreadsForNote', () => {
    it('returns empty array when no threads exist', async () => {
      tracker.on.select(TableCommentThread).response([]);

      const result = await service.getThreadsForNote(noteId);

      expect(result).toEqual([]);
    });

    it('returns threads with comments for a note', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'highlighted text',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 16,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestName]: null,
        [FieldNameComment.guestSession]: null,
        [FieldNameComment.content]: 'Test comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
        [FieldNameUser.username]: 'testuser',
        [FieldNameUser.displayName]: 'Test User',
      };

      tracker.on.select(TableCommentThread).response([mockThread]);
      tracker.on.select(TableComment).response([mockComment]);

      const result = await service.getThreadsForNote(noteId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(threadId);
      expect(result[0].anchorText).toBe('highlighted text');
      expect(result[0].comments).toHaveLength(1);
      expect(result[0].comments[0].content).toBe('Test comment');
    });
  });

  describe('getThread', () => {
    it('throws NotInDBError when thread does not exist', async () => {
      tracker.on.select(TableCommentThread).response(undefined);

      await expect(service.getThread(999)).rejects.toThrow(NotInDBError);
    });

    it('returns thread with comments when found', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'test',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 4,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.select(TableComment).response([]);

      const result = await service.getThread(threadId);

      expect(result.id).toBe(threadId);
      expect(result.anchorText).toBe('test');
    });
  });

  describe('createThread', () => {
    it('creates a thread with initial comment for registered user', async () => {
      const mockCreatedThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'highlighted',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 11,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockCreatedComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestName]: null,
        [FieldNameComment.guestSession]: null,
        [FieldNameComment.content]: 'Initial comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockUser = {
        [FieldNameUser.username]: 'testuser',
        [FieldNameUser.displayName]: 'Test User',
      };

      tracker.on.insert(TableCommentThread).response([mockCreatedThread]);
      tracker.on.insert(TableComment).response([mockCreatedComment]);
      tracker.on.select(TableUser).response(mockUser);

      const result = await service.createThread(
        noteId,
        userId,
        null,
        'highlighted',
        0,
        11,
        'Initial comment',
      );

      expect(result.id).toBe(threadId);
      expect(result.noteId).toBe(noteId);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].authorDisplayName).toBe('Test User');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_THREAD_CREATED,
        expect.objectContaining({ noteId, threadId }),
      );
    });

    it('creates a thread with initial comment for guest user', async () => {
      const mockCreatedThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'guest highlight',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 15,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockCreatedComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: null,
        [FieldNameComment.guestName]: 'Guest User',
        [FieldNameComment.guestSession]: guestSession,
        [FieldNameComment.content]: 'Guest comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      tracker.on.insert(TableCommentThread).response([mockCreatedThread]);
      tracker.on.insert(TableComment).response([mockCreatedComment]);

      const result = await service.createThread(
        noteId,
        null,
        { name: 'Guest User', session: guestSession },
        'guest highlight',
        0,
        15,
        'Guest comment',
      );

      expect(result.comments[0].isGuest).toBe(true);
      expect(result.comments[0].authorDisplayName).toBe('Guest User');
    });
  });

  describe('addComment', () => {
    it('throws NotInDBError when thread does not exist', async () => {
      tracker.on.select(TableCommentThread).response(undefined);

      await expect(
        service.addComment(999, userId, null, 'New comment'),
      ).rejects.toThrow(NotInDBError);
    });

    it('adds a comment to an existing thread', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
      };

      const mockCreatedComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestName]: null,
        [FieldNameComment.guestSession]: null,
        [FieldNameComment.content]: 'Reply comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockUser = {
        [FieldNameUser.username]: 'testuser',
        [FieldNameUser.displayName]: 'Test User',
      };

      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.insert(TableComment).response([mockCreatedComment]);
      tracker.on.update(TableCommentThread).response(1);
      tracker.on.select(TableUser).response(mockUser);

      const result = await service.addComment(threadId, userId, null, 'Reply comment');

      expect(result.content).toBe('Reply comment');
      expect(result.threadId).toBe(threadId);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_ADDED,
        expect.objectContaining({ noteId, threadId, commentId }),
      );
    });
  });

  describe('updateComment', () => {
    it('throws NotInDBError when comment does not exist', async () => {
      tracker.on.select(TableComment).response(undefined);

      await expect(service.updateComment(999, 'Updated content')).rejects.toThrow(
        NotInDBError,
      );
    });

    it('updates comment content', async () => {
      const mockExistingComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestName]: null,
        [FieldNameComment.guestSession]: null,
        [FieldNameComment.content]: 'Original content',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockUpdatedComment = {
        ...mockExistingComment,
        [FieldNameComment.content]: 'Updated content',
        [FieldNameComment.updatedAt]: '2025-01-02 00:00:00',
      };

      const mockThread = {
        [FieldNameCommentThread.noteId]: noteId,
      };

      const mockUser = {
        [FieldNameUser.username]: 'testuser',
        [FieldNameUser.displayName]: 'Test User',
      };

      tracker.on.select(TableComment).response(mockExistingComment);
      tracker.on.update(TableComment).response([mockUpdatedComment]);
      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.update(TableCommentThread).response(1);
      tracker.on.select(TableUser).response(mockUser);

      const result = await service.updateComment(commentId, 'Updated content');

      expect(result.content).toBe('Updated content');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_UPDATED,
        expect.objectContaining({ noteId, threadId, commentId }),
      );
    });
  });

  describe('deleteComment', () => {
    it('throws NotInDBError when comment does not exist', async () => {
      tracker.on.select(TableComment).response(undefined);

      await expect(service.deleteComment(999)).rejects.toThrow(NotInDBError);
    });

    it('deletes a comment and emits event', async () => {
      const mockComment = {
        [FieldNameComment.threadId]: threadId,
      };

      const mockThread = {
        [FieldNameCommentThread.noteId]: noteId,
      };

      tracker.on.select(TableComment).response(mockComment);
      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.delete(TableComment).response(1);
      tracker.on.update(TableCommentThread).response(1);

      await service.deleteComment(commentId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_DELETED,
        expect.objectContaining({ noteId, threadId, commentId }),
      );
    });
  });

  describe('resolveThread', () => {
    it('throws NotInDBError when thread does not exist', async () => {
      tracker.on.select(TableCommentThread).response(undefined);

      await expect(service.resolveThread(999, true, userId)).rejects.toThrow(
        NotInDBError,
      );
    });

    it('resolves a thread', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'text',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 4,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockUpdatedThread = {
        ...mockThread,
        [FieldNameCommentThread.resolved]: true,
        [FieldNameCommentThread.resolvedBy]: userId,
        [FieldNameCommentThread.resolvedAt]: '2025-01-02 00:00:00',
      };

      const mockUser = {
        [FieldNameUser.username]: 'resolver',
      };

      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.update(TableCommentThread).response([mockUpdatedThread]);
      tracker.on.select(TableUser).response(mockUser);
      tracker.on.select(TableComment).response([]);

      const result = await service.resolveThread(threadId, true, userId);

      expect(result.resolved).toBe(true);
      expect(result.resolvedByUsername).toBe('resolver');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_THREAD_RESOLVED,
        expect.objectContaining({ noteId, threadId, resolved: true }),
      );
    });

    it('unresolves a thread', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'text',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 4,
        [FieldNameCommentThread.resolved]: true,
        [FieldNameCommentThread.resolvedBy]: userId,
        [FieldNameCommentThread.resolvedAt]: '2025-01-01 12:00:00',
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockUpdatedThread = {
        ...mockThread,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
      };

      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.update(TableCommentThread).response([mockUpdatedThread]);
      tracker.on.select(TableComment).response([]);

      const result = await service.resolveThread(threadId, false, userId);

      expect(result.resolved).toBe(false);
      expect(result.resolvedByUsername).toBeNull();
    });
  });

  describe('deleteThread', () => {
    it('throws NotInDBError when thread does not exist', async () => {
      tracker.on.select(TableCommentThread).response(undefined);

      await expect(service.deleteThread(999)).rejects.toThrow(NotInDBError);
    });

    it('deletes a thread and emits event', async () => {
      const mockThread = {
        [FieldNameCommentThread.noteId]: noteId,
      };

      tracker.on.select(TableCommentThread).response(mockThread);
      tracker.on.delete(TableCommentThread).response(1);

      await service.deleteThread(threadId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NoteEvent.COMMENT_THREAD_DELETED,
        expect.objectContaining({ noteId, threadId }),
      );
    });
  });

  describe('getThreadAuthor', () => {
    it('throws NotInDBError when thread has no comments', async () => {
      tracker.on.select(TableComment).response(undefined);

      await expect(service.getThreadAuthor(threadId)).rejects.toThrow(NotInDBError);
    });

    it('returns author info for first comment', async () => {
      const mockFirstComment = {
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestSession]: null,
      };

      tracker.on.select(TableComment).response(mockFirstComment);

      const result = await service.getThreadAuthor(threadId);

      expect(result.authorId).toBe(userId);
      expect(result.guestSession).toBeNull();
    });

    it('returns guest session for guest author', async () => {
      const mockGuestComment = {
        [FieldNameComment.authorId]: null,
        [FieldNameComment.guestSession]: guestSession,
      };

      tracker.on.select(TableComment).response(mockGuestComment);

      const result = await service.getThreadAuthor(threadId);

      expect(result.authorId).toBeNull();
      expect(result.guestSession).toBe(guestSession);
    });
  });

  describe('getCommentAuthor', () => {
    it('throws NotInDBError when comment does not exist', async () => {
      tracker.on.select(TableComment).response(undefined);

      await expect(service.getCommentAuthor(999)).rejects.toThrow(NotInDBError);
    });

    it('returns author info for a comment', async () => {
      const mockComment = {
        [FieldNameComment.authorId]: userId,
        [FieldNameComment.guestSession]: null,
        [FieldNameComment.threadId]: threadId,
      };

      tracker.on.select(TableComment).response(mockComment);

      const result = await service.getCommentAuthor(commentId);

      expect(result.authorId).toBe(userId);
      expect(result.threadId).toBe(threadId);
    });
  });

  describe('getNoteIdForThread', () => {
    it('throws NotInDBError when thread does not exist', async () => {
      tracker.on.select(TableCommentThread).response(undefined);

      await expect(service.getNoteIdForThread(999)).rejects.toThrow(NotInDBError);
    });

    it('returns note ID for a thread', async () => {
      const mockThread = {
        [FieldNameCommentThread.noteId]: noteId,
      };

      tracker.on.select(TableCommentThread).response(mockThread);

      const result = await service.getNoteIdForThread(threadId);

      expect(result).toBe(noteId);
    });
  });

  describe('getNoteIdForComment', () => {
    it('throws NotInDBError when comment does not exist', async () => {
      tracker.on.select(TableComment).response(undefined);

      await expect(service.getNoteIdForComment(999)).rejects.toThrow(NotInDBError);
    });

    it('returns note ID for a comment', async () => {
      const mockResult = {
        [FieldNameCommentThread.noteId]: noteId,
      };

      tracker.on.select(TableComment).response(mockResult);

      const result = await service.getNoteIdForComment(commentId);

      expect(result).toBe(noteId);
    });
  });

  describe('input validation', () => {
    describe('createThread validation', () => {
      it('throws BadRequestException for empty content', async () => {
        await expect(
          service.createThread(noteId, userId, null, 'highlighted', 0, 11, ''),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException for whitespace-only content', async () => {
        await expect(
          service.createThread(noteId, userId, null, 'highlighted', 0, 11, '   '),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException for content exceeding max length', async () => {
        const longContent = 'a'.repeat(10001);
        await expect(
          service.createThread(noteId, userId, null, 'highlighted', 0, 11, longContent),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts content at max length', async () => {
        const maxLengthContent = 'a'.repeat(10000);
        const mockCreatedThread = {
          [FieldNameCommentThread.id]: threadId,
          [FieldNameCommentThread.noteId]: noteId,
          [FieldNameCommentThread.anchorText]: 'highlighted',
          [FieldNameCommentThread.anchorStart]: 0,
          [FieldNameCommentThread.anchorEnd]: 11,
          [FieldNameCommentThread.resolved]: false,
          [FieldNameCommentThread.resolvedBy]: null,
          [FieldNameCommentThread.resolvedAt]: null,
          [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
          [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
        };

        const mockCreatedComment = {
          [FieldNameComment.id]: commentId,
          [FieldNameComment.threadId]: threadId,
          [FieldNameComment.authorId]: userId,
          [FieldNameComment.guestName]: null,
          [FieldNameComment.guestSession]: null,
          [FieldNameComment.content]: maxLengthContent,
          [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
          [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
        };

        const mockUser = {
          [FieldNameUser.username]: 'testuser',
          [FieldNameUser.displayName]: 'Test User',
        };

        tracker.on.insert(TableCommentThread).response([mockCreatedThread]);
        tracker.on.insert(TableComment).response([mockCreatedComment]);
        tracker.on.select(TableUser).response(mockUser);

        const result = await service.createThread(
          noteId,
          userId,
          null,
          'highlighted',
          0,
          11,
          maxLengthContent,
        );

        expect(result.comments[0].content).toBe(maxLengthContent);
      });

      it('creates thread with null anchors for note-level comments', async () => {
        const mockCreatedThread = {
          [FieldNameCommentThread.id]: threadId,
          [FieldNameCommentThread.noteId]: noteId,
          [FieldNameCommentThread.anchorText]: 'note-level comment',
          [FieldNameCommentThread.anchorStart]: null,
          [FieldNameCommentThread.anchorEnd]: null,
          [FieldNameCommentThread.resolved]: false,
          [FieldNameCommentThread.resolvedBy]: null,
          [FieldNameCommentThread.resolvedAt]: null,
          [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
          [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
        };

        const mockCreatedComment = {
          [FieldNameComment.id]: commentId,
          [FieldNameComment.threadId]: threadId,
          [FieldNameComment.authorId]: userId,
          [FieldNameComment.guestName]: null,
          [FieldNameComment.guestSession]: null,
          [FieldNameComment.content]: 'A note-level comment',
          [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
          [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
        };

        const mockUser = {
          [FieldNameUser.username]: 'testuser',
          [FieldNameUser.displayName]: 'Test User',
        };

        tracker.on.insert(TableCommentThread).response([mockCreatedThread]);
        tracker.on.insert(TableComment).response([mockCreatedComment]);
        tracker.on.select(TableUser).response(mockUser);

        const result = await service.createThread(
          noteId,
          userId,
          null,
          'note-level comment',
          null,
          null,
          'A note-level comment',
        );

        expect(result.anchorStart).toBeNull();
        expect(result.anchorEnd).toBeNull();
      });
    });

    describe('addComment validation', () => {
      it('throws BadRequestException for empty content', async () => {
        await expect(
          service.addComment(threadId, userId, null, ''),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException for whitespace-only content', async () => {
        await expect(
          service.addComment(threadId, userId, null, '  \n\t  '),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('updateComment validation', () => {
      it('throws BadRequestException for empty content', async () => {
        await expect(
          service.updateComment(commentId, ''),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException for whitespace-only content', async () => {
        await expect(
          service.updateComment(commentId, '   '),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('guest display name handling', () => {
    it('uses provided guest name for display', async () => {
      const mockCreatedThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'text',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 4,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockCreatedComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: null,
        [FieldNameComment.guestName]: 'Custom Guest Name',
        [FieldNameComment.guestSession]: guestSession,
        [FieldNameComment.content]: 'Guest comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      tracker.on.insert(TableCommentThread).response([mockCreatedThread]);
      tracker.on.insert(TableComment).response([mockCreatedComment]);

      const result = await service.createThread(
        noteId,
        null,
        { name: 'Custom Guest Name', session: guestSession },
        'text',
        0,
        4,
        'Guest comment',
      );

      expect(result.comments[0].authorDisplayName).toBe('Custom Guest Name');
      expect(result.comments[0].isGuest).toBe(true);
    });

    it('falls back to "Guest" when no guest name provided', async () => {
      const mockThread = {
        [FieldNameCommentThread.id]: threadId,
        [FieldNameCommentThread.noteId]: noteId,
        [FieldNameCommentThread.anchorText]: 'text',
        [FieldNameCommentThread.anchorStart]: 0,
        [FieldNameCommentThread.anchorEnd]: 4,
        [FieldNameCommentThread.resolved]: false,
        [FieldNameCommentThread.resolvedBy]: null,
        [FieldNameCommentThread.resolvedAt]: null,
        [FieldNameCommentThread.createdAt]: '2025-01-01 00:00:00',
        [FieldNameCommentThread.updatedAt]: '2025-01-01 00:00:00',
      };

      const mockComment = {
        [FieldNameComment.id]: commentId,
        [FieldNameComment.threadId]: threadId,
        [FieldNameComment.authorId]: null,
        [FieldNameComment.guestName]: null,
        [FieldNameComment.guestSession]: guestSession,
        [FieldNameComment.content]: 'Anonymous guest comment',
        [FieldNameComment.createdAt]: '2025-01-01 00:00:00',
        [FieldNameComment.updatedAt]: '2025-01-01 00:00:00',
      };

      tracker.on.select(TableCommentThread).response([mockThread]);
      tracker.on.select(TableComment).response([mockComment]);

      const result = await service.getThreadsForNote(noteId);

      expect(result[0].comments[0].authorDisplayName).toBe('Guest');
    });
  });
});
