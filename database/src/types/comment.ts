/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * A comment represents a single message within a {@link CommentThread}.
 *
 * Comments can be authored by registered users or guests:
 * - Registered users: author_id is set, guest fields are null
 * - Guests: author_id is null, guest_name and guest_session are set
 *
 * The guest_session UUID allows guests to edit/delete their own comments
 * within the same browser session.
 */
export interface Comment {
  /** The unique id of the comment for internal referencing */
  [FieldNameComment.id]: number

  /** The id of the {@link CommentThread} this comment belongs to */
  [FieldNameComment.threadId]: number

  /** The id of the {@link User} who authored this comment (null for guests) */
  [FieldNameComment.authorId]: number | null

  /** Display name for guest commenters (null for registered users) */
  [FieldNameComment.guestName]: string | null

  /** UUID to identify guest session for edit/delete permissions (null for registered users) */
  [FieldNameComment.guestSession]: string | null

  /** The markdown content of the comment */
  [FieldNameComment.content]: string

  /** Timestamp when this comment was created */
  [FieldNameComment.createdAt]: string

  /** Timestamp when this comment was last updated */
  [FieldNameComment.updatedAt]: string
}

export const enum FieldNameComment {
  id = 'id',
  threadId = 'thread_id',
  authorId = 'author_id',
  guestName = 'guest_name',
  guestSession = 'guest_session',
  content = 'content',
  createdAt = 'created_at',
  updatedAt = 'updated_at',
}

export const TableComment = 'comment'

/** Type for inserting a new comment (id is auto-generated) */
export type TypeInsertComment = Omit<Comment, FieldNameComment.id>

/** Type for updating a comment (only content and updatedAt can be modified) */
export type TypeUpdateComment = Pick<
  Comment,
  FieldNameComment.content | FieldNameComment.updatedAt
>
