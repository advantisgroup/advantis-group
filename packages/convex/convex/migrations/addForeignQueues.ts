/**
 * Wiki-Eintrag „Auslands-Anfragen: Zuständigkeiten (UTA/Edenred)“ aus der
 * Liste UTA_Edenred_Queue_Overview.xlsx (Vahan, 19.10.2026), angeheftet in
 * der Schnellleiste. Wiederholbar: ein vorhandener Eintrag bekommt den neuen
 * Inhalt und eine neue Version.
 *
 * Einmal im Convex-Dashboard ausführen:
 * `internal.migrations.addForeignQueues.run({ ownerEmail: "hovhannisyan@advantisgroup.de" })`.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const FOREIGN_QUEUES_SLUG = "auslands-anfragen-zustaendigkeiten";
const TITLE = "Auslands-Anfragen: Zuständigkeiten (UTA/Edenred)";
const CATEGORY = { name: "Vertrieb", color: "#2F7FA6" };

const HTML =
  '<p>Anfragen von Unternehmen aus dem Ausland bearbeiten wir nicht selbst. Hier steht, an welche Queue bzw. welche Ansprechperson bei UTA/Edenred die Anfrage je Land geht.</p><div data-callout="info"><p>Die Liste wird monatlich aktualisiert. Stand: Oktober 2026. Fehlt ein Land oder stimmt etwas nicht, bitte bei Vahan melden.</p></div><table><thead><tr><th>Land</th><th>Queue</th><th>Ansprechperson</th><th>E-Mail</th></tr></thead><tbody><tr><td><strong>Austria</strong></td><td>Sales - Austria - Direct</td><td>Harald Rötzer</td><td><a href="mailto:harald.roetzer@uta.de">harald.roetzer@uta.de</a></td></tr><tr><td><strong>Belgium</strong></td><td>Sales - Netherlands - Direct</td><td>Saskia Stroink</td><td><a href="mailto:saskia.stroink@uta.com">saskia.stroink@uta.com</a></td></tr><tr><td><strong>Bosnia and Herzegovina</strong></td><td>–</td><td>Harald Rötzer<br>Rok Viher</td><td><a href="mailto:harald.roetzer@uta.de">harald.roetzer@uta.de</a><br><a href="mailto:rok.viher@uta.com">rok.viher@uta.com</a></td></tr><tr><td><strong>Bulgaria</strong></td><td>Sales - Bulgaria - Direct</td><td>Yolanta Gavrilova</td><td><a href="mailto:Yolanta.Gavrilova@uta.bg">Yolanta.Gavrilova@uta.bg</a></td></tr><tr><td><strong>Croatia</strong></td><td>–</td><td>Harald Rötzer</td><td><a href="mailto:harald.roetzer@uta.de">harald.roetzer@uta.de</a></td></tr><tr><td><strong>Czech Republic</strong></td><td>Sales - Czech Republic - Direct</td><td>Martin Masa</td><td><a href="mailto:martin.masa@uta.com">martin.masa@uta.com</a></td></tr><tr><td><strong>Denmark</strong></td><td>–</td><td>Jani Sauranen</td><td><a href="mailto:jani.sauranen@uta.de">jani.sauranen@uta.de</a></td></tr><tr><td><strong>Estonia</strong></td><td>Sales - Estonia - Direct</td><td>Katre Kalaus</td><td><a href="mailto:katre.kalaus@uta.com">katre.kalaus@uta.com</a></td></tr><tr><td><strong>Finland</strong></td><td>–</td><td>Jani Sauranen<br>Jonas Kaiser</td><td><a href="mailto:jani.sauranen@uta.de">jani.sauranen@uta.de</a><br><a href="mailto:jonas.kaiser@uta.com">jonas.kaiser@uta.com</a></td></tr><tr><td><strong>France</strong></td><td>Sales - France - Direct</td><td>Marc Torterotot<br>Christian Wittmer</td><td><a href="mailto:marc.torterotot@uta.com">marc.torterotot@uta.com</a><br><a href="mailto:christian.wittmer@edenred.com">christian.wittmer@edenred.com</a></td></tr><tr><td><strong>Germany</strong></td><td>Sales - Germany - Conectart</td><td>–</td><td>–</td></tr><tr><td><strong>–</strong></td><td>Sales - Germany - Direct</td><td>–</td><td>–</td></tr><tr><td><strong>–</strong></td><td>Sales - Germany - Direct - Offer&amp;Onboard</td><td>–</td><td>–</td></tr><tr><td><strong>–</strong></td><td>Sales - Germany - SELL2B</td><td>–</td><td>–</td></tr><tr><td><strong>Great Britain</strong></td><td>–</td><td>Saskia Stroink</td><td><a href="mailto:saskia.stroink@uta.com">saskia.stroink@uta.com</a></td></tr><tr><td><strong>Hungary</strong></td><td>Sales - Hungary - Direct</td><td>Kinga Rethy</td><td><a href="mailto:kinga.rethy@uta.com">kinga.rethy@uta.com</a></td></tr><tr><td><strong>Italy</strong></td><td>Sales - Italy - Direct</td><td>Federica Mazzi</td><td><a href="mailto:federica.mazzi@uta.com">federica.mazzi@uta.com</a></td></tr><tr><td><strong>Latvia</strong></td><td>Sales - Lithuania - Direct</td><td>Artis Pope</td><td><a href="mailto:artis.pope@uta.com">artis.pope@uta.com</a></td></tr><tr><td><strong>Lithuania</strong></td><td>Sales - Lithuania - Direct</td><td>–</td><td>–</td></tr><tr><td><strong>Luxembourg</strong></td><td>–</td><td>Saskia Stroink</td><td><a href="mailto:saskia.stroink@uta.com">saskia.stroink@uta.com</a></td></tr><tr><td><strong>Netherlands</strong></td><td>Sales - Netherlands - Direct</td><td>Saskia Stroink</td><td><a href="mailto:saskia.stroink@uta.com">saskia.stroink@uta.com</a></td></tr><tr><td><strong>North Macedonia</strong></td><td>–</td><td>Harald Rötzer</td><td><a href="mailto:harald.roetzer@uta.de">harald.roetzer@uta.de</a></td></tr><tr><td><strong>Poland</strong></td><td>Sales - Poland - Conectart</td><td>Iwona Myśliwiec</td><td><a href="mailto:iwona.mysliwiec@uta.com">iwona.mysliwiec@uta.com</a></td></tr><tr><td><strong>–</strong></td><td>Sales - Poland - Direct</td><td>Iwona Myśliwiec</td><td><a href="mailto:iwona.mysliwiec@uta.com">iwona.mysliwiec@uta.com</a></td></tr><tr><td><strong>Romania</strong></td><td>Sales - Romania - Direct</td><td>Dan Peltea</td><td><a href="mailto:dan.peltea@uta.com">dan.peltea@uta.com</a></td></tr><tr><td><strong>Slovakia</strong></td><td>Sales - Czech Republic - Direct</td><td>Martin Masa</td><td><a href="mailto:martin.masa@uta.com">martin.masa@uta.com</a></td></tr><tr><td><strong>Slovenia</strong></td><td>–</td><td>Rok Viher</td><td><a href="mailto:rok.viher@uta.com">rok.viher@uta.com</a></td></tr><tr><td><strong>Spain</strong></td><td>Sales - Spain - Direct</td><td>Sandra Ros</td><td><a href="mailto:sandra.ros@com">sandra.ros@com</a></td></tr><tr><td><strong>Sweden</strong></td><td>–</td><td>Jani Sauranen</td><td><a href="mailto:jani.sauranen@uta.de">jani.sauranen@uta.de</a></td></tr><tr><td><strong>Switzerland</strong></td><td>Sales - Switzerland - Direct</td><td>Christoph Meier</td><td><a href="mailto:christoph.meier@utatank.ch">christoph.meier@utatank.ch</a></td></tr><tr><td><strong>Ukraine</strong></td><td>Sales - Ukraine - Direct</td><td>Anna Ivaniusha</td><td><a href="mailto:anna.ivaniusha@uta.com">anna.ivaniusha@uta.com</a></td></tr><tr><td><strong>https://edenred.atlassian.net/wiki/spaces/SALFO/pages/13590499394/Other</strong></td><td>–</td><td>–</td><td>–</td></tr></tbody></table>';

export const run = internalMutation({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", ownerEmail.trim().toLowerCase()))
      .first();
    if (!owner || owner.status !== "active") {
      throw new ConvexError({ code: "bad_request", message: "Owner must be an active user" });
    }
    const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
    const now = Date.now();

    const existing = await ctx.db
      .query("wikiEntries")
      .withIndex("by_slug", (q) => q.eq("slug", FOREIGN_QUEUES_SLUG))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        erklaerung: HTML,
        version: existing.version + 1,
        validUntil: Math.max(existing.validUntil, now + YEAR_MS),
        pinned: true,
        updatedAt: now,
      });
      return { result: "updated" as const };
    }

    const categories = await ctx.db.query("wikiCategories").collect();
    let categoryId = categories.find((c) => c.name === CATEGORY.name)?._id;
    if (!categoryId) {
      categoryId = await ctx.db.insert("wikiCategories", {
        name: CATEGORY.name,
        color: CATEGORY.color,
        createdByUserId: owner._id,
        createdAt: now,
      });
    }
    await ctx.db.insert("wikiEntries", {
      slug: FOREIGN_QUEUES_SLUG,
      categoryId,
      thema: TITLE,
      erklaerung: HTML,
      tags: ["Ausland", "UTA", "Edenred", "Queue"],
      validFrom: now,
      validUntil: now + YEAR_MS,
      version: 1,
      pinned: true,
      authorUserId: owner._id,
      authorName: ownerName,
      ownerUserId: owner._id,
      createdAt: now,
      updatedAt: now,
    });
    return { result: "created" as const };
  },
});
