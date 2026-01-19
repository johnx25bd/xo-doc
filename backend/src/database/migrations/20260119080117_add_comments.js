/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* oxlint-disable */

/**
 * Migration to add comment threads and comments tables.
 *
 * This enables the collaborative commenting feature where users can:
 * - Highlight text and attach comment threads
 * - Reply to threads in a threaded discussion
 * - Resolve/unresolve threads (Google Docs model)
 * - Comment as guests with display names
 */

const {
  FieldNameComment,
  FieldNameCommentThread,
  FieldNameNote,
  FieldNameUser,
  TableComment,
  TableCommentThread,
  TableNote,
  TableUser,
} = require('@hedgedoc/database');

const up = async function (knex) {
  // Create comment_thread table
  // Threads anchor to specific text ranges in notes
  await knex.schema.createTable(TableCommentThread, (table) => {
    table.comment(
      'Stores comment threads anchored to text ranges in notes. Supports resolution workflow.',
    );

    table.increments(FieldNameCommentThread.id).primary();

    // Foreign key to note
    table
      .integer(FieldNameCommentThread.noteId)
      .unsigned()
      .notNullable()
      .references(FieldNameNote.id)
      .inTable(TableNote)
      .onDelete('CASCADE');

    // Anchor information for positioning the thread in the document
    // anchor_text stores the highlighted text for display and fallback relocation
    table.text(FieldNameCommentThread.anchorText).notNullable();

    // Character offsets (nullable for note-level comments without specific anchor)
    table.integer(FieldNameCommentThread.anchorStart).unsigned().nullable();
    table.integer(FieldNameCommentThread.anchorEnd).unsigned().nullable();

    // Resolution status (Google Docs model)
    table.boolean(FieldNameCommentThread.resolved).notNullable().defaultTo(false);

    // Who resolved the thread (nullable - only set when resolved)
    table
      .integer(FieldNameCommentThread.resolvedBy)
      .unsigned()
      .nullable()
      .references(FieldNameUser.id)
      .inTable(TableUser)
      .onDelete('SET NULL');

    table.timestamp(FieldNameCommentThread.resolvedAt, {
      useTz: false,
      precision: 3,
    }).nullable();

    // Timestamps
    table.timestamp(FieldNameCommentThread.createdAt, {
      useTz: false,
      precision: 3,
    }).notNullable();

    table.timestamp(FieldNameCommentThread.updatedAt, {
      useTz: false,
      precision: 3,
    }).notNullable();

    // Indexes for efficient querying
    table.index([FieldNameCommentThread.noteId], 'idx_comment_thread_note_id');
    table.index([FieldNameCommentThread.resolved], 'idx_comment_thread_resolved');
  });

  // Create comment table
  // Individual comments within threads, supports both registered users and guests
  await knex.schema.createTable(TableComment, (table) => {
    table.comment(
      'Stores individual comments within threads. Supports both registered users and guests.',
    );

    table.increments(FieldNameComment.id).primary();

    // Foreign key to thread
    table
      .integer(FieldNameComment.threadId)
      .unsigned()
      .notNullable()
      .references(FieldNameCommentThread.id)
      .inTable(TableCommentThread)
      .onDelete('CASCADE');

    // Author - either a registered user or null for guests
    table
      .integer(FieldNameComment.authorId)
      .unsigned()
      .nullable()
      .references(FieldNameUser.id)
      .inTable(TableUser)
      .onDelete('SET NULL');

    // Guest identification (only used when author_id is null)
    // guest_name: Display name shown for the guest
    // guest_session: UUID to allow guests to edit/delete their own comments
    table.string(FieldNameComment.guestName, 100).nullable();
    table.uuid(FieldNameComment.guestSession).nullable();

    // Comment content (markdown)
    table.text(FieldNameComment.content).notNullable();

    // Timestamps
    table.timestamp(FieldNameComment.createdAt, {
      useTz: false,
      precision: 3,
    }).notNullable();

    table.timestamp(FieldNameComment.updatedAt, {
      useTz: false,
      precision: 3,
    }).notNullable();

    // Indexes for efficient querying
    table.index([FieldNameComment.threadId], 'idx_comment_thread_id');
    table.index([FieldNameComment.authorId], 'idx_comment_author_id');
    table.index([FieldNameComment.guestSession], 'idx_comment_guest_session');
  });
};

const down = async function (knex) {
  // Drop tables in reverse order to respect foreign key constraints
  await knex.schema.dropTableIfExists(TableComment);
  await knex.schema.dropTableIfExists(TableCommentThread);
};

module.exports = {
  up,
  down,
};
