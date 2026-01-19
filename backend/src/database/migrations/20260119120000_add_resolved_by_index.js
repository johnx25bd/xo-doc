/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* oxlint-disable */

/**
 * Migration to add an index on the resolved_by column for efficient queries
 * filtering threads by resolver.
 */

const {
  FieldNameCommentThread,
  TableCommentThread,
} = require('@hedgedoc/database');

const up = async function (knex) {
  await knex.schema.alterTable(TableCommentThread, (table) => {
    table.index(
      [FieldNameCommentThread.resolvedBy],
      'idx_comment_thread_resolved_by',
    );
  });
};

const down = async function (knex) {
  await knex.schema.alterTable(TableCommentThread, (table) => {
    table.dropIndex(
      [FieldNameCommentThread.resolvedBy],
      'idx_comment_thread_resolved_by',
    );
  });
};

module.exports = {
  up,
  down,
};
