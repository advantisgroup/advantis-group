# Why the root `package.json` pins `@radix-ui/react-dialog`

The root `package.json` carries an `overrides` entry:

```json
"overrides": {
  "@radix-ui/react-dialog": "^1.1.23"
}
```

Removing it reintroduces a bug where the whole intranet stops responding to
clicks and taps until the page is reloaded.

## The failure

`vaul` (the bottom-sheet library behind `MobileDrawer`, `ResponsiveDialog`,
`ActionMenu`'s mobile branch, and every other mobile sheet) depends on
`@radix-ui/react-dialog@^1.1.1`. Without the override, bun resolved that to its
own nested copy under `node_modules/vaul/`, so the app shipped **two** copies of
`@radix-ui/react-dismissable-layer` — one used by vaul, one used by everything
built on the app's own Radix dependencies (`Dialog`, `DropdownMenu`, `Popover`,
`Select`).

`DismissableLayer` disables pointer events on the rest of the page while a modal
layer is open, and it remembers what to put back in a **module-level** variable:

```js
var originalBodyPointerEvents;
// on mount, when this instance has no other layers open:
originalBodyPointerEvents = document.body.style.pointerEvents; // ""
document.body.style.pointerEvents = "none";
// on unmount, when this instance's last layer goes away:
document.body.style.pointerEvents = originalBodyPointerEvents;
```

Two copies means two independent variables and two independent layer sets, so
each one reads a body that the *other* has already modified.

## The repro

Open the mobile navigation drawer, tap the account avatar in its footer, then
tap a menu item that navigates:

1. Drawer opens (vaul's copy). It sees no layers, records `""`, sets the body to
   `none`.
2. The account `DropdownMenu` opens (the app's copy). It also sees no layers of
   its own, so it records the body's *current* value — `"none"` — and sets
   `none` again.
3. The menu item calls `onNavigate`, which closes the drawer, so both unmount in
   the same commit. React tears deletions down parent-first, so vaul's layer
   cleans up first and correctly restores `""` …
4. … and then the dropdown's layer cleans up and writes back what it recorded:
   `pointer-events: none`, with nothing left to ever remove it.

Every click and tap on the page is swallowed from that point on.

The same shape applies anywhere an app-owned Radix layer opens inside a vaul
sheet — a `Select` or `Popover` in a `ResponsiveDialog` body, for instance —
which is why the lockup showed up intermittently rather than on a fixed route.

## The fix

`^1.1.23` satisfies vaul's `^1.1.1`, so pinning the range collapses both trees
onto the single hoisted copy. One module instance means one layer set: the
drawer's cleanup sees the dropdown still registered and leaves the body alone,
and the dropdown's cleanup — now the last one out — restores the real `""`.

Verify a change hasn't undone it:

```
find node_modules -type d -name react-dismissable-layer
```

It must print exactly one path. If a dependency bump makes the override
unsatisfiable, raise the pinned range to whatever the apps use rather than
dropping the entry.
