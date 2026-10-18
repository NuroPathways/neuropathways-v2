import CareTeamWorkspace from "@/components/clinician/CareTeamWorkspace";

// Single clinician goals workflow. The workspace endpoint returns every existing
// reward_token goal for the child (document, manual and care-team), so legacy goals
// are edited in place by ID through the same authorized form: no duplicates.
export default function ClientGoalsSection({ childId, childName }) {
  if (!childId) return null;
  return <CareTeamWorkspace childId={childId} childName={childName} />;
}
