/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as absenceSync from "../absenceSync.js";
import type * as absences from "../absences.js";
import type * as accessRequests from "../accessRequests.js";
import type * as activity_access from "../activity/access.js";
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
import type * as applicants from "../applicants.js";
import type * as chat from "../chat.js";
import type * as clerkSync from "../clerkSync.js";
import type * as clockodoSync from "../clockodoSync.js";
import type * as clockodoWebhookLog from "../clockodoWebhookLog.js";
import type * as crons from "../crons.js";
import type * as customRoles from "../customRoles.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as guest from "../guest.js";
import type * as http from "../http.js";
import type * as integrations_audit from "../integrations/audit.js";
import type * as integrations_clockodo_client from "../integrations/clockodo/client.js";
import type * as integrations_clockodo_users from "../integrations/clockodo/users.js";
import type * as integrations_clockodoLink from "../integrations/clockodoLink.js";
import type * as integrations_clockodoView from "../integrations/clockodoView.js";
import type * as integrations_debug from "../integrations/debug.js";
import type * as integrations_lib_auth from "../integrations/lib/auth.js";
import type * as invites from "../invites.js";
import type * as guidebookFeedback from "../guidebookFeedback.js";
import type * as guidebookHighlights from "../guidebookHighlights.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_notify from "../lib/notify.js";
import type * as members from "../members.js";
import type * as notifications from "../notifications.js";
import type * as onedrive from "../onedrive.js";
import type * as outbound from "../outbound.js";
import type * as presence from "../presence.js";
import type * as tourProgress from "../tourProgress.js";
import type * as userPreferences from "../userPreferences.js";
import type * as users from "../users.js";
import type * as wikiChats from "../wikiChats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  absenceSync: typeof absenceSync;
  absences: typeof absences;
  accessRequests: typeof accessRequests;
  "activity/access": typeof activity_access;
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
  applicants: typeof applicants;
  chat: typeof chat;
  clerkSync: typeof clerkSync;
  clockodoSync: typeof clockodoSync;
  clockodoWebhookLog: typeof clockodoWebhookLog;
  crons: typeof crons;
  customRoles: typeof customRoles;
  emails: typeof emails;
  events: typeof events;
  files: typeof files;
  guest: typeof guest;
  http: typeof http;
  "integrations/audit": typeof integrations_audit;
  "integrations/clockodo/client": typeof integrations_clockodo_client;
  "integrations/clockodo/users": typeof integrations_clockodo_users;
  "integrations/clockodoLink": typeof integrations_clockodoLink;
  "integrations/clockodoView": typeof integrations_clockodoView;
  "integrations/debug": typeof integrations_debug;
  "integrations/lib/auth": typeof integrations_lib_auth;
  invites: typeof invites;
  guidebookFeedback: typeof guidebookFeedback;
  guidebookHighlights: typeof guidebookHighlights;
  "lib/audience": typeof lib_audience;
  "lib/auth": typeof lib_auth;
  "lib/clerk": typeof lib_clerk;
  "lib/notify": typeof lib_notify;
  members: typeof members;
  notifications: typeof notifications;
  onedrive: typeof onedrive;
  outbound: typeof outbound;
  presence: typeof presence;
  tourProgress: typeof tourProgress;
  userPreferences: typeof userPreferences;
  users: typeof users;
  wikiChats: typeof wikiChats;
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
