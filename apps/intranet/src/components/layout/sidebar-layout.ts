export interface SidebarSectionDef {
  id: string;
  labelKey?: string;
  items: string[];
}

export interface SavedSidebarSection {
  id: string;
  title?: string;
  items: string[];
}

export interface SidebarSection extends SavedSidebarSection {
  labelKey?: string;
}

/**
 * Lays the person's saved sections over the default ones. Items they can't
 * see anymore drop out, and anything new (a feature they just got access to)
 * lands in its default section — or the last one, if they deleted that.
 */
export function resolveSidebarSections(
  saved: SavedSidebarSection[] | undefined,
  defaults: SidebarSectionDef[],
): SidebarSection[] {
  if (!saved || saved.length === 0) return defaults.map((s) => ({ ...s, items: [...s.items] }));

  const available = new Set(defaults.flatMap((s) => s.items));
  const seen = new Set<string>();
  const sections: SidebarSection[] = saved.map((s) => {
    const items: string[] = [];
    for (const href of s.items) {
      if (available.has(href) && !seen.has(href)) {
        seen.add(href);
        items.push(href);
      }
    }
    return {
      id: s.id,
      title: s.title,
      labelKey: defaults.find((d) => d.id === s.id)?.labelKey,
      items,
    };
  });

  for (const def of defaults) {
    for (const href of def.items) {
      if (seen.has(href)) continue;
      const target = sections.find((s) => s.id === def.id) ?? sections[sections.length - 1];
      target.items.push(href);
    }
  }
  return sections;
}

export function toSavedSections(sections: SidebarSection[]): SavedSidebarSection[] {
  return sections.map(({ id, title, items }) => (title ? { id, title, items } : { id, items }));
}

export function moveSidebarItem(
  sections: SidebarSection[],
  href: string,
  toSection: string,
  toIndex: number,
): SidebarSection[] {
  const stripped = sections.map((s) => ({ ...s, items: s.items.filter((i) => i !== href) }));
  return stripped.map((s) => {
    if (s.id !== toSection) return s;
    const items = [...s.items];
    items.splice(Math.min(toIndex, items.length), 0, href);
    return { ...s, items };
  });
}

export function moveSidebarSection(
  sections: SidebarSection[],
  id: string,
  toIndex: number,
): SidebarSection[] {
  const moving = sections.find((s) => s.id === id);
  if (!moving) return sections;
  const rest = sections.filter((s) => s.id !== id);
  rest.splice(Math.min(toIndex, rest.length), 0, moving);
  return rest;
}

/** Deleting a section keeps its items — they join the section above it. */
export function removeSidebarSection(sections: SidebarSection[], id: string): SidebarSection[] {
  const index = sections.findIndex((s) => s.id === id);
  if (index === -1 || sections.length < 2) return sections;
  const heirIndex = index === 0 ? 1 : index - 1;
  const orphans = sections[index].items;
  return sections
    .map((s, i) => (i === heirIndex ? { ...s, items: [...s.items, ...orphans] } : s))
    .filter((s) => s.id !== id);
}
