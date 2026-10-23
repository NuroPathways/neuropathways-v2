export type ParentActivityDomain =
  | "communication"
  | "transitions"
  | "daily_living"
  | "social_play"
  | "coping"
  | "parent_preparation";

export type ParentActivityRiskTier =
  | "low"
  | "context_sensitive"
  | "requires_authorized_plan";

export type ParentActivityEvidenceReference = {
  key: string;
  title: string;
  url: string;
  publishedYear: number;
  evidenceType: string;
  designImplication: string;
  limitation: string;
};

export type ParentActivityResearchMetadata = {
  skillDomain: ParentActivityDomain;
  appropriateContexts: string[];
  requiredInformation: string[];
  materials: string;
  caregiverPhrases: string[];
  stopConditions: string[];
  riskTier: ParentActivityRiskTier;
  evidenceReferences: ParentActivityEvidenceReference[];
  exclusionCriteria: string[];
  sourceClassification: "general_starter";
  personalizationFields: string[];
  requiresClinicianConfirmation: boolean;
};

export const PARENT_ACTIVITY_EVIDENCE_REFERENCES: Record<string, ParentActivityEvidenceReference> = {
  "communication-play-01-project-impact": {
    key: "communication-play-01-project-impact",
    title: "Initial Efficacy of Project ImPACT: A Parent-Mediated Social Communication Intervention for Young Children with ASD",
    url: "https://doi.org/10.1007/s10803-013-1840-9",
    publishedYear: 2013,
    evidenceType: "Small single-case multiple-baseline study",
    designImplication: "Parent-child interaction and familiar play can be considered as activity contexts.",
    limitation: "Eight dyads; this does not establish the effectiveness of a NeuroPathways template."
  },
  "communication-play-02-more-than-words": {
    key: "communication-play-02-more-than-words",
    title: "A randomized controlled trial of Hanen’s More Than Words in toddlers with early autism symptoms",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4783130/",
    publishedYear: 2011,
    evidenceType: "Randomized controlled trial",
    designImplication: "Everyday parent-child routines were used as interaction contexts.",
    limitation: "No significant overall child-outcome effect; subgroup findings need replication."
  },
  "communication-play-03-play-review": {
    key: "communication-play-03-play-review",
    title: "Play-based interventions to support social and communication development in autistic children aged 2–8 years: A scoping review",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9620698/",
    publishedYear: 2021,
    evidenceType: "Scoping review",
    designImplication: "Play-based approaches are diverse; activity design should distinguish child-led and adult-led participation.",
    limitation: "The review mapped studies but did not appraise quality or synthesize efficacy."
  },
  "visual-transitions-01-home-community-scoping": {
    key: "visual-transitions-01-home-community-scoping",
    title: "Visual supports at home and in the community for individuals with autism spectrum disorders: A scoping review",
    url: "https://pubmed.ncbi.nlm.nih.gov/31451016/",
    publishedYear: 2019,
    evidenceType: "Scoping review",
    designImplication: "Home supports need to be accessible, individualized, participation-focused, and familiar.",
    limitation: "The home/community evidence is limited and heterogeneous."
  },
  "visual-transitions-02-teacch-review": {
    key: "visual-transitions-02-teacch-review",
    title: "The effectiveness of TEACCH-based interventions in improving adaptive skills in children with autism spectrum disorders: a systematic review and meta-analysis",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12771134/",
    publishedYear: 2025,
    evidenceType: "Systematic review and meta-analysis",
    designImplication: "Predictable, structured supports are a reasonable design reference when they fit the child and setting.",
    limitation: "Interventions and settings varied; study quality and reporting limitations remain."
  },
  "visual-transitions-03-transition-study": {
    key: "visual-transitions-03-transition-study",
    title: "Separate and combined effects of visual schedules and extinction plus differential reinforcement on problem behavior occasioned by transitions",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2695333/",
    publishedYear: 2009,
    evidenceType: "Small-N experimental study",
    designImplication: "A visual schedule should not be presented as a guaranteed way to resolve a difficult transition.",
    limitation: "Two participants in a narrow treatment context; schedules alone did not reduce the studied behavior."
  },
  "parent-coaching-01-rubi-rct": {
    key: "parent-coaching-01-rubi-rct",
    title: "Effect of parent training vs parent education on behavioral problems in children with autism spectrum disorder: a randomized clinical trial",
    url: "https://pubmed.ncbi.nlm.nih.gov/25898050/",
    publishedYear: 2015,
    evidenceType: "Six-site randomized clinical trial",
    designImplication: "Parent support is best understood as structured and individualized, not as a generic script.",
    limitation: "Enrolled children had disruptive behavior; parent-rated outcome differences did not meet prespecified clinical-importance thresholds."
  },
  "parent-coaching-02-stepping-stones-triple-p": {
    key: "parent-coaching-02-stepping-stones-triple-p",
    title: "Stepping Stones Triple P: an RCT of a parenting program with parents of a child diagnosed with an autism spectrum disorder",
    url: "https://pubmed.ncbi.nlm.nih.gov/19023654/",
    publishedYear: 2009,
    evidenceType: "Randomized controlled trial",
    designImplication: "Caregiver preparation and usable routines are appropriate design considerations.",
    limitation: "Small sample; this is not evidence that a generic activity reproduces a branded program."
  },
  "parent-coaching-03-parent-implemented-fct-review": {
    key: "parent-coaching-03-parent-implemented-fct-review",
    title: "A Systematic Review of Parent-Implemented Functional Communication Training for Children With ASD",
    url: "https://pubmed.ncbi.nlm.nih.gov/29199433/",
    publishedYear: 2018,
    evidenceType: "Systematic review",
    designImplication: "Existing familiar communication should remain available and be respected.",
    limitation: "The reviewed studies noted fidelity, maintenance, and access gaps; they do not support unsupervised generic FCT."
  },
  "parent-coaching-04-assent-safety-review": {
    key: "parent-coaching-04-assent-safety-review",
    title: "Assent in applied behaviour analysis and positive behaviour support: ethical considerations and practical recommendations",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9897747/",
    publishedYear: 2023,
    evidenceType: "Ethics and practice review",
    designImplication: "Offer choice, notice withdrawal signals, and allow a pause or stop.",
    limitation: "Ethical/practice guidance, not a controlled activity efficacy or safety trial."
  }
};

