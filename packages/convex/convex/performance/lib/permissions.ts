/**
 * Fixed permission keys for the Performance module's multi-tenant RBAC.
 * Each key corresponds to a real gate check somewhere in `performanceAuth.ts`
 * /`performanceQueries.ts`/`performanceImport.ts` etc. — this list only
 * grows when a genuinely new capability is added to the product.
 *
 * The customizable part is not this list but `companyRoles.permissions`
 * (schema.ts): named bundles of these keys, scoped per company, editable
 * through the roles admin UI with no code change. This deliberately does
 * NOT mirror the intranet's `customRoles`/`capabilityValidator` shape
 * (`schema.ts`'s `capabilityValidator`, additive-only on top of a fixed
 * admin/manager/employee tier) — that model can't express narrowing a
 * built-in role below its default, which per-company customization here
 * explicitly needs to support (e.g. narrowing a company's "Team Lead" role
 * below its Admin-equivalent default).
 */
export const PERMISSIONS = [
  "view_own_dashboard",
  "view_all_employees",
  "upload_reports",
  "manage_roster",
  "manage_logins",
  "manage_roles",
  "export_data",
  "view_flagged_rows",
  "resolve_flagged_rows",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** The built-in role bundles seeded for every newly-provisioned company
 * (see `companies.ts`'s `upsertProvisioningRow`). Rows created from these
 * stay editable (`isBuiltIn: true` just blocks deletion, not edits) — a
 * company can narrow "Team Lead" below Admin at any time with no code
 * change. */
export const BUILT_IN_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Admin", permissions: [...PERMISSIONS] },
  // Matches Admin by default; narrowing this is the first thing most
  // companies will want to customize, hence it being a separate row instead
  // of a hardcoded alias.
  { name: "Team Lead", permissions: [...PERMISSIONS] },
  { name: "Mitarbeiter", permissions: ["view_own_dashboard"] },
];
