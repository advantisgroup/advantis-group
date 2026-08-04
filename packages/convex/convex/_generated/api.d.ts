/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as academyParticipants from "../academyParticipants.js";
import type * as academyQuestions from "../academyQuestions.js";
import type * as academyResults from "../academyResults.js";
import type * as academySettings from "../academySettings.js";
import type * as accessRequests from "../accessRequests.js";
import type * as activity_access from "../activity/access.js";
import type * as activity_agentVersion from "../activity/agentVersion.js";
import type * as activity_audit from "../activity/audit.js";
import type * as activity_clockodo from "../activity/clockodo.js";
import type * as activity_deviceAuth from "../activity/deviceAuth.js";
import type * as activity_devices from "../activity/devices.js";
import type * as activity_events from "../activity/events.js";
import type * as activity_genesys from "../activity/genesys.js";
import type * as activity_ingest from "../activity/ingest.js";
import type * as activity_integrations from "../activity/integrations.js";
import type * as activity_lib_businessHours from "../activity/lib/businessHours.js";
import type * as activity_lib_clockodoDay from "../activity/lib/clockodoDay.js";
import type * as activity_lib_contracts from "../activity/lib/contracts.js";
import type * as activity_lib_crypto from "../activity/lib/crypto.js";
import type * as activity_lib_errors from "../activity/lib/errors.js";
import type * as activity_lib_integrationsShared from "../activity/lib/integrationsShared.js";
import type * as activity_lib_patterns from "../activity/lib/patterns.js";
import type * as activity_lib_state from "../activity/lib/state.js";
import type * as activity_lib_users from "../activity/lib/users.js";
import type * as activity_maintenance from "../activity/maintenance.js";
import type * as activity_migration from "../activity/migration.js";
import type * as activity_migrationExport from "../activity/migrationExport.js";
import type * as activity_migrationRun from "../activity/migrationRun.js";
import type * as activity_patternReports from "../activity/patternReports.js";
import type * as activity_people from "../activity/people.js";
import type * as activity_reports from "../activity/reports.js";
import type * as activity_settings from "../activity/settings.js";
import type * as activity_state from "../activity/state.js";
import type * as activity_stats from "../activity/stats.js";
import type * as analytics from "../analytics.js";
import type * as announcements from "../announcements.js";
import type * as applicantVault from "../applicantVault.js";
import type * as applicants from "../applicants.js";
import type * as auditLog from "../auditLog.js";
import type * as chat from "../chat.js";
import type * as clerkSync from "../clerkSync.js";
import type * as clockodoWebhookLog from "../clockodoWebhookLog.js";
import type * as companies from "../companies.js";
import type * as companyRoles from "../companyRoles.js";
import type * as crons from "../crons.js";
import type * as customRoles from "../customRoles.js";
import type * as emails from "../emails.js";
import type * as errorCategories from "../errorCategories.js";
import type * as errorMeasures from "../errorMeasures.js";
import type * as errorReports from "../errorReports.js";
import type * as errorSettings from "../errorSettings.js";
import type * as events from "../events.js";
import type * as featureFlags from "../featureFlags.js";
import type * as files from "../files.js";
import type * as guidebookAttachments from "../guidebookAttachments.js";
import type * as guidebookFeedback from "../guidebookFeedback.js";
import type * as guidebookHighlights from "../guidebookHighlights.js";
import type * as guidebookPages from "../guidebookPages.js";
import type * as guidebookReads from "../guidebookReads.js";
import type * as http from "../http.js";
import type * as humanResources from "../humanResources.js";
import type * as integrations_audit from "../integrations/audit.js";
import type * as integrations_clockodo_client from "../integrations/clockodo/client.js";
import type * as integrations_clockodo_users from "../integrations/clockodo/users.js";
import type * as integrations_clockodoAbsences from "../integrations/clockodoAbsences.js";
import type * as integrations_clockodoLink from "../integrations/clockodoLink.js";
import type * as integrations_clockodoView from "../integrations/clockodoView.js";
import type * as integrations_debug from "../integrations/debug.js";
import type * as integrations_lib_auth from "../integrations/lib/auth.js";
import type * as invites from "../invites.js";
import type * as itTicketThreads from "../itTicketThreads.js";
import type * as itTickets from "../itTickets.js";
import type * as lib_adminVerification from "../lib/adminVerification.js";
import type * as lib_analytics from "../lib/analytics.js";
import type * as lib_attachments from "../lib/attachments.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_auditLogWrite from "../lib/auditLogWrite.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_clockodoId from "../lib/clockodoId.js";
import type * as lib_featureGate from "../lib/featureGate.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_profile from "../lib/profile.js";
import type * as lib_users from "../lib/users.js";
import type * as members from "../members.js";
import type * as migrations_backfillCustomRoleIds from "../migrations/backfillCustomRoleIds.js";
import type * as migrations_backfillManageClockodoTeam from "../migrations/backfillManageClockodoTeam.js";
import type * as migrations_backfillPerformanceCompanyId from "../migrations/backfillPerformanceCompanyId.js";
import type * as migrations_dropGuestFields from "../migrations/dropGuestFields.js";
import type * as notifications from "../notifications.js";
import type * as onedrive from "../onedrive.js";
import type * as orgData from "../orgData.js";
import type * as orgDataMigration from "../orgDataMigration.js";
import type * as outbound from "../outbound.js";
import type * as passwordResets from "../passwordResets.js";
import type * as performance_lib_callImport from "../performance/lib/callImport.js";
import type * as performance_lib_interactionImport from "../performance/lib/interactionImport.js";
import type * as performance_lib_kpi from "../performance/lib/kpi.js";
import type * as performance_lib_permissions from "../performance/lib/permissions.js";
import type * as performance_lib_salesforceImport from "../performance/lib/salesforceImport.js";
import type * as performance_lib_types from "../performance/lib/types.js";
import type * as performance_lib_workdays from "../performance/lib/workdays.js";
import type * as performance_lib_xlsxZip from "../performance/lib/xlsxZip.js";
import type * as performanceAuth from "../performanceAuth.js";
import type * as performanceExport from "../performanceExport.js";
import type * as performanceImport from "../performanceImport.js";
import type * as performanceQueries from "../performanceQueries.js";
import type * as performanceTopics from "../performanceTopics.js";
import type * as performanceUploadParse from "../performanceUploadParse.js";
import type * as presence from "../presence.js";
import type * as salesCockpit from "../salesCockpit.js";
import type * as suggestionCategories from "../suggestionCategories.js";
import type * as suggestions from "../suggestions.js";
import type * as tourProgress from "../tourProgress.js";
import type * as updates from "../updates.js";
import type * as updatesEmail from "../updatesEmail.js";
import type * as updatesInternal from "../updatesInternal.js";
import type * as userPreferences from "../userPreferences.js";
import type * as users from "../users.js";
import type * as wikiCategories from "../wikiCategories.js";
import type * as wikiChats from "../wikiChats.js";
import type * as wikiEntries from "../wikiEntries.js";
import type * as wikiMigration from "../wikiMigration.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  academyParticipants: typeof academyParticipants;
  academyQuestions: typeof academyQuestions;
  academyResults: typeof academyResults;
  academySettings: typeof academySettings;
  accessRequests: typeof accessRequests;
  "activity/access": typeof activity_access;
  "activity/agentVersion": typeof activity_agentVersion;
  "activity/audit": typeof activity_audit;
  "activity/clockodo": typeof activity_clockodo;
  "activity/deviceAuth": typeof activity_deviceAuth;
  "activity/devices": typeof activity_devices;
  "activity/events": typeof activity_events;
  "activity/genesys": typeof activity_genesys;
  "activity/ingest": typeof activity_ingest;
  "activity/integrations": typeof activity_integrations;
  "activity/lib/businessHours": typeof activity_lib_businessHours;
  "activity/lib/clockodoDay": typeof activity_lib_clockodoDay;
  "activity/lib/contracts": typeof activity_lib_contracts;
  "activity/lib/crypto": typeof activity_lib_crypto;
  "activity/lib/errors": typeof activity_lib_errors;
  "activity/lib/integrationsShared": typeof activity_lib_integrationsShared;
  "activity/lib/patterns": typeof activity_lib_patterns;
  "activity/lib/state": typeof activity_lib_state;
  "activity/lib/users": typeof activity_lib_users;
  "activity/maintenance": typeof activity_maintenance;
  "activity/migration": typeof activity_migration;
  "activity/migrationExport": typeof activity_migrationExport;
  "activity/migrationRun": typeof activity_migrationRun;
  "activity/patternReports": typeof activity_patternReports;
  "activity/people": typeof activity_people;
  "activity/reports": typeof activity_reports;
  "activity/settings": typeof activity_settings;
  "activity/state": typeof activity_state;
  "activity/stats": typeof activity_stats;
  analytics: typeof analytics;
  announcements: typeof announcements;
  applicantVault: typeof applicantVault;
  applicants: typeof applicants;
  auditLog: typeof auditLog;
  chat: typeof chat;
  clerkSync: typeof clerkSync;
  clockodoWebhookLog: typeof clockodoWebhookLog;
  companies: typeof companies;
  companyRoles: typeof companyRoles;
  crons: typeof crons;
  customRoles: typeof customRoles;
  emails: typeof emails;
  errorCategories: typeof errorCategories;
  errorMeasures: typeof errorMeasures;
  errorReports: typeof errorReports;
  errorSettings: typeof errorSettings;
  events: typeof events;
  featureFlags: typeof featureFlags;
  files: typeof files;
  guidebookAttachments: typeof guidebookAttachments;
  guidebookFeedback: typeof guidebookFeedback;
  guidebookHighlights: typeof guidebookHighlights;
  guidebookPages: typeof guidebookPages;
  guidebookReads: typeof guidebookReads;
  http: typeof http;
  humanResources: typeof humanResources;
  "integrations/audit": typeof integrations_audit;
  "integrations/clockodo/client": typeof integrations_clockodo_client;
  "integrations/clockodo/users": typeof integrations_clockodo_users;
  "integrations/clockodoAbsences": typeof integrations_clockodoAbsences;
  "integrations/clockodoLink": typeof integrations_clockodoLink;
  "integrations/clockodoView": typeof integrations_clockodoView;
  "integrations/debug": typeof integrations_debug;
  "integrations/lib/auth": typeof integrations_lib_auth;
  invites: typeof invites;
  itTicketThreads: typeof itTicketThreads;
  itTickets: typeof itTickets;
  "lib/adminVerification": typeof lib_adminVerification;
  "lib/analytics": typeof lib_analytics;
  "lib/attachments": typeof lib_attachments;
  "lib/audience": typeof lib_audience;
  "lib/auditLogWrite": typeof lib_auditLogWrite;
  "lib/auth": typeof lib_auth;
  "lib/clerk": typeof lib_clerk;
  "lib/clockodoId": typeof lib_clockodoId;
  "lib/featureGate": typeof lib_featureGate;
  "lib/notify": typeof lib_notify;
  "lib/permissions": typeof lib_permissions;
  "lib/profile": typeof lib_profile;
  "lib/users": typeof lib_users;
  members: typeof members;
  "migrations/backfillCustomRoleIds": typeof migrations_backfillCustomRoleIds;
  "migrations/backfillManageClockodoTeam": typeof migrations_backfillManageClockodoTeam;
  "migrations/backfillPerformanceCompanyId": typeof migrations_backfillPerformanceCompanyId;
  "migrations/dropGuestFields": typeof migrations_dropGuestFields;
  notifications: typeof notifications;
  onedrive: typeof onedrive;
  orgData: typeof orgData;
  orgDataMigration: typeof orgDataMigration;
  outbound: typeof outbound;
  passwordResets: typeof passwordResets;
  "performance/lib/callImport": typeof performance_lib_callImport;
  "performance/lib/interactionImport": typeof performance_lib_interactionImport;
  "performance/lib/kpi": typeof performance_lib_kpi;
  "performance/lib/permissions": typeof performance_lib_permissions;
  "performance/lib/salesforceImport": typeof performance_lib_salesforceImport;
  "performance/lib/types": typeof performance_lib_types;
  "performance/lib/workdays": typeof performance_lib_workdays;
  "performance/lib/xlsxZip": typeof performance_lib_xlsxZip;
  performanceAuth: typeof performanceAuth;
  performanceExport: typeof performanceExport;
  performanceImport: typeof performanceImport;
  performanceQueries: typeof performanceQueries;
  performanceTopics: typeof performanceTopics;
  performanceUploadParse: typeof performanceUploadParse;
  presence: typeof presence;
  salesCockpit: typeof salesCockpit;
  suggestionCategories: typeof suggestionCategories;
  suggestions: typeof suggestions;
  tourProgress: typeof tourProgress;
  updates: typeof updates;
  updatesEmail: typeof updatesEmail;
  updatesInternal: typeof updatesInternal;
  userPreferences: typeof userPreferences;
  users: typeof users;
  wikiCategories: typeof wikiCategories;
  wikiChats: typeof wikiChats;
  wikiEntries: typeof wikiEntries;
  wikiMigration: typeof wikiMigration;
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
