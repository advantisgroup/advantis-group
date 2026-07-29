// i18n messages are split one file per namespace under messages/{locale}/.
// See "House style" in AGENTS.md before adding or renaming a namespace here.
import { cookies } from "next/headers";

import { getRequestConfig } from "next-intl/server";

import { defaultLocale, LOCALE_COOKIE, type Locale, locales } from "./config";
import deAbsences from "./messages/de/Absences.json";
import deAccess from "./messages/de/Access.json";
import deAccessDenied from "./messages/de/AccessDenied.json";
import deActivity from "./messages/de/Activity.json";
import deAdmin from "./messages/de/Admin.json";
import deAnnouncements from "./messages/de/Announcements.json";
import deApp from "./messages/de/App.json";
import deApplicants from "./messages/de/Applicants.json";
import deCalendar from "./messages/de/Calendar.json";
import deCaseSearch from "./messages/de/CaseSearch.json";
import deChat from "./messages/de/Chat.json";
import deCommand from "./messages/de/Command.json";
import deCommon from "./messages/de/Common.json";
import deCustomRoles from "./messages/de/CustomRoles.json";
import deDashboard from "./messages/de/Dashboard.json";
import deDirectory from "./messages/de/Directory.json";
import deErrorManagement from "./messages/de/ErrorManagement.json";
import deErrors from "./messages/de/Errors.json";
import deErrorsCatalog from "./messages/de/ErrorsCatalog.json";
import deFeatureFlags from "./messages/de/FeatureFlags.json";
import deFiles from "./messages/de/Files.json";
import deFileViewer from "./messages/de/FileViewer.json";
import deForbidden from "./messages/de/Forbidden.json";
import deGuest from "./messages/de/Guest.json";
import deGuidebooks from "./messages/de/Guidebooks.json";
import deImprint from "./messages/de/imprint.json";
import deIntegrations from "./messages/de/Integrations.json";
import deNav from "./messages/de/Nav.json";
import deNotFound from "./messages/de/NotFound.json";
import deNotifications from "./messages/de/Notifications.json";
import deOnboarding from "./messages/de/Onboarding.json";
import dePerformance from "./messages/de/Performance.json";
import deprivacy from "./messages/de/privacy.json";
import deProfile from "./messages/de/Profile.json";
import deRoles from "./messages/de/Roles.json";
import deSettings from "./messages/de/Settings.json";
import deTeams from "./messages/de/Teams.json";
import determs from "./messages/de/terms.json";
import deTour from "./messages/de/Tour.json";
import deUpdates from "./messages/de/Updates.json";
import enAbsences from "./messages/en/Absences.json";
import enAccess from "./messages/en/Access.json";
import enAccessDenied from "./messages/en/AccessDenied.json";
import enActivity from "./messages/en/Activity.json";
import enAdmin from "./messages/en/Admin.json";
import enAnnouncements from "./messages/en/Announcements.json";
import enApp from "./messages/en/App.json";
import enApplicants from "./messages/en/Applicants.json";
import enCalendar from "./messages/en/Calendar.json";
import enCaseSearch from "./messages/en/CaseSearch.json";
import enChat from "./messages/en/Chat.json";
import enCommand from "./messages/en/Command.json";
import enCommon from "./messages/en/Common.json";
import enCustomRoles from "./messages/en/CustomRoles.json";
import enDashboard from "./messages/en/Dashboard.json";
import enDirectory from "./messages/en/Directory.json";
import enErrorManagement from "./messages/en/ErrorManagement.json";
import enErrors from "./messages/en/Errors.json";
import enErrorsCatalog from "./messages/en/ErrorsCatalog.json";
import enFeatureFlags from "./messages/en/FeatureFlags.json";
import enFiles from "./messages/en/Files.json";
import enFileViewer from "./messages/en/FileViewer.json";
import enForbidden from "./messages/en/Forbidden.json";
import enGuest from "./messages/en/Guest.json";
import enGuidebooks from "./messages/en/Guidebooks.json";
import enImprint from "./messages/en/imprint.json";
import enIntegrations from "./messages/en/Integrations.json";
import enNav from "./messages/en/Nav.json";
import enNotFound from "./messages/en/NotFound.json";
import enNotifications from "./messages/en/Notifications.json";
import enOnboarding from "./messages/en/Onboarding.json";
import enPerformance from "./messages/en/Performance.json";
import enprivacy from "./messages/en/privacy.json";
import enProfile from "./messages/en/Profile.json";
import enRoles from "./messages/en/Roles.json";
import enSettings from "./messages/en/Settings.json";
import enTeams from "./messages/en/Teams.json";
import enterms from "./messages/en/terms.json";
import enTour from "./messages/en/Tour.json";
import enUpdates from "./messages/en/Updates.json";

