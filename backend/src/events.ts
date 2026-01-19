/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { EventMap } from 'eventemitter2';

export const eventModuleConfig = {
  wildcard: false,
  delimiter: '.',
  newListener: false,
  removeListener: false,
  maxListeners: 10,
  verboseMemoryLeak: true,
  ignoreErrors: false,
};

export enum NoteEvent {
  /**
   * Event triggered when a note's permissions are changed.
   * Payload:
   *  noteId: The id of the {@link Note}, for which permissions are changed.
   */
  PERMISSION_CHANGE = 'note.permission_change',

  /**
   * Event triggered when a note is deleted
   * Payload:
   *   noteId: The id of the {@link Note}, which is being deleted.
   */
  DELETION = 'note.deletion',

  /**
   * Event triggered when the realtime note needs to be closed, e.g. when external updates are made to the note.
   * Payload:
   *   noteId: The id of the {@link Note}, which should be closed.
   */
  CLOSE_REALTIME = 'note.close_realtime',

  /**
   * Event triggered when a new comment thread is created on a note.
   * Payload:
   *   noteId: The id of the {@link Note} the thread was created on.
   *   threadId: The id of the newly created {@link CommentThread}.
   */
  COMMENT_THREAD_CREATED = 'note.comment_thread_created',

  /**
   * Event triggered when a comment is added to a thread.
   * Payload:
   *   noteId: The id of the {@link Note} containing the thread.
   *   threadId: The id of the {@link CommentThread}.
   *   commentId: The id of the newly created {@link Comment}.
   */
  COMMENT_ADDED = 'note.comment_added',

  /**
   * Event triggered when a comment is updated.
   * Payload:
   *   noteId: The id of the {@link Note} containing the thread.
   *   threadId: The id of the {@link CommentThread}.
   *   commentId: The id of the updated {@link Comment}.
   */
  COMMENT_UPDATED = 'note.comment_updated',

  /**
   * Event triggered when a comment is deleted.
   * Payload:
   *   noteId: The id of the {@link Note} containing the thread.
   *   threadId: The id of the {@link CommentThread}.
   *   commentId: The id of the deleted {@link Comment}.
   */
  COMMENT_DELETED = 'note.comment_deleted',

  /**
   * Event triggered when a comment thread is resolved or unresolved.
   * Payload:
   *   noteId: The id of the {@link Note} containing the thread.
   *   threadId: The id of the {@link CommentThread}.
   *   resolved: Whether the thread is now resolved (true) or unresolved (false).
   */
  COMMENT_THREAD_RESOLVED = 'note.comment_thread_resolved',

  /**
   * Event triggered when a comment thread is deleted.
   * Payload:
   *   noteId: The id of the {@link Note} the thread was on.
   *   threadId: The id of the deleted {@link CommentThread}.
   */
  COMMENT_THREAD_DELETED = 'note.comment_thread_deleted',
}

/**
 * Payload for comment-related events.
 */
export interface CommentEventPayload {
  noteId: number;
  threadId: number;
  commentId?: number;
  resolved?: boolean;
}

export interface NoteEventMap extends EventMap {
  [NoteEvent.PERMISSION_CHANGE]: (noteId: number) => void;
  [NoteEvent.DELETION]: (noteId: number) => void;
  [NoteEvent.CLOSE_REALTIME]: (noteId: number) => void;
  [NoteEvent.COMMENT_THREAD_CREATED]: (payload: CommentEventPayload) => void;
  [NoteEvent.COMMENT_ADDED]: (payload: CommentEventPayload) => void;
  [NoteEvent.COMMENT_UPDATED]: (payload: CommentEventPayload) => void;
  [NoteEvent.COMMENT_DELETED]: (payload: CommentEventPayload) => void;
  [NoteEvent.COMMENT_THREAD_RESOLVED]: (payload: CommentEventPayload) => void;
  [NoteEvent.COMMENT_THREAD_DELETED]: (payload: CommentEventPayload) => void;
}
