/**
 * The team, in the order the team page lists them. `role` is a key in the
 * `team` messages namespace. The founder comes first; the team page gives
 * her a block of her own.
 */
export const TEAM: readonly { name: string; role: string; initials: string; photo?: string }[] = [
  { name: "Andrea Reichl", role: "founder.role", initials: "AR" },
  { name: "Andrea Lautenbacher", role: "roles.inbound", initials: "AL" },
  {
    name: "Jessica Blume",
    role: "roles.outbound",
    initials: "JB",
    photo: "/team/jessica-blume.png",
  },
  { name: "Morena Azzuro", role: "roles.hr", initials: "MA" },
  {
    name: "Adam Kämpfer",
    role: "roles.marketing",
    initials: "AK",
    photo: "/team/adam-kaempfer.png",
  },
  {
    name: "Sabine Sagasser",
    role: "roles.coach",
    initials: "SS",
    photo: "/team/sabine-sagasser.png",
  },
  {
    name: "Martin Bergmüller",
    role: "roles.quality",
    initials: "MB",
    photo: "/team/martin-bergmueller.png",
  },
];
