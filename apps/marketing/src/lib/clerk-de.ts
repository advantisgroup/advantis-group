import { deDE } from "@clerk/localizations";

/**
 * Clerk's German is formal ("Sie"); the site talks to people as "du". These
 * are the screens people actually see — sign-in, sign-up, profile, email,
 * password, delete — re-worded so one page doesn't switch register halfway
 * down. Everything not listed falls back to Clerk's own wording.
 */
const du = {
  signIn: {
    start: {
      subtitleCombined: "Willkommen zurück! Melde dich an, um fortzufahren",
    },
    password: {
      title: "Gib dein Passwort ein",
      actionLink: "Andere Methode verwenden",
    },
    emailCode: { title: "Schau in dein Postfach" },
    emailCodeMfa: { title: "Schau in dein Postfach", formTitle: "Schau in dein Postfach" },
    emailLink: {
      title: "Schau in dein Postfach",
      formSubtitle: "Nutze den Bestätigungslink, den wir dir geschickt haben",
      loading: { subtitle: "Du wirst gleich weitergeleitet" },
      verified: { subtitle: "Du wirst gleich weitergeleitet" },
      unusedTab: { title: "Du kannst diesen Tab schließen" },
      expired: { subtitle: "Geh zurück zum ursprünglichen Tab, um fortzufahren." },
      failed: { subtitle: "Geh zurück zum ursprünglichen Tab, um fortzufahren." },
      verifiedSwitchTab: {
        subtitle: "Geh zurück zum ursprünglichen Tab, um fortzufahren",
        subtitleNewTab: "Geh zum neu geöffneten Tab, um fortzufahren",
      },
    },
    forgotPassword: {
      subtitle_email: "Gib zuerst den Code ein, den wir dir per E-Mail geschickt haben",
      subtitle_phone: "Gib zuerst den Code ein, den wir an dein Handy geschickt haben",
      resendButton: "Keinen Code bekommen? Erneut senden",
    },
    forgotPasswordAlternativeMethods: {
      label__alternativeMethods: "Oder melde dich anders an",
    },
    resetPassword: {
      successMessage: "Dein Passwort wurde geändert. Einen Moment, wir melden dich an.",
      requiredMessage:
        "Es gibt bereits ein Konto mit einer unbestätigten E-Mail-Adresse. Bitte setz zur Sicherheit dein Passwort zurück.",
    },
    resetPasswordMfa: {
      detailsLabel: "Bevor wir dein Passwort zurücksetzen, müssen wir prüfen, dass du es bist.",
    },
  },
  signUp: {
    start: {
      title: "Erstelle dein Konto",
      titleCombined: "Erstelle dein Konto",
      actionText: "Du hast schon ein Konto?",
    },
    continue: { title: "Fehlende Angaben ergänzen", actionText: "Du hast schon ein Konto?" },
    emailCode: {
      title: "Bestätige deine E-Mail-Adresse",
      formSubtitle: "Gib den Code ein, den wir an deine E-Mail-Adresse geschickt haben",
    },
    emailLink: {
      title: "Bestätige deine E-Mail-Adresse",
      formSubtitle: "Nutze den Bestätigungslink, den wir an deine E-Mail-Adresse geschickt haben",
      verifiedSwitchTab: {
        subtitle: "Geh zum neu geöffneten Tab, um fortzufahren",
        subtitleNewTab: "Geh zurück zum vorherigen Tab, um fortzufahren",
      },
    },
  },
  userProfile: {
    navbar: { description: "Verwalte deine Kontoangaben." },
    start: {
      emailAddressesSection: { primaryButton: "E-Mail-Adresse hinzufügen" },
      phoneNumbersSection: { primaryButton: "Telefonnummer hinzufügen" },
      mfaSection: { primaryButton: "Zwei-Faktor-Authentifizierung aktivieren" },
    },
    profilePage: {
      successMessage: "Dein Profil wurde aktualisiert.",
      fileDropAreaHint: "Lade ein JPG-, PNG-, GIF- oder WEBP-Bild unter 10 MB hoch",
    },
    emailAddressPage: {
      formHint: "Du musst diese E-Mail-Adresse bestätigen, bevor sie zu deinem Konto hinzukommt.",
      emailCode: {
        formSubtitle: "Gib den Bestätigungscode ein, den wir an {{identifier}} schicken",
        successMessage: "{{identifier}} wurde zu deinem Konto hinzugefügt.",
      },
      emailLink: {
        formSubtitle: "Klick auf den Bestätigungslink in der E-Mail an {{identifier}}",
        successMessage: "{{identifier}} wurde zu deinem Konto hinzugefügt.",
      },
      removeResource: {
        messageLine2: "Du kannst dich dann nicht mehr mit dieser E-Mail-Adresse anmelden.",
        successMessage: "{{emailAddress}} wurde aus deinem Konto entfernt.",
      },
    },
    passwordPage: {
      successMessage__set: "Dein Passwort wurde festgelegt.",
      checkboxInfoText__signOutOfOtherSessions:
        "Am besten meldest du dich auf allen anderen Geräten ab, die dein altes Passwort benutzt haben könnten.",
    },
    mfaPage: {
      title: "Zwei-Faktor-Authentifizierung aktivieren",
      formHint: "Wähl eine Methode aus.",
    },
    deletePage: {
      actionDescription: 'Gib "Konto löschen" ein, um fortzufahren.',
      messageLine1: "Möchtest du dein Konto wirklich löschen?",
    },
  },
};

type Tree = { [key: string]: unknown };

const merge = (base: Tree, override: Tree): Tree =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(override)])].map((key) => {
      const a = base[key];
      const b = override[key];
      return [
        key,
        b && typeof b === "object" && a && typeof a === "object"
          ? merge(a as Tree, b as Tree)
          : (b ?? a),
      ];
    }),
  );

export const deDU = merge(deDE as unknown as Tree, du) as typeof deDE;
