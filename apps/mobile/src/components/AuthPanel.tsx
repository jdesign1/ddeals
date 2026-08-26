"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * Email/password sign-in/sign-up form. Not a Stitch-designed screen (the
 * 12-screen inventory has no login mock), so there was never a design to
 * port — but it went out the door as genuinely plain, unstyled markup
 * (`rounded-lg border-stone-300` inputs, a flat `var(--color-brand-primary)`
 * pill button), visibly out of step with the rest of the app's now-current
 * "Dodgy Deal · Mobile UI Kit" look (font-display, `ink-*` focus rings,
 * black `bg-stone-900`/`hover:bg-ink-600` CTA pills) that Home, AppHeader,
 * the deal-assessment page, and the full-screen search overlay all already
 * use. Restyled 2026-08-09 (Jay: "improve designs") to match that, since
 * this is one of the few real remaining screens that hadn't been brought
 * in line with it yet.
 *
 * 2026-08-19, per Jay: "The login/sign up screen needs it's own dedicated
 * bottom sheet, and not live on the Lists page" -- this component used to
 * BE the entire page content on /lists, /me, /history, and /account
 * whenever `!user` (a full-page swap, not a real gate), and redirected to
 * `/` (Home) on any successful login, since that page swap meant there was
 * nothing else on the current route to show once signed in. Now rendered
 * exclusively inside `AuthSheet.tsx` (a global bottom sheet, mounted once
 * in `GlobalOverlays.tsx`, same pattern as `ScannerModal`), opened via each
 * gated page's own "Log in" button (`openAuthSheet(prompt)`,
 * `auth-context.tsx`) instead of replacing the page. `onSuccess` (called on
 * real sign-in, real sign-up when it returns an immediate session, and the
 * dev-only test account) closes the sheet instead of navigating away --
 * the calling page re-renders on its own the instant `user` goes non-null
 * (every gated page already reads `useAuth()`), showing its own real
 * content in place, so there's no page left to redirect away from. Sign-up
 * that returns `needsEmailConfirmation: true` does NOT call `onSuccess`
 * (there's no session yet); it stays on the "check your email" panel as
 * before. The outer wrapper also dropped its own card chrome (border/
 * shadow/rounded corners) here -- `AuthSheet` already supplies that as the
 * sheet's own container, so this component now renders flush inside it
 * (same as `ScannerModal`'s own content, which doesn't nest a second card
 * inside its sheet either) rather than a card-inside-a-card.
 *
 * Sign-up fields ported from the prototype's `LoginPage` (2026-08-14, per
 * Jay: "copy the create account flow from the prototype" -> clarified
 * "copy all the UI, we can wire it later to supabase" when asked, since
 * this app's own convention up to now had been "don't build fields with no
 * real backing store"). Name / Age Group / ZIP code are new, sign-up-only
 * fields added ABOVE Email/Password, matching `ddealsprototype/index.html`
 * (`LoginPage`, ~line 3892) field order exactly, plus a Confirm Password
 * field with the prototype's own "Passwords do not match" check
 * (`handleSubmit` below, checked before calling `signUp`). Deliberately
 * NOT ported:
 *   - The prototype's full-page header block (logo image, "Dodgy Deal"
 *     title, tagline) -- `AuthSheet`'s own header row (log-in icon + "Log
 *     in" title) already covers that, and every gated page still shows
 *     `AppHeader`'s own branding underneath the sheet.
 *   - The prototype's "Skip for now" link -- that existed for the
 *     prototype's own standalone onboarding flow (`onSkip`/`onBack`
 *     props); this app has no equivalent step to skip past, callers just
 *     don't call `openAuthSheet` at all once `user` exists.
 *   - The prototype's own input/label/button styling and its
 *     `localStorage` persistence of the raw form fields -- inputs/labels
 *     use this app's own already-established look instead (the plain
 *     `rounded-xl`/`ink-200`-ring inputs from the 2026-08-09 restyle
 *     above, and the uppercase `text-[11px] font-black tracking-widest
 *     text-stone-400` micro-label already used on `/account`), and the
 *     submit button stays `dd-btn dd-btn-primary` (Brand Guide v1.0,
 *     2026-08-13 UI tidy-up) rather than reverting to the prototype's own
 *     `bg-stone-900` pill -- this codebase's brand guide superseded every
 *     screen's own one-off button style, sign-up included.
 *
 * `name`/`dateOfBirth`/`zipCode` are sent to Supabase as `signUp`'s new
 * `metadata` param (`auth-context.tsx`) so real user input isn't silently
 * discarded, but nothing in this app reads them back yet -- see that
 * file's own doc comment for exactly what "wire it later to supabase"
 * still means as outstanding work (no `profiles` table/columns exist for
 * this data today).
 *
 * Age field switched from an age-BAND `<select>` (Under 18/18-24/.../65+,
 * matching the prototype and the docx design spec Jay shared -- "The Dodgy
 * Deal App_Documentation_Sign Up.docx", Age Group section, a dropdown of
 * 8 bands) to a real date-of-birth `<input type="date">` (2026-08-20, per
 * Jay: "update the Age group field to 'Select age' with a date picker" --
 * confirmed explicitly to override the docx spec's own age-band design
 * rather than restyle it: "ignore documentation's age bands, go with my
 * latest instruction"). `type="date"` (not a custom wheel/scroll widget)
 * -- opens the browser/OS's own native date picker on a real phone (iOS/
 * Android mobile Safari/Chrome both render a native wheel or calendar for
 * this input type), which is exactly the "date picker" UX asked for, with
 * no new dependency (no date-picker library exists in this app's
 * `package.json` today) and no custom a11y/keyboard work to get right --
 * same "use the real, plain input" preference this file's own top-of-file
 * doc comment already established for every other field. `min`/`max`
 * bound the native picker to a sane birth-year range (max: today minus 13
 * years, a reasonable minimum-age floor since this app has no real age-
 * gating policy documented anywhere to gate on instead; min: today minus
 * 120 years) -- both computed once via `useMemo` below (empty deps) rather
 * than a fresh `new Date()` inline in JSX on every render, purely so the
 * two date strings stay referentially/value-stable across re-renders
 * instead of potentially drifting by a day right at a render that happens
 * to straddle midnight.
 *
 * Metadata key sent to `signUp` renamed `age_group` -> `date_of_birth`
 * (real ISO `YYYY-MM-DD`, `<input type="date">`'s own native `.value`
 * format, not a band string like `"25-34"` any more) -- safe to rename
 * outright rather than keep the old key with new contents, since nothing
 * in this app reads either key back yet (this file's own doc comment,
 * above) and `auth-context.tsx`'s `metadata` param is a generic
 * `Record<string, string>` with no fixed shape to migrate.
 *
 * Password show/hide, pre-validated account buttons, and inline per-field
 * errors (2026-08-20, per Jay, 3 of the 4 docx-vs-app gaps
 * flagged the same session the docx above was first reviewed):
 *  - Eye/eye-off toggle added to every password-type input in this form
 *    (`Password` in both modes, plus sign-up's `Confirm Password`) --
 *    docx's own Sign Up spec ("Enter Password and Confirm Password ...
 *    with an Eye button on the right") and its Landing Page/Access Tile
 *    mocks (images 1-3) both show it on the Log In password field too, so
 *    it's not scoped to sign-up only. `showPassword`/`showConfirmPassword`
 *    just flip each input's own `type` between `password`/`text` -- no
 *    new dependency, `lucide-react`'s `Eye`/`EyeOff` were already a
 *    transitive import away (used elsewhere in this app already).
 *  - Both account buttons are now blocked while their local field values
 *    are invalid. Sign-up uses the full account-creation rules, while
 *    sign-in only checks for a valid email and a non-empty password, so an
 *    existing account with a password that predates sign-up's complexity
 *    rule can still sign in.
 *  - Inline per-field errors replace the docx's plain black label with a
 *    red, sentence-case message in the exact same slot (matching the
 *    mocks' own "Enter your name" / "Select your age group" / etc.
 *    replacing "Name" / "Age Group" / etc., not an extra line below it),
 *    plus a red input border -- `errorLabelClass`/`errorInputClass` below.
 *    Copy adapted from the docx's own error-state text where a field still
 *    exists 1:1 (Name, NZ Postal Code, Email, Password, Confirm Password);
 *    the Age Group field's docx copy ("Select your age group.") became
 *    "Select your date of birth." to match this session's earlier
 *    date-of-birth rework. Password's complexity RULE also changed to
 *    match the docx's own stated copy exactly ("at least 8 characters,
 *    including a letter and a number") -- was `minLength={6}` with no
 *    complexity check at all; native `minLength`/`pattern` attributes
 *    dropped from every field now that this file's own JS fully owns
 *    validation display, and the `<form>` picked up `noValidate` so the
 *    browser's own constraint-validation bubbles (mismatched styling,
 *    would fire before this file's submit handler even runs) never
 *    appear. Errors only show once a field has been blurred at least once
 *    (`touched`) OR after a submit attempt while field errors exist
 *    (`submitAttempted`) -- not on first render, matching ordinary form UX
 *    (nothing red before the user's interacted with anything) while still
 *    showing every relevant error together on a blocked submit attempt.
 *  - The tile-level message slot right above the submit button (already
 *    existed, unchanged position) now shows the docx's own generic
 *    connection-error copy ("We couldn't create your account. Check your
 *    connection and try again.") for any sign-up failure Supabase returns
 *    that ISN'T a duplicate-email response -- `mapSignUpError` below maps
 *    that one known, common case (Supabase's real
 *    "User already registered" family of messages) to a field-level error
 *    under Email instead ("An account already exists with this email.",
 *    exact docx copy), same as the docx's own split between a per-field
 *    duplicate-email error and a separate tile-level system/connection
 *    error. Sign-in's own error handling is unchanged (still shows
 *    Supabase's raw message near the button) -- the docx's error-state
 *    spec is documented under Sign Up specifically, and inventing an
 *    unspecified sign-in error UX wasn't part of this ask.
 *
 * `mode` lifted from local state to a controlled prop (2026-08-19, per
 * Jay: "Add top tabs Login / Create account - which tab between the two
 * states") -- `AuthSheet.tsx` now owns the actual Login/Create account tab
 * switcher (rendered above this component's own content, between the
 * sheet's header and the form) so its header title/icon can switch in step
 * with the selected tab too, not just this form's own fields/submit label.
 * The old bottom "New here? Create an account" / "Already have an account?
 * Log in" text-link toggle is gone -- the top tabs are the one way to
 * switch modes now, not a second parallel mechanism. Sign-up-only fields
 * (Name/Age Group/ZIP/Confirm Password) still reset on every mode change,
 * now via a `useEffect` keyed on the `mode` prop rather than inside a
 * local toggle handler, since the toggle itself no longer lives in this
 * component.
 *
 * Dev-only "test account" button removed entirely (2026-08-19, per Jay:
 * "remove the dev tool button and card" from this sheet) -- was gated on
 * `NODE_ENV === "development"` and never visible in production regardless,
 * but Jay's ask was to drop it from the sheet outright, not just confirm
 * it's already hidden in prod. `signInAsDevUser` itself stays in
 * `auth-context.tsx` (not asked to remove the underlying capability, just
 * this panel's own button/card for it) -- it's simply unused from this file
 * now.
 *
 * Sign-up-only fields (Name/Select age/NZ ZIP Code/Confirm Password) now
 * mounted in BOTH modes, not just sign-up (2026-08-20, per Jay: "Login tab
 * should have the same height as the create account tab" / "ensure both
 * tabs have the same bottom sheet height, to avoid the size change") --
 * these 4 field blocks used to be conditionally rendered (`mode ===
 * "signup" && (...)`), which was the entire reason sign-up's natural form
 * height ran taller than sign-in's. Each block is now always in the DOM,
 * toggled `invisible` (`visibility: hidden`, keeps its layout space --
 * `hidden`/`display: none` would collapse the space right back) and `inert`
 * (real HTML attribute; keeps sign-in from tabbing into, clicking, or
 * having a screen reader announce fields it doesn't use, in one attribute)
 * whenever `mode !== "signup"`. See each block's own comment, above its
 * `const` declaration in the function body below, for the full reasoning --
 * and `AuthSheet.tsx`'s own doc comment for what this changes at the sheet
 * level (the `layout="size"` height-animation-across-tabs from 2026-08-19
 * is superseded, since both tabs now share the same natural height with
 * nothing left to animate on an ordinary mode switch).
 *
 * Field order now flips per mode (2026-08-20, per Jay: "for the login tab
 * move email and password fields to the top below the log in statement
 * sentence") -- the 4 field blocks above (`extraFieldsBlock`,
 * `emailBlock`/`passwordBlock`, `confirmPasswordBlock`) got pulled out of
 * the JSX into local `const`s specifically so sign-in could render
 * Email/Password FIRST (right after the `prompt` paragraph) while sign-up
 * keeps its original order, without duplicating any field's own markup.
 * Reordering doesn't reopen the same-height fix directly above -- a flex
 * column's total height is the sum of its children regardless of order, so
 * both tabs still land on the same natural panel height either way. See
 * the comment directly above the `return`'s JSX for the actual per-mode
 * ordering.
 *
 * Three more changes 2026-08-20, same "login create account bottom sheet"
 * batch as the border removal in `AuthSheet.tsx` (see that file's own doc
 * comment):
 *
 *  - Text-field outline now matches `SearchBar.tsx`'s own pill (per Jay:
 *    "Update the login and create account text fields to have black
 *    outline like the search bar") -- `inputClass` traded its
 *    `focus:ring-2 focus:ring-ink-200` glow for the same treatment
 *    `SearchBar.tsx`'s form pill uses: a plain `border-stone-300` at rest,
 *    `shadow-sm`, and `focus:border-stone-900` (solid black-ish border,
 *    no ring) on focus, instead of a lighter ring baked around a
 *    stone-300 border that never changed color. `errorInputClass` still
 *    derives from `inputClass` via the same two-`.replace()` pattern, just
 *    swapping the new `focus:border-stone-900` token for
 *    `focus:border-alert-600` instead of the old ring token, so an
 *    in-error field still turns red (not black) when focused.
 *
 *  - Field labels switched to real sentence case (per Jay: "Update the
 *    titles above text fields to be sentence case") -- `labelClass` had
 *    `uppercase` in it, which was CSS-forcing every label to full caps
 *    regardless of how the string was actually cased in JSX (so editing
 *    the string alone would have done nothing visible); dropped
 *    `uppercase` and fixed the two labels that were relying on it to look
 *    right in caps -- "NZ ZIP Code" -> "NZ zip code" (keeping the real
 *    NZ/postal-code acronym capitalized, not force-lowercasing it too) and
 *    "Email Address" -> "Email address". "Name"/"Select age"/"Password"/
 *    "Confirm Password" -> "Confirm password" were already sentence-case
 *    strings under the hood, just invisibly so under the old `uppercase`
 *    class. `font-black`/`text-[11px]`/`tracking-widest` left as-is
 *    (narrower change than also matching `errorLabelClass`'s own
 *    non-uppercase size/weight -- Jay's ask was specifically about case,
 *    not a full label restyle).
 *
 *  - The `prompt`-driven sentence below `AuthSheet.tsx`'s tabs is now a
 *    fixed pair of strings keyed off `mode` instead of whatever the
 *    calling page passed as `prompt` (per Jay's two exact asks: sign-up
 *    -> "Create an account to save lists and spot more dodgy deals",
 *    sign-in -> "Login to Dodgy deals with your email and password"
 *    (corrected same day, see the "FLAGGED" paragraph below), both
 *    reproduced verbatim from what Jay typed). This was the more
 *    consistent reading of "update the sentence below tabs on Create
 *    account/Login" -- the previous `{prompt && <p>...}` showed whichever
 *    per-page string the caller passed to `openAuthSheet(prompt)`
 *    (`lists/page.tsx`: "Log in to create and save shopping lists.";
 *    `AddToListButton.tsx`: "Log in to save items to a list."; `/me`,
 *    `/history`, `/account`: their own page-local `prompt` consts; the
 *    account-menu's own `openAuthSheet()` call passes none at all), which
 *    doesn't change when the visitor taps between the Login/Create account
 *    tabs -- e.g. opening from AddToListButton and then tapping "Create
 *    account" used to leave "Log in to save items to a list." showing
 *    under the Create-account tab, which reads wrong for that tab. The
 *    `prompt` prop itself is left in place on both this component's own
 *    type and `AuthSheet`'s pass-through (not deleted, and every existing
 *    call site is untouched) in case Jay wants page-specific context back
 *    in some other slot later -- it's just no longer read into a local
 *    binding here, since nothing in this file displays it any more.
 *    FLAGGED, not silently fixed: Jay's Login sentence as first typed read
 *    "Login to Dodgy deals your email and password" -- implemented
 *    character-for-character as given (this codebase's standing
 *    convention for quoted copy), and flagged that it read as missing a
 *    "with". Corrected same day, per Jay: "Login to Dodgy deals with your
 *    email and password should be: \"Login to Dodgy deals with your email
 *    and password\"" -- `subtitle` below now reads "Login to Dodgy deals
 *    with your email and password". "Dodgy deals" (lowercase "deals")
 *    still doesn't match this app's own established brand capitalization
 *    "Dodgy Deal" used elsewhere (e.g. `AppHeader.tsx`'s "How Dodgy Deal
 *    works") -- left as Jay typed it both times, not silently corrected;
 *    still flagged here and in project.md in case that's also worth a
 *    follow-up.
 */

type SignupFieldKey = "name" | "dob" | "zip" | "email" | "password" | "confirmPassword";

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True once `v` has at least 8 characters, one letter, and one number --
 * the docx's own stated Password requirement (see this file's top-of-file
 * doc comment). Confirm Password just has to equal `password`, checked
 * separately in `computeSignupErrors` below -- it isn't re-validated
 * against this rule on its own. */
function isStrongPassword(v: string): boolean {
  return v.length >= 8 && /[a-zA-Z]/.test(v) && /[0-9]/.test(v);
}

/** Pure, synchronous validation for every sign-up-only-or-shared field --
 * used both to gate the Create-account button (`Object.keys(...).length
 * === 0`) and, per-field and touched-gated, to drive the inline red
 * label/border below. Returns `{}` outside sign-up mode: this app doesn't
 * pre-validate the Log In button, see this file's top-of-file doc comment
 * for why. */
function computeSignupErrors(
  mode: "signin" | "signup",
  fields: { name: string; dateOfBirth: string; zipCode: string; email: string; password: string; confirmPassword: string }
): Partial<Record<SignupFieldKey, string>> {
  if (mode !== "signup") return {};
  const errors: Partial<Record<SignupFieldKey, string>> = {};
  if (!fields.name.trim()) errors.name = "Enter your name.";
  if (!fields.dateOfBirth) errors.dob = "Select your date of birth.";
  if (!/^\d{4}$/.test(fields.zipCode)) errors.zip = "Enter a valid NZ postcode.";
  if (!fields.email.trim()) errors.email = "Enter a valid email address.";
  else if (!EMAIL_FORMAT_RE.test(fields.email.trim())) errors.email = "Enter a valid email address.";
  if (!fields.password) errors.password = "Enter a password.";
  else if (!isStrongPassword(fields.password))
    errors.password = "Password must contain at least 8 characters, including a letter and a number.";
  if (!fields.confirmPassword) errors.confirmPassword = "Confirm password.";
  else if (fields.confirmPassword !== fields.password) errors.confirmPassword = "Passwords don't match.";
  return errors;
}

/** Login uses the same touched-gated inline field treatment as sign-up, but
 * deliberately only checks the fields that can be validated locally. In
 * particular, it does not apply sign-up's password-complexity rule to an
 * existing account. */
function computeSigninErrors(email: string, password: string): Partial<Record<SignupFieldKey, string>> {
  const errors: Partial<Record<SignupFieldKey, string>> = {};
  if (!email.trim() || !EMAIL_FORMAT_RE.test(email.trim())) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

/** Maps a raw Supabase `signUp` error string to either a specific
 * field-level error (currently just the one real, common case this
 * project's auth actually returns -- an email already in use) or the
 * docx's own generic tile-level fallback copy for anything else
 * (network failures, unexpected GoTrue errors, ...). See this file's
 * top-of-file doc comment for why this is sign-up-only. */
function mapSignUpError(message: string): { field?: "email"; message: string } {
  if (/already\s+(registered|exists|been registered)/i.test(message)) {
    return { field: "email", message: "An account already exists with this email." };
  }
  return { message: "We couldn't create your account. Check your connection and try again." };
}

export default function AuthPanel({
  onSuccess,
  mode,
  onModeChange,
}: {
  /** No longer rendered by this component (see this file's top-of-file doc
   * comment, 2026-08-20 entry) -- the sentence below `AuthSheet.tsx`'s tabs
   * is now a fixed pair of mode-keyed strings instead. Left in the prop
   * type/call sites untouched in case a page-specific slot for this comes
   * back later. */
  prompt?: string;
  onSuccess: () => void;
  /** Controlled by `AuthSheet.tsx`'s own top Login/Create account tabs. */
  mode: "signin" | "signup";
  /** Same setter backing those tabs -- also used by the post-sign-up "Back
   * to sign in" link below, so switching off the "Check your email" panel
   * flips the tab back to Login too, not just this component's own local
   * view. */
  onModeChange: (mode: "signin" | "signup") => void;
}) {
  const { signIn, signUp } = useAuth();
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Which fields have been blurred at least once -- gates when a computed
  // error is actually shown (see the two compute-*Errors helpers below).
  // `submitAttempted` reveals every remaining error at once, same as
  // blurring through each field.
  const [touched, setTouched] = useState<Partial<Record<SignupFieldKey, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Set only from a real "email already in use" response from `signUp`
  // (`mapSignUpError`) -- distinct from `touched`/`submitAttempted`-gated
  // client-side validation since it's server-driven and can't be computed
  // from the current field values alone. Cleared as soon as the email
  // field changes again, so fixing the email doesn't leave a stale error.
  const [serverEmailError, setServerEmailError] = useState<string | null>(null);

  // Reset sign-up-only fields whenever the controlling tab changes --
  // ported from the old in-component toggle handler (see this file's own
  // top-of-file doc comment) now that `mode` is a prop set by AuthSheet's
  // tabs rather than a local toggle. Also clears `confirmationSent`/`error`
  // so switching tabs after a completed sign-up (or a failed attempt)
  // doesn't leave a stale panel showing.
  //
  // Adjusted during render (React's documented escape hatch for "state that
  // depends on a prop changing"), not a `useEffect` -- same pattern/same
  // reasoning as `AppHeader.tsx`'s own `lastPathname` menu-close logic (see
  // its own comment): an effect calling setState synchronously on every
  // `mode` change trips `react-hooks/set-state-in-effect`, which this
  // codebase otherwise keeps clean.
  const [lastMode, setLastMode] = useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    setError(null);
    setConfirmationSent(false);
    setName("");
    setDateOfBirth("");
    setZipCode("");
    setConfirmPassword("");
    setTouched({});
    setSubmitAttempted(false);
    setServerEmailError(null);
  }

  // `uppercase` dropped 2026-08-20 (see this file's top-of-file doc
  // comment) -- was CSS-forcing every label to caps regardless of the
  // string's own case; the labels below are now real sentence case.
  const labelClass = "block font-display text-[11px] font-black tracking-widest text-stone-500";
  // Black outline matching `SearchBar.tsx`'s own pill, 2026-08-20 (see this
  // file's top-of-file doc comment) -- `border-stone-300` at rest,
  // `shadow-sm`, `focus:border-stone-900` (solid border color change, no
  // ring) instead of the old `focus:ring-2 focus:ring-ink-200` glow.
  const inputClass =
    "rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition-colors placeholder:text-stone-500 focus:border-stone-900 focus:outline-none";
  // Red-state variants of the two classes above, swapped in per-field once
  // that field's error is actually visible (see `visibleErrors` below) --
  // matches the docx's own error mock: red border on the input, the label
  // itself replaced by a red sentence-case message rather than an extra
  // line (bold but NOT the uppercase/tracking-widest micro-label style
  // `labelClass` uses for a real label -- a full sentence in that style
  // would read as shouting).
  const errorLabelClass = "block font-display text-[12px] font-bold leading-4 text-alert-600";
  const errorInputClass = inputClass
    .replace("border-stone-300", "border-alert-600")
    .replace("focus:border-stone-900", "focus:border-alert-600");

  // Field validation -- pure/derived from current values, recomputed every
  // render (cheap, synchronous). `visibleErrors` is the touched-gated view
  // actually shown; the ungated map is what blocks submission. Sign-in uses
  // required/email-format checks only, while sign-up keeps its full set of
  // account-creation rules.
  const signupErrors = computeSignupErrors(mode, { name, dateOfBirth, zipCode, email, password, confirmPassword });
  const loginErrors = mode === "signin" ? computeSigninErrors(email, password) : {};
  const fieldErrors = mode === "signin" ? loginErrors : signupErrors;
  const hasBlockingFieldErrors = Object.keys(fieldErrors).length > 0;
  const visibleErrors: Partial<Record<SignupFieldKey, string>> = {};
  (Object.keys(fieldErrors) as SignupFieldKey[]).forEach((key) => {
    if (touched[key] || submitAttempted) visibleErrors[key] = fieldErrors[key];
  });
  // Server-driven duplicate-email error takes precedence over (and doesn't
  // require touching anything to reveal, unlike the client-side errors
  // above) whatever the live client-side email check currently says --
  // it's the direct, immediate result of the submit the user just made.
  if (serverEmailError) visibleErrors.email = serverEmailError;

  // Native date-input bounds -- see this file's own top-of-file doc comment
  // for why these are a real ISO `date` range (13-120 years old) rather
  // than an age-band list, and why they're memoized once instead of a
  // fresh `new Date()` on every render.
  const { dobMin, dobMax } = useMemo(() => {
    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    const max = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
    const min = new Date(now.getFullYear() - 120, now.getMonth(), now.getDate());
    return { dobMin: toIso(min), dobMax: toIso(max) };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (hasBlockingFieldErrors) {
      // Real pre-validation now (see this file's top-of-file doc comment)
      // supersedes the old, single "passwords match" check this block used
      // to do just before calling `signUp` -- `signupErrors` already covers
      // that case (`confirmPassword`) alongside every other sign-up field,
      // or the login email/password checks, computed fresh from current
      // values just above. A blocked attempt reveals every remaining error
      // at once (`submitAttempted`), without waiting for the user to blur
      // through each field individually.
      setSubmitAttempted(true);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        else onSuccess();
      } else {
        setServerEmailError(null);
        const { error, needsEmailConfirmation } = await signUp(email, password, {
          full_name: name,
          date_of_birth: dateOfBirth,
          zip_code: zipCode,
        });
        if (error) {
          const mapped = mapSignUpError(error);
          if (mapped.field === "email") setServerEmailError(mapped.message);
          else setError(mapped.message);
        } else if (needsEmailConfirmation) setConfirmationSent(true);
        // No email-confirmation step configured on this project -- signUp
        // returned a real session immediately, same as signIn.
        else onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-ink-50 p-5">
        <p className="font-display text-sm font-black tracking-normal text-stone-900">Check your email</p>
        <p className="text-sm text-stone-600">
          We sent a confirmation link to <span className="font-semibold text-stone-800">{email}</span>. Confirm it,
          then sign in below.
        </p>
        <button
          onClick={() => {
            setConfirmationSent(false);
            onModeChange("signin");
          }}
          className="mt-1 w-fit cursor-pointer text-[13px] leading-4 font-black tracking-widest text-ink-600 transition-colors hover:text-ink-800 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // Field blocks below are pulled out into local consts, not inlined
  // straight into the `return` JSX, so they can be reordered per `mode`
  // (2026-08-20, per Jay: "for the login tab move email and password
  // fields to the top below the log in statement sentence") without
  // duplicating each block's own markup twice. Reordering these doesn't
  // change the FORM's total height either way -- a flex column's height is
  // the sum of its children's heights regardless of what order they're in
  // -- so this sits on top of the same-height fix just above (both tabs
  // still land on the same natural panel height, `AuthSheet.tsx`'s doc
  // comment) rather than undoing it.

  // Mounted in BOTH modes, not just sign-up (2026-08-20, per Jay: "Login
  // tab should have the same height as the create account tab" / "ensure
  // both tabs have the same bottom sheet height, to avoid the size
  // change") -- this block (Name/Select age/NZ ZIP Code) used to be
  // `{mode === "signup" && (...)}`, unmounted entirely in sign-in. That's
  // exactly what made sign-up's natural form height taller than sign-in's:
  // sign-in contributed zero DOM nodes here, sign-up contributed 3 full
  // field blocks, so `AuthSheet.tsx`'s panel (sized off this content,
  // `min-h-[45vh]`/`max-h-[92dvh]`, no fixed height) was genuinely a
  // different height per tab. Kept mounted always now, still occupying its
  // normal-flow height in sign-in, and made invisible with `invisible`
  // (`visibility: hidden`) rather than unmounted or `hidden` (`display:
  // none`, which collapses right back to the zero height this is fixing)
  // -- plus `inert` (real HTML attribute, React 19 passes it straight
  // through) so sign-in can't tab into, click, or have a screen reader
  // announce fields it isn't using; `inert` covers both the ARIA/focus and
  // the pointer-events side in one attribute, so no per-field
  // `tabIndex={-1}`/`aria-hidden` needed on top of it.
  const extraFieldsBlock = (
    <div className={`flex flex-col gap-3 ${mode === "signup" ? "" : "invisible"}`} inert={mode !== "signup"}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="authpanel-name" className={visibleErrors.name ? errorLabelClass : labelClass}>
          {visibleErrors.name || "Name"}
        </label>
        <input
          id="authpanel-name"
          type="text"
          required
          placeholder="John Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          aria-invalid={!!visibleErrors.name}
          className={visibleErrors.name ? errorInputClass : inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="authpanel-dob" className={visibleErrors.dob ? errorLabelClass : labelClass}>
          {visibleErrors.dob || "Select age"}
        </label>
        {/* Real date-of-birth picker, not an age-band dropdown -- see this
            file's own top-of-file doc comment for the full reasoning
            (2026-08-20, per Jay, deliberately overriding the docx design
            spec's own age-band `<select>`). A bare `type="date"` input
            with no visible placeholder text of its own (native date
            inputs render their own locale placeholder, e.g. "dd/mm/yyyy",
            not a custom one) -- tapping it opens the phone's native date
            picker. */}
        <input
          id="authpanel-dob"
          type="date"
          required
          min={dobMin}
          max={dobMax}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, dob: true }))}
          aria-invalid={!!visibleErrors.dob}
          className={visibleErrors.dob ? errorInputClass : inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="authpanel-zip" className={visibleErrors.zip ? errorLabelClass : labelClass}>
          {visibleErrors.zip || "NZ zip code"}
        </label>
        <input
          id="authpanel-zip"
          type="text"
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="e.g. 6011"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value.replace(/\D/g, ""))}
          onBlur={() => setTouched((t) => ({ ...t, zip: true }))}
          aria-invalid={!!visibleErrors.zip}
          className={visibleErrors.zip ? errorInputClass : inputClass}
        />
      </div>
    </div>
  );

  // Sign-in's own top fields now (2026-08-20, see this block's own
  // top-of-`return` comment above) -- rendered right after the prompt
  // sentence in sign-in mode, still in their original position (after
  // `extraFieldsBlock`) in sign-up mode. No `invisible`/`inert` on these
  // two -- unlike the other 2 blocks, Email/Password are used in BOTH
  // modes, just moved.
  const emailBlock = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="authpanel-email" className={visibleErrors.email ? errorLabelClass : labelClass}>
        {visibleErrors.email || "Email address"}
      </label>
      <input
        id="authpanel-email"
        type="email"
        required
        placeholder="name@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          // Fixing the email after a duplicate-email response clears
          // that server-driven error immediately -- otherwise it'd sit
          // stale until the next submit attempt re-derives it.
          if (serverEmailError) setServerEmailError(null);
        }}
        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        aria-invalid={!!visibleErrors.email}
        className={visibleErrors.email ? errorInputClass : inputClass}
      />
    </div>
  );

  const passwordBlock = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="authpanel-password" className={visibleErrors.password ? errorLabelClass : labelClass}>
        {visibleErrors.password || "Password"}
      </label>
      {/* Eye/eye-off toggle (2026-08-20, per Jay -- see this file's
          top-of-file doc comment) -- `pr-11` clears room for the
          absolutely-positioned button so typed text never runs under
          it. */}
      <div className="relative">
        <input
          id="authpanel-password"
          type={showPassword ? "text" : "password"}
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          aria-invalid={!!visibleErrors.password}
          className={`${visibleErrors.password ? errorInputClass : inputClass} w-full pr-11`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((s) => !s)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-stone-400 transition-colors hover:text-stone-600"
        >
          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  const authIllustration = (
    <div className="flex w-full justify-center py-1">
      <Image
        src="/auth-wave.png"
        alt="Dodgy Deal mascot waving"
        width={1165}
        height={1350}
        sizes="160px"
        preload
        className="mx-auto h-auto w-full max-w-[10rem]"
      />
    </div>
  );

  // Same always-mounted-but-`invisible`/`inert` treatment as
  // `extraFieldsBlock` above, same reason (2026-08-20, per Jay -- see that
  // block's own comment for the full explanation).
  const confirmPasswordBlock = (
    <div className={`flex flex-col gap-1.5 ${mode === "signup" ? "" : "invisible"}`} inert={mode !== "signup"}>
      <label
        htmlFor="authpanel-confirm-password"
        className={visibleErrors.confirmPassword ? errorLabelClass : labelClass}
      >
        {visibleErrors.confirmPassword || "Confirm password"}
      </label>
      <div className="relative">
        <input
          id="authpanel-confirm-password"
          type={showConfirmPassword ? "text" : "password"}
          required
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
          aria-invalid={!!visibleErrors.confirmPassword}
          className={`${visibleErrors.confirmPassword ? errorInputClass : inputClass} w-full pr-11`}
        />
        <button
          type="button"
          onClick={() => setShowConfirmPassword((s) => !s)}
          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-stone-400 transition-colors hover:text-stone-600"
        >
          {showConfirmPassword ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );

  // Fixed per-mode subtitle, 2026-08-20 (see this file's top-of-file doc
  // comment) -- replaces the old `prompt`-driven sentence, verbatim per
  // Jay's own two asks.
  const subtitle =
    mode === "signup"
      ? "Create an account to save lists and spot more dodgy deals"
      : "Login to Dodgy deals with your email and password";

  return (
    <div className="flex flex-col gap-4">
      {authIllustration}
      <p className="text-sm font-medium text-stone-600">{subtitle}</p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        {/* Field order flips per mode (2026-08-20, per Jay: "for the login
            tab move email and password fields to the top below the log in
            statement sentence") -- sign-up keeps the original top-to-bottom
            order (Name/Select age/NZ ZIP Code, Email, Password, Confirm
            Password); sign-in surfaces Email/Password FIRST (right after
            the prompt paragraph above, when there is one), with the other
            2 blocks -- invisible/inert in sign-in either way, see their
            own comments above -- following after rather than before. Same
            4 blocks in both branches, just reordered, so the form's total
            height (sum of its children, order-independent) is unaffected
            -- this doesn't reopen the same-height-across-tabs fix above. */}
        {mode === "signup" ? (
          <>
            {extraFieldsBlock}
            {emailBlock}
            {passwordBlock}
            {confirmPasswordBlock}
          </>
        ) : (
          <>
            {emailBlock}
            {passwordBlock}
            {extraFieldsBlock}
            {confirmPasswordBlock}
          </>
        )}
        {/* Tile-level error -- system/connection failures for sign-up
            (`mapSignUpError`'s generic fallback), or sign-in's own
            unchanged raw-message display. Kept as a plain paragraph, not
            folded into any one field, matching the docx's own "at tile
            level, near the Create Account Button, rather than under an
            individual field" spec. */}
        {error && (
          <p className="text-[13px] leading-4 font-medium" style={{ color: "var(--color-brand-error)" }}>
            {error}
          </p>
        )}
        {/* Brand Guide v1.0 "06 — UI KIT / BUTTONS" primary pill
            (2026-08-13 UI tidy-up) -- was `rounded-xl` + uppercase
            tracking-widest text-[13px] leading-4, out of step with the guide's full pill
            radius + normal-case Inter bold 16px. Full-width per the guide's
            own "09 — MOBILE / One primary action" rule ("exactly one
            full-width ink button at the bottom"). Kept here rather than
            reverting to the prototype's own `bg-stone-900` button style
            when the rest of this form was ported from it 2026-08-14 -- see
            this file's top-of-file doc comment.
            `disabled` covers field validation errors in both modes --
            `dd-btn-primary`'s own `:disabled` styling (Brand Guide v1.0,
            `globals.css`: `.dd-btn:disabled { opacity: 0.5; }`) already
            dims the button to 50% opacity, so this reuses that existing
            look for invalid fields. */}
        <button
          type="submit"
          disabled={submitting || hasBlockingFieldErrors}
          className="dd-btn dd-btn-primary w-full cursor-pointer"
        >
          {submitting ? "Please wait…" : mode === "signin" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
