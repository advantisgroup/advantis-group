// i18n messages are split one file per namespace under messages/{locale}/.
// See "House style" in AGENTS.md before adding or renaming a namespace here.
import { cookies } from "next/headers";

import { getRequestConfig } from "next-intl/server";

import { defaultLocale, LOCALE_COOKIE, type Locale, locales } from "./config";
import deAbsences from "./messages/de/Absences.json";
import deAccess from "./messages/de/Access.json";
import deAccessDenied from "./messages/de/AccessDenied.json";
import deActivity from "./messages/de/Activity.json";
import deActivityTrack from "./messages/de/ActivityTrack.json";
import deAdmin from "./messages/de/Admin.json";
import deAi from "./messages/de/Ai.json";
import deAnnouncements from "./messages/de/Announcements.json";
import deApprovals from "./messages/de/Approvals.json";
import deApp from "./messages/de/App.json";
import deApplicants from "./messages/de/Applicants.json";
import deBlog from "./messages/de/Blog.json";
import deCalendar from "./messages/de/Calendar.json";
import deCaseSearch from "./messages/de/CaseSearch.json";
import deChat from "./messages/de/Chat.json";
import deCommand from "./messages/de/Command.json";
import deCommon from "./messages/de/Common.json";
import deCompose from "./messages/de/Compose.json";
import deCustomRoles from "./messages/de/CustomRoles.json";
import deDashboard from "./messages/de/Dashboard.json";
import deDesign from "./messages/de/Design.json";
import deDirectory from "./messages/de/Directory.json";
import deDrafts from "./messages/de/Drafts.json";
import deErrorManagement from "./messages/de/ErrorManagement.json";
import deErrors from "./messages/de/Errors.json";
import deErrorsCatalog from "./messages/de/ErrorsCatalog.json";
import deFeatureFlags from "./messages/de/FeatureFlags.json";
import deFiles from "./messages/de/Files.json";
import deFileViewer from "./messages/de/FileViewer.json";
import deForbidden from "./messages/de/Forbidden.json";
import deGuidebooks from "./messages/de/Guidebooks.json";
import deHelp from "./messages/de/Help.json";
import deRequests from "./messages/de/Requests.json";
import deWhoToAsk from "./messages/de/WhoToAsk.json";
import dePolicies from "./messages/de/Policies.json";
import deImprint from "./messages/de/imprint.json";
import deIntegrations from "./messages/de/Integrations.json";
import deInquiries from "./messages/de/Inquiries.json";
import deItTickets from "./messages/de/ItTickets.json";
import deNav from "./messages/de/Nav.json";
import deNotFound from "./messages/de/NotFound.json";
import deNotifications from "./messages/de/Notifications.json";
import deOnboarding from "./messages/de/Onboarding.json";
import dePlayground from "./messages/de/Playground.json";
import dePasswordReset from "./messages/de/PasswordReset.json";
import dePerformance from "./messages/de/Performance.json";
import deprivacy from "./messages/de/privacy.json";
import deProfile from "./messages/de/Profile.json";
import deRoles from "./messages/de/Roles.json";
import deRichText from "./messages/de/RichText.json";
import deSalesCoachEv from "./messages/de/SalesCoachEv.json";
import deSalesCockpit from "./messages/de/SalesCockpit.json";
import deSettings from "./messages/de/Settings.json";
import deStepUp from "./messages/de/StepUp.json";
import deSuggestions from "./messages/de/Suggestions.json";
import deTeams from "./messages/de/Teams.json";
import determs from "./messages/de/terms.json";
import deTour from "./messages/de/Tour.json";
import deUpdates from "./messages/de/Updates.json";
import enAbsences from "./messages/en/Absences.json";
import enAccess from "./messages/en/Access.json";
import enAccessDenied from "./messages/en/AccessDenied.json";
import enActivity from "./messages/en/Activity.json";
import enActivityTrack from "./messages/en/ActivityTrack.json";
import enAdmin from "./messages/en/Admin.json";
import enAi from "./messages/en/Ai.json";
import enAnnouncements from "./messages/en/Announcements.json";
import enApprovals from "./messages/en/Approvals.json";
import enApp from "./messages/en/App.json";
import enApplicants from "./messages/en/Applicants.json";
import enBlog from "./messages/en/Blog.json";
import enCalendar from "./messages/en/Calendar.json";
import enCaseSearch from "./messages/en/CaseSearch.json";
import enChat from "./messages/en/Chat.json";
import enCommand from "./messages/en/Command.json";
import enCommon from "./messages/en/Common.json";
import enCompose from "./messages/en/Compose.json";
import enCustomRoles from "./messages/en/CustomRoles.json";
import enDashboard from "./messages/en/Dashboard.json";
import enDesign from "./messages/en/Design.json";
import enDirectory from "./messages/en/Directory.json";
import enDrafts from "./messages/en/Drafts.json";
import enErrorManagement from "./messages/en/ErrorManagement.json";
import enErrors from "./messages/en/Errors.json";
import enErrorsCatalog from "./messages/en/ErrorsCatalog.json";
import enFeatureFlags from "./messages/en/FeatureFlags.json";
import enFiles from "./messages/en/Files.json";
import enFileViewer from "./messages/en/FileViewer.json";
import enForbidden from "./messages/en/Forbidden.json";
import enGuidebooks from "./messages/en/Guidebooks.json";
import enHelp from "./messages/en/Help.json";
import enRequests from "./messages/en/Requests.json";
import enWhoToAsk from "./messages/en/WhoToAsk.json";
import enPolicies from "./messages/en/Policies.json";
import enImprint from "./messages/en/imprint.json";
import enIntegrations from "./messages/en/Integrations.json";
import enInquiries from "./messages/en/Inquiries.json";
import enItTickets from "./messages/en/ItTickets.json";
import enNav from "./messages/en/Nav.json";
import enNotFound from "./messages/en/NotFound.json";
import enNotifications from "./messages/en/Notifications.json";
import enOnboarding from "./messages/en/Onboarding.json";
import enPlayground from "./messages/en/Playground.json";
import enPasswordReset from "./messages/en/PasswordReset.json";
import enPerformance from "./messages/en/Performance.json";
import enprivacy from "./messages/en/privacy.json";
import enProfile from "./messages/en/Profile.json";
import enRoles from "./messages/en/Roles.json";
import enRichText from "./messages/en/RichText.json";
import enSalesCoachEv from "./messages/en/SalesCoachEv.json";
import enSalesCockpit from "./messages/en/SalesCockpit.json";
import enSettings from "./messages/en/Settings.json";
import enStepUp from "./messages/en/StepUp.json";
import enSuggestions from "./messages/en/Suggestions.json";
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
    Design: enDesign,
    Calendar: enCalendar,
    Absences: enAbsences,
    Announcements: enAnnouncements,
    Approvals: enApprovals,
    RichText: enRichText,
    Chat: enChat,
    Directory: enDirectory,
    Drafts: enDrafts,
    Profile: enProfile,
    Tour: enTour,
    Onboarding: enOnboarding,
    Playground: enPlayground,
    PasswordReset: enPasswordReset,
    Admin: enAdmin,
    Teams: enTeams,
    CustomRoles: enCustomRoles,
    Guidebooks: enGuidebooks,
    Help: enHelp,
    Requests: enRequests,
    WhoToAsk: enWhoToAsk,
    Policies: enPolicies,
    Blog: enBlog,
    CaseSearch: enCaseSearch,
    Settings: enSettings,
    Roles: enRoles,
    Integrations: enIntegrations,
    Notifications: enNotifications,
    Command: enCommand,
    Performance: enPerformance,
    Errors: enErrors,
    ErrorManagement: enErrorManagement,
    Activity: enActivity,
    ActivityTrack: enActivityTrack,
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
    Suggestions: enSuggestions,
    ItTickets: enItTickets,
    Inquiries: enInquiries,
    SalesCockpit: enSalesCockpit,
    SalesCoachEv: enSalesCoachEv,
    StepUp: enStepUp,
    Ai: enAi,
    Compose: enCompose,
  },
  de: {
    App: deApp,
    Nav: deNav,
    Common: deCommon,
    Access: deAccess,
    Dashboard: deDashboard,
    Design: deDesign,
    Calendar: deCalendar,
    Absences: deAbsences,
    Announcements: deAnnouncements,
    Approvals: deApprovals,
    RichText: deRichText,
    Chat: deChat,
    Directory: deDirectory,
    Drafts: deDrafts,
    Profile: deProfile,
    Tour: deTour,
    Onboarding: deOnboarding,
    Playground: dePlayground,
    PasswordReset: dePasswordReset,
    Admin: deAdmin,
    Teams: deTeams,
    CustomRoles: deCustomRoles,
    Guidebooks: deGuidebooks,
    Help: deHelp,
    Requests: deRequests,
    WhoToAsk: deWhoToAsk,
    Policies: dePolicies,
    Blog: deBlog,
    CaseSearch: deCaseSearch,
    Settings: deSettings,
    Roles: deRoles,
    Integrations: deIntegrations,
    Notifications: deNotifications,
    Command: deCommand,
    Performance: dePerformance,
    Errors: deErrors,
    ErrorManagement: deErrorManagement,
    Activity: deActivity,
    ActivityTrack: deActivityTrack,
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
    Suggestions: deSuggestions,
    ItTickets: deItTickets,
    Inquiries: deInquiries,
    SalesCockpit: deSalesCockpit,
    SalesCoachEv: deSalesCoachEv,
    StepUp: deStepUp,
    Ai: deAi,
    Compose: deCompose,
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