export { defaultLocale, LOCALE_COOKIE, locales };
export type { Locale };

// New namespace checklist (see AGENTS.md "House style"): create both
// messages/en/<Namespace>.json and messages/de/<Namespace>.json, then add
// both imports above and both entries below. Adding keys to an existing
// namespace's JSON needs no change here.
const messagesByLocale = {
  en: {
    App: enApp,
    Nav: enNav,
    Common: enCommon,
    Access: enAccess,
    Dashboard: enDashboard,
    Calendar: enCalendar,
    Absences: enAbsences,
    Announcements: enAnnouncements,
    Chat: enChat,
    Directory: enDirectory,
    Profile: enProfile,
    Tour: enTour,
    Onboarding: enOnboarding,
    Admin: enAdmin,
    Teams: enTeams,
    CustomRoles: enCustomRoles,
    Guidebooks: enGuidebooks,
    CaseSearch: enCaseSearch,
    Settings: enSettings,
    Roles: enRoles,
    Integrations: enIntegrations,
    Notifications: enNotifications,
    Command: enCommand,
    Performance: enPerformance,
    Guest: enGuest,
    Errors: enErrors,
    ErrorManagement: enErrorManagement,
    Activity: enActivity,
    Files: enFiles,
    FileViewer: enFileViewer,
    Updates: enUpdates,
    AccessDenied: enAccessDenied,
    Forbidden: enForbidden,
    NotFound: enNotFound,
    ErrorsCatalog: enErrorsCatalog,
    privacy: enprivacy,
    terms: enterms,
    imprint: enImprint,
    Applicants: enApplicants,
    FeatureFlags: enFeatureFlags,
  },
  de: {
    App: deApp,
    Nav: deNav,
    Common: deCommon,
    Access: deAccess,
    Dashboard: deDashboard,
    Calendar: deCalendar,
    Absences: deAbsences,
    Announcements: deAnnouncements,
    Chat: deChat,
    Directory: deDirectory,
    Profile: deProfile,
    Tour: deTour,
    Onboarding: deOnboarding,
    Admin: deAdmin,
    Teams: deTeams,
    CustomRoles: deCustomRoles,
    Guidebooks: deGuidebooks,
    CaseSearch: deCaseSearch,
    Settings: deSettings,
    Roles: deRoles,
    Integrations: deIntegrations,
    Notifications: deNotifications,
    Command: deCommand,
    Performance: dePerformance,
    Guest: deGuest,
    Errors: deErrors,
    ErrorManagement: deErrorManagement,
    Activity: deActivity,
    Files: deFiles,
    FileViewer: deFileViewer,
    Updates: deUpdates,
    AccessDenied: deAccessDenied,
    Forbidden: deForbidden,
    NotFound: deNotFound,
    ErrorsCatalog: deErrorsCatalog,
    privacy: deprivacy,
    terms: determs,
    imprint: deImprint,
    Applicants: deApplicants,
    FeatureFlags: deFeatureFlags,
  },
} satisfies Record<Locale, Record<string, unknown>>;

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = (locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale],
  };
});
