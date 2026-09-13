/**
 * The refreshed design is the only design. `<html data-design="refreshed">` is
 * stamped in the root layout, so the `refreshed:` CSS variant always applies.
 *
 * Kept as a hook rather than inlined away: a handful of components still read
 * it, and returning a constant keeps them correct while their `refreshed:`
 * classes are folded into plain ones over time.
 */
export function useDesignPreview(): "refreshed" {
  return "refreshed";
}
