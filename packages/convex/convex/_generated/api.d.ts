/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as absences from "../absences.js";
import type * as accessRequests from "../accessRequests.js";
import type * as announcements from "../announcements.js";
import type * as chat from "../chat.js";
import type * as clerkSync from "../clerkSync.js";
import type * as clockodoSync from "../clockodoSync.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as guest from "../guest.js";
import type * as invites from "../invites.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_notify from "../lib/notify.js";
import type * as notifications from "../notifications.js";
import type * as outbound from "../outbound.js";
import type * as presence from "../presence.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  absences: typeof absences;
  accessRequests: typeof accessRequests;
  announcements: typeof announcements;
  chat: typeof chat;
  clerkSync: typeof clerkSync;
  clockodoSync: typeof clockodoSync;
  emails: typeof emails;
  events: typeof events;
  files: typeof files;
  guest: typeof guest;
  invites: typeof invites;
  "lib/audience": typeof lib_audience;
  "lib/auth": typeof lib_auth;
  "lib/notify": typeof lib_notify;
  notifications: typeof notifications;
  outbound: typeof outbound;
  presence: typeof presence;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
