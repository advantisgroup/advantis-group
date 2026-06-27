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
import type * as activity_audit from "../activity/audit.js";
import type * as activity_clockodo from "../activity/clockodo.js";
import type * as activity_deviceAuth from "../activity/deviceAuth.js";
import type * as activity_devices from "../activity/devices.js";
import type * as activity_events from "../activity/events.js";
import type * as activity_genesys from "../activity/genesys.js";
import type * as activity_ingest from "../activity/ingest.js";
import type * as activity_integrations from "../activity/integrations.js";
import type * as activity_lib_contracts from "../activity/lib/contracts.js";
import type * as activity_lib_crypto from "../activity/lib/crypto.js";
import type * as activity_lib_errors from "../activity/lib/errors.js";
import type * as activity_lib_integrationsShared from "../activity/lib/integrationsShared.js";
import type * as activity_lib_state from "../activity/lib/state.js";
import type * as activity_lib_users from "../activity/lib/users.js";
import type * as activity_maintenance from "../activity/maintenance.js";
import type * as activity_migration from "../activity/migration.js";
import type * as activity_migrationExport from "../activity/migrationExport.js";
import type * as activity_migrationRun from "../activity/migrationRun.js";
import type * as activity_people from "../activity/people.js";
import type * as activity_reports from "../activity/reports.js";
import type * as activity_settings from "../activity/settings.js";
import type * as activity_state from "../activity/state.js";
import type * as activity_stats from "../activity/stats.js";
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
  "activity/audit": typeof activity_audit;
  "activity/clockodo": typeof activity_clockodo;
  "activity/deviceAuth": typeof activity_deviceAuth;
  "activity/devices": typeof activity_devices;
  "activity/events": typeof activity_events;
  "activity/genesys": typeof activity_genesys;
  "activity/ingest": typeof activity_ingest;
  "activity/integrations": typeof activity_integrations;
  "activity/lib/contracts": typeof activity_lib_contracts;
  "activity/lib/crypto": typeof activity_lib_crypto;
  "activity/lib/errors": typeof activity_lib_errors;
  "activity/lib/integrationsShared": typeof activity_lib_integrationsShared;
  "activity/lib/state": typeof activity_lib_state;
  "activity/lib/users": typeof activity_lib_users;
  "activity/maintenance": typeof activity_maintenance;
  "activity/migration": typeof activity_migration;
  "activity/migrationExport": typeof activity_migrationExport;
  "activity/migrationRun": typeof activity_migrationRun;
  "activity/people": typeof activity_people;
  "activity/reports": typeof activity_reports;
  "activity/settings": typeof activity_settings;
  "activity/state": typeof activity_state;
  "activity/stats": typeof activity_stats;
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
