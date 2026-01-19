/*
 * SPDX-FileCopyrightText: 2025 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { RealtimeUser, RemoteCursor } from './realtime-user.js'

export enum MessageType {
  NOTE_CONTENT_STATE_REQUEST = 'NOTE_CONTENT_STATE_REQUEST',
  NOTE_CONTENT_UPDATE = 'NOTE_CONTENT_UPDATE',
  PING = 'PING',
  PONG = 'PONG',
  METADATA_UPDATED = 'METADATA_UPDATED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',
  SERVER_VERSION_UPDATED = 'SERVER_VERSION_UPDATED',
  REALTIME_USER_STATE_SET = 'REALTIME_USER_STATE_SET',
  REALTIME_USER_SINGLE_UPDATE = 'REALTIME_USER_SINGLE_UPDATE',
  REALTIME_USER_STATE_REQUEST = 'REALTIME_USER_STATE_REQUEST',
  REALTIME_USER_SET_ACTIVITY = 'REALTIME_USER_SET_ACTIVITY',

  READY_REQUEST = 'READY_REQUEST',
  READY_ANSWER = 'READY_ANSWER',

  /** Comment system real-time updates */
  COMMENT_UPDATE = 'COMMENT_UPDATE',
}

/**
 * Types of comment updates that can be broadcast.
 */
export enum CommentUpdateType {
  THREAD_CREATED = 'thread_created',
  COMMENT_ADDED = 'comment_added',
  COMMENT_UPDATED = 'comment_updated',
  COMMENT_DELETED = 'comment_deleted',
  THREAD_RESOLVED = 'thread_resolved',
  THREAD_DELETED = 'thread_deleted',
}

/**
 * Payload for comment update messages.
 */
export interface CommentUpdatePayload {
  /** The type of update */
  updateType: CommentUpdateType
  /** ID of the affected thread */
  threadId: number
  /** ID of the affected comment (for comment-level updates) */
  commentId?: number
  /** Whether thread is now resolved (for THREAD_RESOLVED) */
  resolved?: boolean
}

export enum ConnectionStateEvent {
  READY = 'ready',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

export interface MessagePayloads {
  [MessageType.NOTE_CONTENT_STATE_REQUEST]: number[]
  [MessageType.NOTE_CONTENT_UPDATE]: number[]
  [MessageType.REALTIME_USER_STATE_SET]: {
    users: RealtimeUser[]
    ownUser: {
      displayName: string
      styleIndex: number
    }
  }
  [MessageType.REALTIME_USER_SINGLE_UPDATE]: RemoteCursor

  [MessageType.REALTIME_USER_SET_ACTIVITY]: {
    active: boolean
  }

  /** Comment system real-time update payload */
  [MessageType.COMMENT_UPDATE]: CommentUpdatePayload
}

export type Message<T extends MessageType> = T extends keyof MessagePayloads
  ? {
      type: T
      payload: MessagePayloads[T]
    }
  : {
      type: T
    }