export function isActivityPublishConfirmationSatisfied(
  activity: Pick<ParentActivityResearchMetadata, "requiresClinicianConfirmation"> | null | undefined,
  confirmed: boolean,
) {
  return !activity?.requiresClinicianConfirmation || confirmed;
}

type DomainProfile = Omit<ParentActivityResearchMetadata, "skillDomain" | "requiresClinicianConfirmation" | "materials">;

const domainProfiles: Record<ParentActivityDomain, DomainProfile> = {
  communication: {
    appropriateContexts: ["A calm, familiar activity the child currently wants to do, with their usual communication available."],
    requiredInformation: ["Confirm the child's familiar communication methods, including AAC, gesture, movement, speech, or other signals; do not assume speech."],
    caregiverPhrases: ["You can ask in any way you already use, or choose not to."],
    stopConditions: ["Stop or pause when the child declines, moves away, shows discomfort, or asks for a break."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["communication-play-01-project-impact"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["communication-play-02-more-than-words"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-03-parent-implemented-fct-review"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-04-assent-safety-review"]
    ],
    exclusionCriteria: ["Do not withhold AAC, a break, a preferred item, or ordinary communication access to prompt a response."],
    sourceClassification: "general_starter",
    personalizationFields: ["familiar communication methods", "preferred activities", "signals for pause or refusal"]
  },
  transitions: {
    appropriateContexts: ["A familiar, low-stakes routine transition with enough time and a cue the child already finds acceptable."],
    requiredInformation: ["Confirm the actual next routine step and whether the child already uses or accepts the visual or verbal cue."],
    caregiverPhrases: ["Here is what is next. We can pause or choose another way."],
    stopConditions: ["Pause if the cue increases distress, the routine changes, or the child indicates they are not ready."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-01-home-community-scoping"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-02-teacch-review"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-03-transition-study"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-04-assent-safety-review"]
    ],
    exclusionCriteria: ["Do not use a timer, visual, or first-then cue to force a transition or promise that it will prevent distress."],
    sourceClassification: "general_starter",
    personalizationFields: ["actual routine", "accepted cue format", "transition pace", "pause signals"]
  },
  daily_living: {
    appropriateContexts: ["One familiar, optional step within a routine that is currently safe and comfortable."],
    requiredInformation: ["Caregiver confirms the step is familiar, physically comfortable, and not affected by pain, illness, or a sensory concern."],
    caregiverPhrases: ["Would you like to try this step, get help, or stop?"],
    stopConditions: ["Stop if there is discomfort, pain, distress, a safety concern, or a request to stop."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-01-home-community-scoping"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-02-teacch-review"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-04-assent-safety-review"]
    ],
    exclusionCriteria: ["Do not turn hygiene, dressing, eating, or household tasks into a compliance test; do not physically guide the child."],
    sourceClassification: "general_starter",
    personalizationFields: ["familiar routine step", "preferred level of help", "sensory or access accommodations"]
  },
  social_play: {
    appropriateContexts: ["A familiar toy or game the child chooses, in a setting where they can freely pause or leave."],
    requiredInformation: ["Confirm the activity is currently preferred and safe; observe the child's lead rather than assuming a turn-taking goal."],
    caregiverPhrases: ["I can join if you want, or you can keep playing your way."],
    stopConditions: ["Stop joining when the child moves away, changes play, declines, or shows discomfort."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["communication-play-01-project-impact"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["communication-play-02-more-than-words"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["communication-play-03-play-review"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-04-assent-safety-review"]
    ],
    exclusionCriteria: ["Do not require eye contact, speech, imitation, sitting, sharing, or continued participation."],
    sourceClassification: "general_starter",
    personalizationFields: ["chosen play activity", "preferred interaction style", "signals for joining or stopping"]
  },
  coping: {
    appropriateContexts: ["A calm moment when a familiar support is available; not during a crisis or acute distress."],
    requiredInformation: ["Use only coping tools and spaces already familiar to and accepted by the child."],
    caregiverPhrases: ["Would you like a familiar option, another choice, or no support right now?"],
    stopConditions: ["Stop if the child declines, the option is uncomfortable, or the situation becomes unsafe."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-01-home-community-scoping"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-01-rubi-rct"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-04-assent-safety-review"]
    ],
    exclusionCriteria: ["Do not introduce exposure practice, forced breathing, restraint, or a new sensory intervention."],
    sourceClassification: "general_starter",
    personalizationFields: ["already-familiar supports", "comfortable environment", "preferred way to offer choices"]
  },
  parent_preparation: {
    appropriateContexts: ["Caregiver preparation before a predictable routine; child participation is optional."],
    requiredInformation: ["Use the family's existing routines and supports; do not invent or change a clinician-authored plan."],
    caregiverPhrases: [],
    stopConditions: ["Skip the activity if it adds pressure, is not practical, or conflicts with the family's current plan."],
    riskTier: "low",
    evidenceReferences: [
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["visual-transitions-01-home-community-scoping"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-01-rubi-rct"],
      PARENT_ACTIVITY_EVIDENCE_REFERENCES["parent-coaching-02-stepping-stones-triple-p"]
    ],
    exclusionCriteria: ["Do not use preparation to rehearse feared events, introduce a new treatment, or change a safety plan."],
    sourceClassification: "general_starter",
    personalizationFields: ["upcoming familiar routine", "supports already used", "caregiver's available time"]
  }
};

type ExistingActivityDetail = {
  domain: ParentActivityDomain;
  context: string;
  materials: string;
  riskTier?: ParentActivityRiskTier;
  requiredInformation?: string[];
  exclusionCriteria?: string[];
};

const existingActivityDetails: Record<string, ExistingActivityDetail> = {
  "stay-together-puzzle": { domain: "social_play", context: "A familiar puzzle the child has chosen and can leave at any time.", materials: "A familiar puzzle or another child-chosen tabletop activity." },
  "indoor-stop-and-return": { domain: "transitions", context: "Only a calm, safe rehearsal explicitly covered by the child's current authorized safety plan.", materials: "Only the familiar cue and items named in that plan.", riskTier: "requires_authorized_plan", requiredInformation: ["An authorized, current child-specific safety plan explicitly supports this practice.", "The caregiver knows the plan's safe location, stop criteria, and exact cue."], exclusionCriteria: ["Never use as a generic elopement exercise, near an exit or hazard, during an incident, or to test whether the child will run."] },
  "stay-together-game": { domain: "social_play", context: "A familiar, low-pressure game in a safe space with a clear option to stop.", materials: "A familiar board, matching, or turn-taking game chosen by the child." },
  "one-small-step": { domain: "daily_living", context: "One familiar routine step the child is comfortable trying today.", materials: "Only the ordinary item needed for the selected routine step.", requiredInformation: ["The specific step is safe, familiar, and does not require physical prompting."] },
  "first-then-choice": { domain: "transitions", context: "A routine where the child already understands or accepts a simple next-step cue.", materials: "An optional familiar first-then picture, written cue, or verbal description." },
  "break-request": { domain: "communication", context: "A calm moment before a familiar, optional task; the child can pause without needing to earn it.", materials: "The child's usual break signal or AAC, if they use one." },
  "calm-space-tour": { domain: "coping", context: "A calm time to look at a space the child already finds comfortable.", materials: "An already-familiar comfortable place; no new sensory items." },
  "feelings-match": { domain: "communication", context: "Optional conversation or play using familiar feeling words, pictures, or signals.", materials: "Optional familiar feeling pictures, book, or no materials." },
  "calm-choice": { domain: "coping", context: "A calm moment to offer supports the child has already used and accepted.", materials: "Only the child's already-familiar coping items." },
  "help-signal": { domain: "communication", context: "An easy activity where asking for help is optional and help is immediately available.", materials: "The child's familiar communication method or support card, if already used." },
  "space-request": { domain: "communication", context: "A calm shared activity where the child can have space without first making a request.", materials: "No special materials; preserve the child's usual communication access." },
  "safe-object": { domain: "coping", context: "A calm, supervised activity only when handling the selected item is already safe for this child.", materials: "A familiar, soft, non-breakable item already accepted by the child.", riskTier: "context_sensitive", requiredInformation: ["Confirm the selected item and setting are safe and consistent with any current behavior or safety plan."] },
  "familiar-help-request": { domain: "communication", context: "A familiar activity with a naturally occurring, low-stakes opportunity to ask for help.", materials: "The familiar activity and the child's usual communication method." },
  "safe-sensory-choice": { domain: "coping", context: "A calm moment to choose among sensory options the child already knows and likes.", materials: "Only familiar, child-approved sensory options; no new material." },
  "timer-transition": { domain: "transitions", context: "A predictable, low-stakes transition where the child already accepts the timer.", materials: "A familiar visual or audible timer only if the child accepts it." },
  "first-then-transition": { domain: "transitions", context: "A familiar routine where a short next-step cue is already acceptable.", materials: "An optional familiar picture, written cue, or spoken description." },
  "transition-object": { domain: "transitions", context: "A familiar transition where the child already likes and uses the chosen object.", materials: "A child-chosen familiar transition object." },
  "put-down-practice": { domain: "coping", context: "A calm activity with a safe, non-breakable object; never during property destruction.", materials: "A familiar soft, non-breakable item.", riskTier: "context_sensitive", requiredInformation: ["Confirm this practice is appropriate under the child's current support and safety plan."], exclusionCriteria: ["Do not introduce or practice object handling when the child is distressed or objects may be thrown or broken."] },
  "ask-help-object": { domain: "communication", context: "A calm, easy task with help immediately available and no need to create frustration.", materials: "A familiar activity with a naturally occurring help opportunity." },
  "soft-object-practice": { domain: "social_play", context: "Child-chosen play with a familiar soft object, only when handling is already safe.", materials: "A familiar, soft object already accepted by the child.", riskTier: "context_sensitive", requiredInformation: ["Confirm the object and play context are safe and consistent with the child's current plan."] },
  "toothbrush-step": { domain: "daily_living", context: "A familiar oral-care routine when the child is comfortable and not experiencing pain.", materials: "The child's own familiar toothbrush; no physical guidance." },
  "shoes-step": { domain: "daily_living", context: "A familiar dressing routine when the child is comfortable and ready.", materials: "The child's own familiar shoes." },
  "handwashing-step": { domain: "daily_living", context: "A familiar hygiene routine when the child is comfortable with the setting and materials.", materials: "Usual handwashing supplies already accepted by the child." },
  "familiar-help-signal": { domain: "communication", context: "A calm, easy activity where the child's existing help signal remains available.", materials: "The child's existing help signal or communication aid, if used." },
  "shared-preferred-activity": { domain: "social_play", context: "A child-selected preferred activity where the adult can follow rather than direct.", materials: "The activity and materials chosen by the child." },
  "one-small-routine-step": { domain: "daily_living", context: "One familiar, optional step from the child's current routine.", materials: "Only the ordinary item needed for that step." }
};

export function activityResearchMetadata(
  id: string,
  stopCondition: string,
): ParentActivityResearchMetadata | null {
  const detail = existingActivityDetails[id];
  if (!detail) return null;
  const profile = domainProfiles[detail.domain];
  const riskTier = detail.riskTier || profile.riskTier;
  return {
    ...profile,
    skillDomain: detail.domain,
    appropriateContexts: [detail.context],
    requiredInformation: detail.requiredInformation || profile.requiredInformation,
    materials: detail.materials,
    stopConditions: [...new Set([stopCondition, ...profile.stopConditions].filter(Boolean))],
    riskTier,
    exclusionCriteria: detail.exclusionCriteria
      ? [...profile.exclusionCriteria, ...detail.exclusionCriteria]
      : profile.exclusionCriteria,
    requiresClinicianConfirmation: riskTier !== "low"
  };
}

type NewParentActivity = {
  id: string;
  title: string;
  description: string;
  skill: string;
  estimatedMinutes: number;
  materials: string;
  startAction?: string;
  steps: string[];
  ending?: string;
  ifDifficult: string;
  metadata: ParentActivityResearchMetadata;
};

function newActivity(
  input: Omit<NewParentActivity, "metadata"> & {
    domain: ParentActivityDomain;
    context: string;
    requiredInformation?: string[];
    extraExclusions?: string[];
    extraStopConditions?: string[];
  },
): NewParentActivity {
  const profile = domainProfiles[input.domain];
  const { domain, context, requiredInformation, extraExclusions, extraStopConditions, ...activity } = input;
  return {
    ...activity,
    metadata: {
      ...profile,
      skillDomain: domain,
      appropriateContexts: [context],
      requiredInformation: requiredInformation || profile.requiredInformation,
      materials: activity.materials,
      stopConditions: [...new Set([activity.ifDifficult, ...profile.stopConditions, ...(extraStopConditions || [])])],
      exclusionCriteria: [...profile.exclusionCriteria, ...(extraExclusions || [])],
      requiresClinicianConfirmation: false
    }
  };
}

export const ADDITIONAL_PARENT_ACTIVITY_TEMPLATES: NewParentActivity[] = [
  newActivity({
    id: "choose-between-familiar-activities",
    title: "Choose Between Two Activities",
    description: "Offer a real choice between familiar activities and accept any response, including no choice.",
    skill: "Communication",
    estimatedMinutes: 5,
    domain: "communication",
    context: "A calm moment when both activities are safe, available, and currently welcome.",
    requiredInformation: ["Both options are familiar and accessible; the child's usual communication stays available."],
    materials: "Two familiar activities already accepted by the child.",
    startAction: "Choose two familiar activities that are both available.",
    steps: ["Offer two familiar options without taking away access to either.", "Wait for any familiar response, or no response; do not require speech.", "Follow the choice or stop if neither option is wanted."],
    ending: "Finish after the child chooses, declines, or moves on.",
    ifDifficult: "Stop if the child does not want either option; leave both available or move on."
  }),
  newActivity({
    id: "request-more-during-play",
    title: "Request More During Play",
    description: "Notice a child's familiar way of asking to continue during an activity they chose.",
    skill: "Communication",
    estimatedMinutes: 5,
    domain: "communication",
    context: "Child-chosen play that can continue without making the child request access.",
    requiredInformation: ["Know the child's familiar ways of communicating more, continuing, or being finished."],
    materials: "A preferred play activity and any familiar communication aid.",
    steps: ["Join the activity only if welcome and keep the materials available.", "Notice any familiar signal to continue; do not pause or withhold the activity to prompt it.", "Continue when requested or stop when the child is finished."],
    ifDifficult: "Stop if the activity is no longer wanted; do not ask for another request."
  }),
  newActivity({
    id: "familiar-aac-choice",
    title: "Use a Familiar AAC Choice",
    description: "Make a choice using the child's existing AAC system while keeping it available for all communication.",
    skill: "Communication",
    estimatedMinutes: 5,
    domain: "communication",
    context: "A familiar choice-making moment with the child's own current AAC system available.",
    requiredInformation: ["Confirm the AAC system and choice options are already familiar; do not add symbols or change access."],
    materials: "The child's own AAC device or board, if already used, plus familiar options.",
    steps: ["Ensure the child can access their usual communication system.", "Offer a familiar choice and wait without prompting a particular answer.", "Accept the child's response or refusal and follow their lead."],
    ifDifficult: "Stop offering the choice if the device, symbols, or interaction are not comfortable."
  }),
  newActivity({
    id: "what-happens-next",
    title: "What Happens Next?",
    description: "Optionally preview the next familiar routine step using a cue the child already accepts.",
    skill: "Transitions",
    estimatedMinutes: 5,
    domain: "transitions",
    context: "A predictable, low-stakes routine where a preview cue is already familiar.",
    requiredInformation: ["The actual next step is known and the cue format is already accepted."],
    materials: "An optional familiar picture, written cue, or spoken description.",
    steps: ["Name or show only the actual next routine step.", "Allow time for the child to respond, pause, or choose a different way to continue.", "Follow the current routine only when it remains appropriate."],
    ifDifficult: "Put the cue away if it increases stress or the next step changes."
  }),
  newActivity({
    id: "prepare-familiar-materials",
    title: "Prepare Familiar Materials Together",
    description: "Optionally arrange materials for a familiar activity without requiring the child to participate.",
    skill: "Parent Preparation",
    estimatedMinutes: 5,
    domain: "parent_preparation",
    context: "Before a predictable activity, when preparation reduces caregiver searching or setup pressure.",
    requiredInformation: ["Use only materials already familiar and appropriate for the planned activity."],
    materials: "The ordinary materials already used in the familiar activity.",
    steps: ["Caregiver identifies the materials normally used.", "Invite the child to help only if they want to.", "Set up or put away materials in the way that best fits the family."],
    ifDifficult: "Caregiver completes or skips setup; child participation is optional."
  }),
  newActivity({
    id: "finished-basket-choice",
    title: "Finished Basket",
    description: "Offer a familiar place for one item after an activity, while letting the child decline or ask for help.",
    skill: "Daily Living",
    estimatedMinutes: 5,
    domain: "daily_living",
    context: "A familiar cleanup moment with one safe item and no time pressure.",
    requiredInformation: ["The item and basket are familiar, safe, and comfortable to use."],
    materials: "One familiar safe item and an optional familiar basket or finished place.",
    startAction: "Choose one familiar item and its usual finished place.",
    steps: ["Show the familiar place and offer the child a choice to put away one item, ask for help, or stop.", "Accept any response without physically guiding the child.", "Finish together or leave the item if the child declines."],
    ending: "Finish after one item or whenever the child is done.",
    ifDifficult: "Stop the cleanup invitation if the child declines or shows discomfort."
  }),
  newActivity({
    id: "puzzle-together",
    title: "Puzzle Together",
    description: "Try a familiar puzzle side by side, at the child's pace.",
    skill: "Shared play",
    estimatedMinutes: 5,
    domain: "social_play",
    context: "A familiar puzzle the child currently wants to use, in a comfortable place.",
    requiredInformation: ["Use only a puzzle and pieces that are familiar and safe for the child's age and access needs."],
    materials: "A familiar puzzle with pieces that are safe for the child.",
    startAction: "Choose a familiar puzzle and place it within easy reach.",
    steps: ["Invite your child to choose a piece.", "Work on one piece together, or watch if they prefer.", "Pause when your child changes activities or signals they are done."],
    ending: "Finish after a few pieces or whenever your child is ready.",
    ifDifficult: "Pause or put the puzzle away if it becomes uncomfortable or your child wants to stop."
  }),
  newActivity({
    id: "matching-pairs",
    title: "Find the Matching Pairs",
    description: "Play a short matching game with familiar pictures or safe, larger objects.",
    skill: "Playing a simple matching game",
    estimatedMinutes: 5,
    domain: "social_play",
    context: "A relaxed game using familiar pictures or objects the child can safely handle.",
    requiredInformation: ["Use pictures or objects that are familiar, accessible, and safe for the child's age."],
    materials: "Two or three pairs of familiar picture cards or larger safe objects.",
    startAction: "Choose two or three familiar pairs and place them within reach.",
    steps: ["Show one item from a pair.", "Invite your child to find its match.", "Help only if wanted, then pause or stop when they are done."],
    ending: "Finish after a few matches or whenever your child is ready.",
    ifDifficult: "Stop the game if the items or matching activity are not comfortable."
  }),
  newActivity({
    id: "child-led-play",
    title: "Five Minutes of Child-Led Play",
    description: "Spend a short period following the child's chosen play without adding a performance goal.",
    skill: "Social Play",
    estimatedMinutes: 5,
    domain: "social_play",
    context: "A child-chosen activity in a comfortable setting with room to pause or leave.",
    requiredInformation: ["Confirm the child is interested in the activity and whether adult joining is welcome."],
    materials: "The toy or activity chosen by the child.",
    startAction: "Offer to join an activity your child has chosen.",
    steps: ["Let the child choose how to play.", "Join only in ways the child welcomes; follow rather than redirect.", "Pause or stop when the child changes activities or signals they are finished."],
    ending: "Finish when your child changes activities or signals they are done.",
    ifDifficult: "Step back if joining is not welcome; the child may continue alone."
  }),
  newActivity({
    id: "build-together",
    title: "Build Together",
    description: "Offer a familiar building activity as optional side-by-side play.",
    skill: "Social Play",
    estimatedMinutes: 5,
    domain: "social_play",
    context: "A calm, child-chosen building activity that does not require sharing or turn-taking.",
    requiredInformation: ["The materials are safe and the child currently enjoys this type of play."],
    materials: "Familiar, safe building materials chosen by the child.",
    steps: ["Place materials within easy reach and let the child choose what to build.", "Build nearby only if welcome; do not change or take apart the child's work.", "Stop or put materials away when the child is finished."],
    ifDifficult: "Give space or stop if the child does not want someone building nearby."
  }),
  newActivity({
    id: "familiar-coping-choice-card",
    title: "Familiar Coping Choice Card",
    description: "Make a simple reminder of coping options the child already knows and accepts.",
    skill: "Calm & Coping",
    estimatedMinutes: 5,
    domain: "coping",
    context: "A calm moment when the child is interested in reviewing familiar choices.",
    requiredInformation: ["Every option is already familiar, available, and accepted; no new coping strategy is introduced."],
    materials: "Paper or an existing choice board and the child's familiar options.",
    steps: ["Ask whether the child wants to review familiar choices.", "List or show only options the child already knows and accepts.", "Let the child change, remove, or ignore the card; it is not required during distress."],
    ifDifficult: "Put the card away if it is unwanted; do not use it to delay other support."
  }),
  newActivity({
    id: "gather-familiar-supports",
    title: "Gather Familiar Supports",
    description: "Caregiver gathers the supports already used for a predictable routine.",
    skill: "Parent Preparation",
    estimatedMinutes: 5,
    domain: "parent_preparation",
    context: "Caregiver preparation before a familiar routine; child participation is not expected.",
    requiredInformation: ["Use only the family's existing approved supports and current plan."],
    materials: "Only familiar items or communication tools already used by the family.",
    steps: ["Check which familiar items are normally used for the routine.", "Gather only what is practical and keep communication tools accessible.", "Skip any item that is unavailable, unwanted, or inconsistent with the current plan."],
    ifDifficult: "Use the routine without extra materials or ask the care team about a missing support."
  }),
  newActivity({
    id: "parent-reset-before-routine",
    title: "Parent Reset Before a Routine",
    description: "Caregiver takes a brief pause to review the existing plan and prepare one practical next step.",
    skill: "Parent Preparation",
    estimatedMinutes: 3,
    domain: "parent_preparation",
    context: "A caregiver-only pause before a familiar routine, when there is time and immediate supervision is already arranged.",
    requiredInformation: ["The child is safely supervised; the caregiver is not leaving a child alone or delaying urgent support."],
    materials: "No materials required; the family's existing routine or plan may be reviewed.",
    steps: ["Check that the child is safely supported.", "Take a brief pause and identify one practical next step from the existing routine.", "Return when ready, or seek help if the situation is unsafe or urgent."],
    ifDifficult: "Skip the pause if supervision, safety, or an urgent need makes it inappropriate."
  }),
  newActivity({
    id: "pause-and-notice-communication",
    title: "Pause and Notice Communication",
    description: "Give a familiar interaction a quiet pause and notice the child's own way of responding or ending it.",
    skill: "Communication",
    estimatedMinutes: 3,
    domain: "communication",
    context: "A relaxed interaction the child already enjoys, with no response required.",
    requiredInformation: ["Know the child's familiar signals for interest, communication, and being finished."],
    materials: "A familiar shared activity; keep the child's usual communication available.",
    steps: ["Join only if welcome and continue the familiar activity.", "Allow a brief pause without asking for a response or withholding anything.", "Notice any signal, including no response or being finished, and follow the child's lead."],
    ifDifficult: "Stop the interaction if the child declines or moves away."
  }),
  newActivity({
    id: "take-turns-with-familiar-toy",
    title: "Take Turns with a Familiar Toy",
    description: "Offer an optional shared turn with a familiar toy without requiring waiting, sharing, or continued play.",
    skill: "Social Play",
    estimatedMinutes: 5,
    domain: "social_play",
    context: "A familiar toy the child has chosen, during calm play when an adult turn is welcome.",
    requiredInformation: ["Confirm the child currently wants the toy activity and accepts another person joining."],
    materials: "A familiar, safe toy chosen by the child.",
    steps: ["Let the child decide whether another person joins.", "If welcome, offer one short turn and return the toy without requiring the child to wait.", "Stop or return to child-led play whenever the child prefers."],
    ifDifficult: "Stop turn-taking if the child does not want to share the activity."
  }),
  newActivity({
    id: "review-familiar-morning-routine",
    title: "Review a Familiar Morning Routine",
    description: "Optionally review three already-familiar morning steps without adding tasks or requiring completion.",
    skill: "Daily Living",
    estimatedMinutes: 5,
    domain: "daily_living",
    context: "A calm review of a routine the family already uses; participation and sequence can be changed or declined.",
    requiredInformation: ["The caregiver and child recognize the existing steps; confirm any health, sensory, or access needs."],
    materials: "An optional familiar list or pictures for the three existing steps.",
    steps: ["Use only the three steps already in the family's routine.", "Offer to look at or talk through the steps; the child may skip or change the order.", "Do not turn the review into a demand to complete the routine."],
    ifDifficult: "Stop the review if the cue or routine is not wanted or no longer fits."
  }),
  newActivity({
    id: "caregiver-preview-familiar-routine",
    title: "Caregiver Preview of a Familiar Routine",
    description: "Caregiver checks an existing routine and prepares its familiar supports before a predictable event.",
    skill: "Parent Preparation",
    estimatedMinutes: 3,
    domain: "parent_preparation",
    context: "Caregiver-only preparation before a familiar, predictable routine; no child rehearsal is required.",
    requiredInformation: ["Use the current routine and existing approved supports; do not add exposure practice or change the plan."],
    materials: "The family's current routine or support list, if one is already used.",
    steps: ["Review the next routine step and any familiar support already used.", "Check that the support is available and accessible.", "Skip preparation that is impractical or inconsistent with the current plan."],
    ifDifficult: "Use the family's ordinary routine or consult the care team rather than adding new steps."
  })
];
