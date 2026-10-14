const signupRoles = [
  ["parent_guardian", "Parent / Guardian"],
  ["clinician", "Clinician"],
  ["adult_client", "Adult Client — clinician invitation"],
  ["teen_client_with_permission", "Teen Client with Parent / Guardian Permission — adult or clinician invitation"],
];

export default function SignupAuthorityFields({
  role,
  ageGroup,
  setAgeGroup,
  adultConfirmed,
  setAdultConfirmed,
  parentConfirmed,
  setParentConfirmed,
}) {
  const isParent = role === "parent_guardian";

  return (
    <section aria-label="Account holder age and authority" className="grid gap-3 rounded-xl border border-border p-4">
      <div>
        <label htmlFor="signup-account-holder-type" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Who is creating this account?
        </label>
        <select
          id="signup-account-holder-type"
          className="mt-2 w-full min-w-0 max-w-full min-h-[44px] rounded-xl border border-input bg-background px-3 text-sm"
          value={role}
          aria-describedby="signup-client-account-note"
          disabled
        >
          {signupRoles.map(([value, label]) => (
            <option key={value} value={value} disabled={value !== role}>{label}</option>
          ))}
        </select>
        <p id="signup-client-account-note" className="mt-1 text-xs text-muted-foreground">
          Client accounts are created by an authorized parent/guardian or clinician; clients do not self-register here.
        </p>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        NeuroPathways and service providers that operate its storage, AI, and document features may process information you choose to provide. Read the{" "}
        <a href="/privacy-details" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">supplemental feature data notice</a>.
      </p>

      <div>
        <label htmlFor="signup-age-group" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Account holder's age group
        </label>
        <select
          id="signup-age-group"
          className="mt-2 w-full min-w-0 max-w-full min-h-[44px] rounded-xl border border-input bg-background px-3 text-sm"
          value={ageGroup}
          onChange={(event) => setAgeGroup(event.target.value)}
          required
          data-testid="select-account-holder-age"
        >
          <option value="">Select an age group</option>
          <option value="under_13">Under 13</option>
          <option value="13_17">13–17</option>
          <option value="18_plus">18 or older</option>
        </select>
        {ageGroup === "under_13" && (
          <p role="alert" className="mt-2 text-sm text-destructive" data-testid="text-under-thirteen-block">
            A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={adultConfirmed}
          onChange={(event) => setAdultConfirmed(event.target.checked)}
          data-testid="checkbox-adult-or-guardian-confirmed"
        />
        <span>I confirm I am 18 or older, or I have parent/guardian permission to use this account.</span>
      </label>

      {isParent && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            required
            checked={parentConfirmed}
            onChange={(event) => setParentConfirmed(event.target.checked)}
            data-testid="checkbox-parent-guardian-authority"
          />
          <span>I confirm I am the parent, guardian, or authorized caregiver for any child profile I create.</span>
        </label>
      )}
    </section>
  );
}
