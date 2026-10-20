/**
 * Wiki-Eintrag „Listenpreise netto (Preiszonen)“ aus der Preisliste
 * (Vahan, 20.10.2026), angeheftet in
 * der Schnellleiste. Wiederholbar: ein vorhandener Eintrag bekommt den neuen
 * Inhalt und eine neue Version.
 *
 * Einmal im Convex-Dashboard ausführen:
 * `internal.migrations.addListPrices.run({ ownerEmail: "hovhannisyan@advantisgroup.de" })`.
 */
import { ConvexError, v } from "convex/values";

import { internalMutation } from "../functions";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const LIST_PRICES_SLUG = "listenpreise-netto";
const TITLE = "Listenpreise netto (Preiszonen)";
const CATEGORY = { name: "Vertrieb", color: "#2F7FA6" };

const HTML =
  '<p>Netto-Listenpreise je Preiszone (€/Liter), neuester Tag oben.</p><div data-callout="info"><p>Stand: 20.10.2026, 07:55 Uhr. Die Liste wird regelmäßig aktualisiert.</p></div><table><thead><tr><th>Datum</th><th>DEU Preiszone 1</th><th>DEU Preiszone 2</th><th>DEU Preiszone 3</th><th>Listpreis_ARAL nicht Autobahn</th><th>LP_AUT_1</th><th>LP_AUT_2</th><th>LP_AUT_3</th><th>Shell-Preiszone 1</th><th>Shell-Preiszone 2</th><th>Shell-Preiszone 3</th><th>Shell-Preiszone 4</th></tr></thead><tbody><tr><td><strong>20.10.2026</strong></td><td>1,888</td><td>1,890</td><td>1,882</td><td>2,017</td><td>1,789</td><td>1,796</td><td>1,807</td><td>2,009</td><td>2,001</td><td>2,005</td><td>2,001</td></tr><tr><td><strong>19.10.2026</strong></td><td>1,874</td><td>1,885</td><td>1,877</td><td>2,009</td><td>1,814</td><td>1,821</td><td>1,832</td><td>2,006</td><td>1,999</td><td>2,003</td><td>1,999</td></tr><tr><td><strong>18.10.2026</strong></td><td>1,874</td><td>1,885</td><td>1,877</td><td>2,009</td><td>1,814</td><td>1,821</td><td>1,832</td><td>2,006</td><td>1,999</td><td>2,003</td><td>1,999</td></tr><tr><td><strong>17.10.2026</strong></td><td>1,874</td><td>1,885</td><td>1,877</td><td>2,009</td><td>1,814</td><td>1,821</td><td>1,832</td><td>2,006</td><td>1,999</td><td>2,003</td><td>1,999</td></tr><tr><td><strong>16.10.2026</strong></td><td>1,881</td><td>1,888</td><td>1,888</td><td>2,017</td><td>1,829</td><td>1,836</td><td>1,847</td><td>2,011</td><td>2,004</td><td>2,008</td><td>2,003</td></tr><tr><td><strong>15.10.2026</strong></td><td>1,912</td><td>1,910</td><td>1,907</td><td>2,034</td><td>1,829</td><td>1,836</td><td>1,847</td><td>2,021</td><td>2,014</td><td>2,018</td><td>2,013</td></tr><tr><td><strong>14.10.2026</strong></td><td>1,866</td><td>1,865</td><td>1,864</td><td>2,009</td><td>1,802</td><td>1,809</td><td>1,820</td><td>2,001</td><td>1,994</td><td>1,997</td><td>1,993</td></tr><tr><td><strong>13.10.2026</strong></td><td>1,864</td><td>1,867</td><td>1,865</td><td>2,026</td><td>1,820</td><td>1,827</td><td>1,838</td><td>2,000</td><td>1,993</td><td>1,996</td><td>1,992</td></tr><tr><td><strong>12.10.2026</strong></td><td>1,887</td><td>1,897</td><td>1,897</td><td>2,034</td><td>1,834</td><td>1,841</td><td>1,852</td><td>2,009</td><td>2,002</td><td>2,006</td><td>2,001</td></tr><tr><td><strong>11.10.2026</strong></td><td>1,887</td><td>1,897</td><td>1,897</td><td>2,034</td><td>1,834</td><td>1,841</td><td>1,852</td><td>2,009</td><td>2,002</td><td>2,006</td><td>2,001</td></tr><tr><td><strong>10.10.2026</strong></td><td>1,887</td><td>1,897</td><td>1,897</td><td>2,034</td><td>1,834</td><td>1,841</td><td>1,852</td><td>2,009</td><td>2,002</td><td>2,006</td><td>2,001</td></tr><tr><td><strong>09.10.2026</strong></td><td>1,897</td><td>1,905</td><td>1,902</td><td>2,034</td><td>1,782</td><td>1,789</td><td>1,800</td><td>2,024</td><td>2,017</td><td>2,021</td><td>2,017</td></tr><tr><td><strong>08.10.2026</strong></td><td>1,858</td><td>1,855</td><td>1,860</td><td>2,009</td><td>1,712</td><td>1,719</td><td>1,730</td><td>1,996</td><td>1,989</td><td>1,993</td><td>1,989</td></tr><tr><td><strong>07.10.2026</strong></td><td>1,809</td><td>1,820</td><td>1,813</td><td>1,992</td><td>1,758</td><td>1,765</td><td>1,776</td><td>1,976</td><td>1,969</td><td>1,972</td><td>1,969</td></tr><tr><td><strong>06.10.2026</strong></td><td>1,847</td><td>1,863</td><td>1,848</td><td>2,017</td><td>1,739</td><td>1,746</td><td>1,757</td><td>2,000</td><td>1,993</td><td>1,997</td><td>1,992</td></tr><tr><td><strong>05.10.2026</strong></td><td>1,835</td><td>1,866</td><td>1,844</td><td>2,009</td><td>1,802</td><td>1,809</td><td>1,820</td><td>2,002</td><td>1,995</td><td>1,999</td><td>1,994</td></tr><tr><td><strong>04.10.2026</strong></td><td>1,835</td><td>1,866</td><td>1,844</td><td>2,009</td><td>1,802</td><td>1,809</td><td>1,820</td><td>2,002</td><td>1,995</td><td>1,999</td><td>1,994</td></tr><tr><td><strong>03.10.2026</strong></td><td>1,835</td><td>1,866</td><td>1,844</td><td>2,009</td><td>1,802</td><td>1,809</td><td>1,820</td><td>2,002</td><td>1,995</td><td>1,999</td><td>1,994</td></tr><tr><td><strong>02.10.2026</strong></td><td>1,877</td><td>1,904</td><td>1,877</td><td>2,017</td><td>1,856</td><td>1,863</td><td>1,874</td><td>2,032</td><td>2,025</td><td>2,029</td><td>2,025</td></tr><tr><td><strong>01.10.2026</strong></td><td>2,015</td><td>2,010</td><td>2,007</td><td>2,009</td><td>1,812</td><td>1,818</td><td>1,829</td><td>2,012</td><td>2,005</td><td>2,009</td><td>2,005</td></tr><tr><td><strong>30.09.2026</strong></td><td>1,977</td><td>1,980</td><td>1,977</td><td>2,152</td><td>1,846</td><td>1,853</td><td>1,864</td><td>2,146</td><td>2,139</td><td>2,143</td><td>2,139</td></tr><tr><td><strong>29.09.2026</strong></td><td>2,022</td><td>2,007</td><td>2,011</td><td>2,168</td><td>1,859</td><td>1,866</td><td>1,877</td><td>2,150</td><td>2,143</td><td>2,147</td><td>2,143</td></tr><tr><td><strong>28.09.2026</strong></td><td>2,005</td><td>1,997</td><td>1,997</td><td>2,152</td><td>1,910</td><td>1,916</td><td>1,927</td><td>2,138</td><td>2,131</td><td>2,135</td><td>2,130</td></tr><tr><td><strong>27.09.2026</strong></td><td>2,005</td><td>1,997</td><td>1,997</td><td>2,161</td><td>1,910</td><td>1,916</td><td>1,927</td><td>2,146</td><td>2,138</td><td>2,143</td><td>2,138</td></tr><tr><td><strong>26.09.2026</strong></td><td>2,005</td><td>1,997</td><td>1,997</td><td>2,161</td><td>1,910</td><td>1,916</td><td>1,927</td><td>2,146</td><td>2,138</td><td>2,143</td><td>2,138</td></tr><tr><td><strong>25.09.2026</strong></td><td>2,024</td><td>2,024</td><td>2,026</td><td>2,177</td><td>1,883</td><td>1,889</td><td>1,900</td><td>2,166</td><td>2,158</td><td>2,162</td><td>2,158</td></tr><tr><td><strong>24.09.2026</strong></td><td>2,036</td><td>2,033</td><td>2,046</td><td>2,194</td><td>1,837</td><td>1,844</td><td>1,855</td><td>2,170</td><td>2,162</td><td>2,166</td><td>2,162</td></tr><tr><td><strong>23.09.2026</strong></td><td>1,980</td><td>2,004</td><td>1,996</td><td>2,161</td><td>1,848</td><td>1,854</td><td>1,865</td><td>2,160</td><td>2,153</td><td>2,156</td><td>2,152</td></tr><tr><td><strong>22.09.2026</strong></td><td>2,014</td><td>2,029</td><td>2,018</td><td>2,177</td><td>1,914</td><td>1,920</td><td>1,931</td><td>2,168</td><td>2,161</td><td>2,165</td><td>2,160</td></tr><tr><td><strong>21.09.2026</strong></td><td>2,042</td><td>2,051</td><td>2,039</td><td>2,194</td><td>1,899</td><td>1,906</td><td>1,917</td><td>2,170</td><td>2,162</td><td>2,166</td><td>2,162</td></tr><tr><td><strong>20.09.2026</strong></td><td>2,042</td><td>2,051</td><td>2,039</td><td>2,194</td><td>1,899</td><td>1,906</td><td>1,917</td><td>2,170</td><td>2,162</td><td>2,166</td><td>2,162</td></tr><tr><td><strong>19.09.2026</strong></td><td>2,042</td><td>2,051</td><td>2,039</td><td>2,194</td><td>1,899</td><td>1,906</td><td>1,917</td><td>2,170</td><td>2,162</td><td>2,166</td><td>2,162</td></tr><tr><td><strong>18.09.2026</strong></td><td>2,057</td><td>2,074</td><td>2,060</td><td>2,186</td><td>1,930</td><td>1,936</td><td>1,947</td><td>2,180</td><td>2,173</td><td>2,177</td><td>2,172</td></tr><tr><td><strong>17.09.2026</strong></td><td>2,090</td><td>2,107</td><td>2,089</td><td>2,228</td><td>1,964</td><td>1,970</td><td>1,981</td><td>2,174</td><td>2,168</td><td>2,171</td><td>2,167</td></tr><tr><td><strong>16.09.2026</strong></td><td>2,055</td><td>2,066</td><td>2,056</td><td>2,186</td><td>1,888</td><td>1,895</td><td>1,906</td><td>2,167</td><td>2,160</td><td>2,163</td><td>2,159</td></tr><tr><td><strong>15.09.2026</strong></td><td>2,047</td><td>2,048</td><td>2,036</td><td>2,186</td><td>1,884</td><td>1,891</td><td>1,902</td><td>2,137</td><td>2,130</td><td>2,133</td><td>2,129</td></tr><tr><td><strong>14.09.2026</strong></td><td>2,008</td><td>2,021</td><td>2,016</td><td>2,135</td><td>1,882</td><td>1,889</td><td>1,900</td><td>2,120</td><td>2,113</td><td>2,117</td><td>2,112</td></tr><tr><td><strong>13.09.2026</strong></td><td>2,008</td><td>2,021</td><td>2,016</td><td>2,135</td><td>1,882</td><td>1,889</td><td>1,900</td><td>2,120</td><td>2,113</td><td>2,117</td><td>2,112</td></tr><tr><td><strong>12.09.2026</strong></td><td>2,008</td><td>2,021</td><td>2,016</td><td>2,135</td><td>1,882</td><td>1,889</td><td>1,900</td><td>2,120</td><td>2,113</td><td>2,117</td><td>2,112</td></tr><tr><td><strong>11.09.2026</strong></td><td>1,961</td><td>1,960</td><td>1,959</td><td>2,093</td><td>1,823</td><td>1,830</td><td>1,841</td><td>2,090</td><td>2,083</td><td>2,086</td><td>2,082</td></tr><tr><td><strong>10.09.2026</strong></td><td>1,961</td><td>1,950</td><td>1,963</td><td>2,110</td><td>1,809</td><td>1,815</td><td>1,826</td><td>2,085</td><td>2,078</td><td>2,082</td><td>2,077</td></tr><tr><td><strong>09.09.2026</strong></td><td>1,950</td><td>1,950</td><td>1,950</td><td>2,110</td><td>1,837</td><td>1,844</td><td>1,855</td><td>2,074</td><td>2,068</td><td>2,071</td><td>2,067</td></tr><tr><td><strong>08.09.2026</strong></td><td>1,942</td><td>1,937</td><td>1,937</td><td>2,102</td><td>1,797</td><td>1,804</td><td>1,815</td><td>2,061</td><td>2,054</td><td>2,058</td><td>2,053</td></tr><tr><td><strong>07.09.2026</strong></td><td>1,913</td><td>1,917</td><td>1,924</td><td>2,085</td><td>1,827</td><td>1,834</td><td>1,845</td><td>2,053</td><td>2,046</td><td>2,050</td><td>2,045</td></tr><tr><td><strong>06.09.2026</strong></td><td>1,913</td><td>1,917</td><td>1,924</td><td>2,085</td><td>1,827</td><td>1,834</td><td>1,845</td><td>2,053</td><td>2,046</td><td>2,050</td><td>2,045</td></tr><tr><td><strong>05.09.2026</strong></td><td>1,913</td><td>1,917</td><td>1,924</td><td>2,085</td><td>1,827</td><td>1,834</td><td>1,845</td><td>2,053</td><td>2,046</td><td>2,050</td><td>2,045</td></tr><tr><td><strong>04.09.2026</strong></td><td>1,934</td><td>1,925</td><td>1,935</td><td>2,093</td><td>1,820</td><td>1,827</td><td>1,838</td><td>2,055</td><td>2,048</td><td>2,052</td><td>2,047</td></tr><tr><td><strong>03.09.2026</strong></td><td>1,944</td><td>1,920</td><td>1,938</td><td>2,077</td><td>1,808</td><td>1,815</td><td>1,826</td><td>2,060</td><td>2,052</td><td>2,056</td><td>2,052</td></tr><tr><td><strong>02.09.2026</strong></td><td>1,902</td><td>1,893</td><td>1,897</td><td>2,035</td><td>1,706</td><td>1,712</td><td>1,723</td><td>2,028</td><td>2,020</td><td>2,024</td><td>2,020</td></tr><tr><td><strong>01.09.2026</strong></td><td>1,874</td><td>1,851</td><td>1,862</td><td>2,026</td><td>1,706</td><td>1,712</td><td>1,723</td><td>2,009</td><td>2,000</td><td>2,005</td><td>2,000</td></tr><tr><td><strong>31.08.2026</strong></td><td>1,828</td><td>1,819</td><td>1,835</td><td>2,001</td><td>1,679</td><td>1,685</td><td>1,696</td><td>1,978</td><td>1,970</td><td>1,974</td><td>1,970</td></tr><tr><td><strong>30.08.2026</strong></td><td>1,828</td><td>1,819</td><td>1,835</td><td>2,001</td><td>1,679</td><td>1,685</td><td>1,696</td><td>1,978</td><td>1,970</td><td>1,974</td><td>1,970</td></tr><tr><td><strong>29.08.2026</strong></td><td>1,828</td><td>1,819</td><td>1,835</td><td>2,001</td><td>1,679</td><td>1,685</td><td>1,696</td><td>1,978</td><td>1,970</td><td>1,974</td><td>1,970</td></tr><tr><td><strong>28.08.2026</strong></td><td>1,814</td><td>1,809</td><td>1,822</td><td>1,993</td><td>1,679</td><td>1,685</td><td>1,696</td><td>1,987</td><td>1,980</td><td>1,984</td><td>1,980</td></tr><tr><td><strong>27.08.2026</strong></td><td>1,823</td><td>1,821</td><td>1,828</td><td>1,993</td><td>1,679</td><td>1,685</td><td>1,696</td><td>2,013</td><td>2,005</td><td>2,009</td><td>2,005</td></tr><tr><td><strong>26.08.2026</strong></td><td>1,823</td><td>1,821</td><td>1,828</td><td>2,018</td><td>1,689</td><td>1,695</td><td>1,706</td><td>2,032</td><td>2,024</td><td>2,029</td><td>2,025</td></tr><tr><td><strong>25.08.2026</strong></td><td>1,846</td><td>1,840</td><td>1,849</td><td>2,043</td><td>1,738</td><td>1,744</td><td>1,755</td><td>2,044</td><td>2,037</td><td>2,041</td><td>2,037</td></tr><tr><td><strong>24.08.2026</strong></td><td>1,855</td><td>1,847</td><td>1,856</td><td>2,051</td><td>1,749</td><td>1,756</td><td>1,767</td><td>2,040</td><td>2,032</td><td>2,036</td><td>2,032</td></tr><tr><td><strong>23.08.2026</strong></td><td>1,855</td><td>1,847</td><td>1,856</td><td>2,051</td><td>1,749</td><td>1,756</td><td>1,767</td><td>2,040</td><td>2,032</td><td>2,036</td><td>2,032</td></tr><tr><td><strong>22.08.2026</strong></td><td>1,855</td><td>1,847</td><td>1,856</td><td>2,051</td><td>1,749</td><td>1,756</td><td>1,767</td><td>2,040</td><td>2,032</td><td>2,036</td><td>2,032</td></tr><tr><td><strong>21.08.2026</strong></td><td>1,854</td><td>1,846</td><td>1,847</td><td>2,051</td><td>1,749</td><td>1,756</td><td>1,767</td><td>2,038</td><td>2,030</td><td>2,034</td><td>2,030</td></tr><tr><td><strong>20.08.2026</strong></td><td>1,856</td><td>1,857</td><td>1,861</td><td>2,051</td><td>1,740</td><td>1,747</td><td>1,758</td><td>2,040</td><td>2,032</td><td>2,036</td><td>2,033</td></tr></tbody></table>';

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
      .withIndex("by_slug", (q) => q.eq("slug", LIST_PRICES_SLUG))
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
      slug: LIST_PRICES_SLUG,
      categoryId,
      thema: TITLE,
      erklaerung: HTML,
      tags: ["Preise", "Listenpreis", "Preiszone"],
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
