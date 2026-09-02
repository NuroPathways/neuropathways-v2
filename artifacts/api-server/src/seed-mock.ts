/**
 * Mock seed script — populates realistic demo data under neuropathways@gmail.com
 *
 * Requires the clinician account for neuropathways@gmail.com to already exist.
 * Aborts with a clear error if that user is not found.
 *
 * Accounts created:
 * ┌─────────────────────┬────────────────────┬──────────┬──────────────┐
 * │ Account             │ Username           │ Code     │ Notes        │
 * ├─────────────────────┼────────────────────┼──────────┼──────────────┤
 * │ Parent Family A     │ rivera.parent      │ RIV001   │ 2 children   │
 * │ Parent Family B     │ nguyen.parent      │ NGU001   │ 1 child      │
 * │ Client A (Anxiety)  │ jordan.e           │ JOR001   │ standalone   │
 * │ Client B (ADHD)     │ alex.m             │ ALE001   │ standalone   │
 * │ Caregiver A (Alz.)  │ thornton.care      │ THO001   │ 1 patient    │
 * │ Caregiver B (Bip.)  │ osei.care          │ OSE001   │ 1 patient    │
 * └─────────────────────┴────────────────────┴──────────┴──────────────┘
 *
 * Run: pnpm --filter @workspace/api-server run seed:mock
 */

import { db, usersTable, familiesTable, childrenTable, clientSessionsTable, documentsTable, behaviorLogsTable, dailyCheckInsTable, winLogsTable } from "@workspace/db";
import { eq, and, like } from "drizzle-orm";

const CLINICIAN_EMAIL = "neuropathways@gmail.com";

// ── helpers ──────────────────────────────────────────────────────────────────

function printCredentials() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log(  "║              SEED CREDENTIALS (client-session login)       ║");
  console.log(  "╠══════════════════════════╦═══════════════╦════════════════╣");
  console.log(  "║ Account                  ║ Username      ║ Access Code    ║");
  console.log(  "╠══════════════════════════╬═══════════════╬════════════════╣");
  console.log(  "║ Rivera Family (parent)   ║ rivera.parent ║ RIV001         ║");
  console.log(  "║ Nguyen Family (parent)   ║ nguyen.parent ║ NGU001         ║");
  console.log(  "║ Jordan Ellison (client)  ║ jordan.e      ║ JOR001         ║");
  console.log(  "║ Alex Mercer (client)     ║ alex.m        ║ ALE001         ║");
  console.log(  "║ Thornton Family (care)   ║ thornton.care ║ THO001         ║");
  console.log(  "║ Osei Family (care)       ║ osei.care     ║ OSE001         ║");
  console.log(  "╚══════════════════════════╩═══════════════╩════════════════╝\n");
}

async function insertClientSession(childId: string, username: string, accessCode: string) {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  await db.insert(clientSessionsTable).values({ childId, username, accessCode, expiresAt });
}

interface DocRow {
  title: string;
  category: string;
  notes: string;
}

async function insertDocuments(childId: string, clinicianId: string, docs: DocRow[]) {
  for (const doc of docs) {
    await db.insert(documentsTable).values({
      childId,
      clinicianId,
      tenantId: clinicianId,
      title: doc.title,
      category: doc.category,
      fileName: doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".txt",
      notes: doc.notes,
      scanStatus: "pending",
      uploadedBy: clinicianId,
    });
  }
}

// ── progress data ────────────────────────────────────────────────────────────

function randOf<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function uniqueInts(count: number, min: number, max: number): number[] {
  const s = new Set<number>();
  while (s.size < count) s.add(randInt(min, max));
  return [...s].sort();
}
function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(randInt(7, 20), randInt(0, 59), 0, 0);
  return dt;
}

interface ProgressSpec {
  behaviors: string[];
  strategies: string[];
  wins: string[];
}

async function insertProgressData(childId: string, clinicianId: string, spec: ProgressSpec) {
  const moods = ["great","great","good","good","good","okay","okay","okay","rough","bad"];
  const feedbacks = ["resolved","resolved","better","no","escalated"];
  const intensities = ["low","low","low","moderate","moderate","high"];

  const logDays = uniqueInts(randInt(18, 25), 0, 29);
  const ciDays  = uniqueInts(randInt(22, 29), 0, 29);
  const winDays = uniqueInts(randInt(10, 15), 0, 29);

  for (const d of logDays) {
    await db.insert(behaviorLogsTable).values({
      childId,
      clinicianId,
      tenantId: clinicianId,
      eventCategory: "behavior",
      behaviorType: randOf(spec.behaviors),
      intensity: randOf(intensities),
      context: "Daily session observation",
      parentFeedback: randOf(feedbacks),
      strategyUsed: randOf(spec.strategies),
      createdDate: daysAgo(d),
    });
  }

  for (const d of ciDays) {
    const mood = randOf(moods);
    const notes =
      mood === "great" || mood === "good"
        ? randOf(["Good day overall","Made progress on goals","Positive engagement noted","Energy and mood elevated","Showed improvement"])
        : mood === "rough" || mood === "bad"
        ? randOf(["Difficult day","Struggled with regulation","Multiple incidents today","Low energy and motivation","Needed extra support"])
        : randOf(["Average day","Some challenges but managed","Mixed progress","Steady day","Routine maintained"]);
    await db.insert(dailyCheckInsTable).values({
      childId,
      parentId: childId,
      tenantId: clinicianId,
      mood,
      notes,
      createdDate: daysAgo(d),
    });
  }

  for (const d of winDays) {
    await db.insert(winLogsTable).values({
      childId,
      parentId: childId,
      tenantId: clinicianId,
      winType: "milestone",
      description: randOf(spec.wins),
      createdDate: daysAgo(d),
    });
  }
}

// ── document content sets ────────────────────────────────────────────────────

const riveraSofiaDocuments: DocRow[] = [
  {
    title: "ADHD Behavior Plan — Sofia Rivera",
    category: "Behavior Plan",
    notes: "Sofia exhibits difficulty sustaining attention during structured academic tasks. Interventions include visual timers, frequent movement breaks every 20 minutes, and a first-then board for task transitions. Reinforcement: sticker chart redeemable for extra art time.",
  },
  {
    title: "School Accommodation Letter — Sofia Rivera",
    category: "Assessment",
    notes: "To Whom It May Concern: Sofia Rivera (DOB: 2017-03-14) has been diagnosed with ADHD — Combined Type and qualifies for a 504 plan. Recommended accommodations include extended time on assessments (1.5×), preferential seating near the teacher, and permission to use fidget tools.",
  },
  {
    title: "Session Summary — May 2026",
    category: "Session Summary",
    notes: "Session focused on emotion identification and self-regulation. Sofia successfully identified three body cues for frustration and practiced a 'stop and breathe' technique. Parent reported improvement in after-school routine compliance. Continue reinforcing the 'pause button' strategy.",
  },
  {
    title: "Parent Progress Note — April 2026",
    category: "Progress Note",
    notes: "Parent reports Sofia completed 4 out of 5 homework sessions without significant meltdowns this week. Morning routine improved with visual schedule posted on fridge. Remaining challenge: transitions from preferred activities. Recommendation: 5-minute warning prompt using a visual timer.",
  },
  {
    title: "Cognitive Assessment Summary — Spring 2026",
    category: "Assessment",
    notes: "Psychoeducational assessment completed March 2026. Processing speed index: 82 (low average). Working memory index: 78 (borderline). Full-scale IQ: 96 (average). Results consistent with ADHD profile. Formal diagnoses confirmed. Recommendations for continued behavioral support and classroom accommodations provided.",
  },
  {
    title: "Reinforcement Menu — Sofia",
    category: "Behavior Plan",
    notes: "High-preference rewards identified through preference assessment: (1) 10 minutes free draw time, (2) choose classroom job for the week, (3) earn a 'homework-free' coupon after 5 consecutive days with planner signed, (4) pick Friday movie during lunch. Low-effort responses preferred; immediate reinforcement most effective.",
  },
];

const riveraMarcoDocuments: DocRow[] = [
  {
    title: "Dyslexia Support Plan — Marco Rivera",
    category: "Behavior Plan",
    notes: "Marco has a confirmed diagnosis of dyslexia (phonological subtype). Intervention strategies: Orton-Gillingham reading approach 3× weekly, text-to-speech tools for independent reading, and graphic organizers for written expression. Parent coaching provided on at-home reading fluency practice.",
  },
  {
    title: "Fluency Progress Report — Q1 2026",
    category: "Progress Note",
    notes: "DIBELS Oral Reading Fluency: Benchmark — 89 wcpm (below grade level: 110 wcpm). Intervention — 76 wcpm → 94 wcpm over 8 weeks. Rate of improvement: +2.25 wcpm/week, tracking to reach benchmark by end of Q2. Comprehension scores improving; decoding remains primary area of need.",
  },
  {
    title: "Session Summary — June 2026",
    category: "Session Summary",
    notes: "Worked on CVC-e word pattern reading and blending. Marco decoded 18/20 target words with 90% accuracy — new personal best. Practiced multisensory spelling using sand tray. Motivation high when 'secret code' framing is used. Plan: advance to vowel teams next session.",
  },
  {
    title: "School Communication Note",
    category: "Assessment",
    notes: "Conference held with teacher Mrs. Ortega on 04/22/2026. Agreed to implement: oral testing for all social studies/science units, paired reading with a grade-level peer, and weekly check-ins with resource specialist. Teacher reports Marco's confidence has visibly improved since accommodations began.",
  },
  {
    title: "Reading Intervention Log — Spring 2026",
    category: "Progress Note",
    notes: "Week 1: Phoneme segmentation — 12/15 correct. Week 3: 14/15. Week 6: 15/15 mastered. Decoding CVC words — Week 1: 70%. Week 6: 92%. Target blends (bl, cr, st): introduced week 4, reaching 78% accuracy. Intervention continuing twice weekly.",
  },
  {
    title: "Family Guidance — Supporting Dyslexia at Home",
    category: "Session Summary",
    notes: "Handout provided to Rivera family: (1) Read aloud together daily for 15–20 min — use engaging audiobooks. (2) Play word games (rhyming, sound sorting). (3) Praise effort, not outcome. (4) Avoid timed homework pressure. (5) Use dyslexia-friendly fonts (OpenDyslexic, Arial) for printed materials. Contact the school 504 coordinator with any concerns.",
  },
];

const nguyenLilyDocuments: DocRow[] = [
  {
    title: "Sensory Processing Profile — Lily Nguyen",
    category: "Assessment",
    notes: "Sensory Profile 2 completed by parent. Lily demonstrates hypersensitivity in tactile (texture aversion — seams, labels) and auditory (crowd noise, fire alarms) domains, and seeks proprioceptive input (jumping, crashing into furniture). Occupational therapy referral recommended. Immediate strategies: noise-canceling headphones, seamless clothing, weighted lap pad.",
  },
  {
    title: "Sensory Diet Plan — Lily Nguyen",
    category: "Behavior Plan",
    notes: "Morning: 5 min of jumping on trampoline + wall push-ups before school. Mid-morning: 'heavy work' activity (carry backpack, push chair to table). Lunchtime: proprioceptive snack (chewing crunchy foods). Afternoon: 10 min of playdough/clay for tactile input. Evening: bath with firm toweling for tactile regulation.",
  },
  {
    title: "Session Summary — May 2026",
    category: "Session Summary",
    notes: "Lily tolerated handpainting activity with fingerpaint (previously refused) for 4 minutes before requesting a break — significant improvement from baseline (immediate refusal). Used visual 'stop sign' card to communicate sensory overload appropriately. No meltdowns during 45-min session. Parent observed; practicing calm-down kit at home.",
  },
  {
    title: "Kindergarten Readiness Assessment",
    category: "Assessment",
    notes: "Social-emotional development: below age expectations in peer interaction and group participation. Fine motor: age-appropriate. Gross motor: slightly advanced (seeks sensory movement). Language: age-appropriate. Academic readiness (colors, shapes, counting to 20): on track. Primary barrier to kindergarten success: sensory regulation during unstructured transitions and group settings.",
  },
  {
    title: "Parent Coaching Notes — Transition Strategies",
    category: "Progress Note",
    notes: "Reviewed countdown warnings (5 min, 2 min, 1 min) before activity changes. Parent practiced using visual schedule with Lily in session — Lily responded positively. Identified high-stress transitions: morning drop-off, end of screen time, bedtime. Created a visual 'transition checklist' for the Nguyen home. Next appointment: 06/20/2026.",
  },
  {
    title: "OT Referral Letter — Lily Nguyen",
    category: "Assessment",
    notes: "Referring Lily Nguyen (DOB 2019-08-22, age 6) for occupational therapy evaluation. Presenting concerns: tactile defensiveness, auditory sensitivity, proprioceptive seeking. Significant functional impact on daily routines, peer play, and school readiness. Please evaluate sensory processing, fine motor, and adaptive skills. Please coordinate care with this office.",
  },
  {
    title: "Home Behavior Log — June 2026",
    category: "Progress Note",
    notes: "Week of 06/02: 3 sensory meltdowns (avg. duration 12 min), all triggered by clothing. Introduced seamless socks and tagless shirts — meltdowns reduced to 1 the following week. Week of 06/09: Zero clothing-related meltdowns. Parent reports Lily initiating use of noise-canceling headphones at grocery store unprompted.",
  },
];

const jordanEllsonDocuments: DocRow[] = [
  {
    title: "Panic Attack Safety Plan — Jordan Ellison",
    category: "Safety Plan",
    notes: "Warning signs: racing heart, shortness of breath, tingling in hands, feeling of unreality. Step 1 — Grounding: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste. Step 2 — Breathing: Inhale 4 counts, hold 4, exhale 6. Repeat 5 cycles. Step 3 — Contact support: Text or call Dr. Chen / Mom. Step 4 — Safe location: Quiet room, low light, weighted blanket. Do NOT isolate for more than 30 min without checking in.",
  },
  {
    title: "Anxiety Trigger Log — April 2026",
    category: "Progress Note",
    notes: "04/03 — Pre-exam anxiety. SUDS: 7/10. Used breathing exercise; reduced to 4/10 in 8 min. 04/09 — Social situation (lunch group). SUDS: 6/10. Left situation briefly; returned after 5 min. 04/14 — Called on in class unexpectedly. SUDS: 8/10. Panic attack; used safety plan. Duration: 11 min. 04/22 — No notable triggers. Best week this month.",
  },
  {
    title: "CBT Session Summary — May 12, 2026",
    category: "Session Summary",
    notes: "Session focus: cognitive restructuring for catastrophic thinking patterns. Jordan identified two core ANTs (automatic negative thoughts): 'Everyone will notice I'm panicking' and 'If I panic I'll fail.' Challenged with Socratic questioning and evidence review. Homework: thought record worksheet, 3 situations per week. Jordan rated session helpfulness: 8/10.",
  },
  {
    title: "School Accommodation Letter — Jordan Ellison",
    category: "Assessment",
    notes: "To: Westfield High School Counseling Office. Jordan Ellison has a diagnosis of Generalized Anxiety Disorder with Panic Attacks. Requested accommodations: (1) Designated quiet space for anxiety breaks (max 10 min). (2) Advance notice of in-class presentations. (3) Permission to leave class discreetly when panic symptoms arise. (4) Extended time on written assessments. Thank you for your partnership.",
  },
  {
    title: "Relaxation Techniques Handout",
    category: "Session Summary",
    notes: "Techniques reviewed with Jordan: (1) Progressive Muscle Relaxation — tense and release each muscle group from feet to face, 2-second hold. (2) Visualization — safe-place imagery (Jordan's chosen place: grandmother's garden). (3) Self-compassion phrase: 'This feeling will pass. I am safe right now.' (4) Body scan meditation — available via Insight Timer app (Adolescent Calm playlist).",
  },
  {
    title: "Progress Assessment — Q2 2026",
    category: "Assessment",
    notes: "GAD-7 Score: Session 1 = 16 (severe). Session 6 = 11 (moderate). Session 12 = 8 (mild). PHQ-A score improved from 11 to 6. Panic attack frequency: 4/month (baseline) → 1/month (current). Duration decreasing: avg. 18 min → 9 min. Jordan reports improved school attendance and participation. Adjustment of treatment plan to maintenance phase recommended.",
  },
  {
    title: "Family Psychoeducation Note",
    category: "Progress Note",
    notes: "Session held with Jordan and parent (Mr. Ellison). Reviewed anxiety cycle: trigger → thought → physical sensation → avoidance. Discussed how reassurance-seeking can maintain anxiety. Parent coached to respond to avoidance bids with validation + gentle encouragement to face feared situations. Agreed-upon family communication plan: 10-min check-in nightly, no extended reassurance discussions after 9pm.",
  },
  {
    title: "Exposure Hierarchy — Jordan Ellison",
    category: "Behavior Plan",
    notes: "Anxiety hierarchy (SUDS 0–10): (1) Reading aloud in therapy office — 3. (2) Making a phone call in front of therapist — 4. (3) Answering a question in small group — 5. (4) Eating lunch in cafeteria — 6. (5) Volunteering an answer in class — 7. (6) Giving an oral report — 9. Exposure begins at level 1-2 and progresses as SUDS ≤ 3 at current level.",
  },
];

const alexMercerDocuments: DocRow[] = [
  {
    title: "ADHD Assessment Report — Alex Mercer",
    category: "Assessment",
    notes: "Comprehensive neuropsychological evaluation completed February 2026. Diagnosis confirmed: ADHD — Combined Type (DSM-5 314.01). Significant impairment noted in sustained attention, inhibition, and working memory. Processing speed: 75th percentile. Verbal reasoning: 62nd percentile. Executive function composite: 18th percentile. Recommendations: stimulant medication evaluation, behavioral therapy, school accommodations.",
  },
  {
    title: "Executive Functioning Skills Plan",
    category: "Behavior Plan",
    notes: "Target skills: (1) Task initiation — use 2-minute rule (start any task within 2 min of it being assigned). (2) Time management — digital timer set for work/break intervals (25 min on / 5 min off). (3) Organization — end-of-day locker check; planner review with parent nightly. (4) Impulse control — pause-and-plan card carried in wallet. Weekly review with clinician.",
  },
  {
    title: "Session Summary — June 3, 2026",
    category: "Session Summary",
    notes: "Worked on prioritization and planning. Alex created a weekly plan for upcoming finals using a priority matrix (urgent/important quadrants). Practiced breaking a large project into 15-min chunks. Alex expressed frustration about peers 'not understanding' ADHD — explored self-advocacy language and disclosure decisions. Role-played requesting extended time from a teacher.",
  },
  {
    title: "Medication Coordination Note",
    category: "Progress Note",
    notes: "Coordinated with prescribing physician Dr. Vasquez. Current medication: methylphenidate ER 27 mg daily. Parent reports improved morning focus but appetite suppression at dinner. Physician adjusting timing. Behavioral plan adjusted to leverage medication peak window (8am–2pm) for highest-demand academic tasks. Next med review: 07/01/2026.",
  },
  {
    title: "School 504 Plan — Alex Mercer",
    category: "Assessment",
    notes: "Westview Academy 504 Plan. Student: Alex Mercer, Grade 9. Disability: ADHD — Combined Type. Accommodations: extended time (1.5×) on all assessments; frequent check-ins from teacher; permission to use noise-canceling earbuds; option to complete assignments in quiet room; digital copies of all notes; no penalty for late work due to ADHD-related factors (with prior communication).",
  },
  {
    title: "Parent Training Session — Behavior Strategies",
    category: "Session Summary",
    notes: "Covered: (1) Planned ignoring for low-level disruptive behavior, (2) specific labeled praise ('I noticed you started your homework right after dinner — great job'), (3) natural vs. logical consequences, (4) avoiding power struggles around screen time. Parent completed behavior tracking form for past week. Key finding: most conflicts occur in the 30 minutes before dinner. Adjusted schedule proposed.",
  },
  {
    title: "Peer Social Skills Note",
    category: "Progress Note",
    notes: "Alex has reported difficulty reading social cues in group conversations, often interrupting. Worked on SLANT technique (Sit up, Lean forward, Ask questions, Nod, Track the speaker). Practiced 3-second pause rule before speaking. Alex identified one peer as a trusted 'social anchor' for navigating lunchtime. Will track interruption frequency in class as baseline measure.",
  },
];

const thorntonEleanorDocuments: DocRow[] = [
  {
    title: "Cognitive Assessment — March 2026",
    category: "Assessment",
    notes: "MMSE Score: 17/30 (moderate dementia range). Significant deficits in orientation (date, place), recall (0/3 words at 5 min), and serial subtraction. Language: mild word-finding difficulty. Visuospatial: cannot copy intersecting pentagons. MoCA Score: 14/30. Clinical staging: moderate Alzheimer's disease (GDS Stage 5). Recommend memory care evaluation for future placement planning.",
  },
  {
    title: "Daily Routine Care Plan",
    category: "Behavior Plan",
    notes: "Morning routine (7:00–9:00am): Caregiver assists with hygiene in same sequence daily (toilet → wash face → dress → breakfast). Use simple one-step verbal prompts. Lay out clothing in order. Play familiar music from 1950s–60s to reduce agitation. Avoid rushing. Afternoon: structured reminiscence activity (photo albums, familiar objects). Evening: dim lighting, familiar TV program, warm bath. Avoid stimulating content after 7pm.",
  },
  {
    title: "Wandering Safety Protocol",
    category: "Safety Plan",
    notes: "Eleanor has wandered twice in the past 90 days. Safety measures implemented: door alarm (Caregiver alert on phone), GPS tracker bracelet (MedicAlert SafeReturn), door knob covers on exterior doors, fence secured in backyard. If found wandering: approach calmly from front, use first name, offer hand, redirect with a familiar activity. Do not argue about location or year. Emergency contacts posted on fridge. Local police non-emergency: [enrolled in Safe Return program].",
  },
  {
    title: "Family Communication Note — May 2026",
    category: "Progress Note",
    notes: "Family meeting held 05/15/2026 with daughter (primary caregiver) and son-in-law. Discussed: current disease stage, what to expect in next 6–12 months (increased need for ADL assistance, potential incontinence, sleep disturbances). Reviewed respite care options. Son-in-law to contact Area Agency on Aging re: adult day services. Daughter expressing significant caregiver burnout — referral to caregiver support group provided.",
  },
  {
    title: "Medication Log — June 2026",
    category: "Progress Note",
    notes: "Current medications: Donepezil 10 mg (evening); Memantine 20 mg daily (AM); Sertraline 50 mg (for co-occurring depression/anxiety); Vitamin D 2000 IU. Medication administration managed by caregiver. Compliance: 100% this month. Side effects noted: mild GI upset with donepezil (administering with food resolved). Next physician review: 07/10/2026.",
  },
  {
    title: "Stage Assessment Summary — Early vs. Current",
    category: "Assessment",
    notes: "Initial presentation (2023): Mild forgetfulness, lost keys frequently, missed appointments. MMSE at intake: 24/30. Current (2026): Requires assistance with all IADLs. Cannot manage finances, medications, or transportation. ADL support needed for bathing and dressing. Emotional recognition preserved; responds to touch and tone of voice. Long-term memories (pre-1990) more intact than recent memory. Prognosis: likely transition to severe stage within 12–18 months.",
  },
  {
    title: "Sundowning Management Plan",
    category: "Behavior Plan",
    notes: "Eleanor exhibits sundowning (increased confusion, agitation 4–7pm). Triggers identified: fatigue, hunger, low light. Management strategies: (1) Ensure adequate daytime activity and light exposure. (2) Snack and hydration at 3:30pm. (3) Bright light therapy 2pm–4pm (10,000 lux lamp). (4) Consistent late-afternoon activity (sorting laundry, folding towels — familiar motor tasks). (5) Avoid high-stimulation TV during this window. Melatonin 1 mg at 8pm (physician-approved).",
  },
  {
    title: "Respite Care Coordination Note",
    category: "Progress Note",
    notes: "Caregiver (daughter) utilizing 6 hours of respite care weekly through [County Memory Care Resource]. Eleanor attended adult day health program twice — reported calm and engaged during programming. Caregiver states respite significantly reduces her stress. Recommended increasing to 3 days/week. Application submitted for VA caregiver support program (Eleanor's late husband was a veteran).",
  },
];

const oseiJamesDocuments: DocRow[] = [
  {
    title: "Mood Tracking Log — May 2026",
    category: "Progress Note",
    notes: "Week of 05/05: Mixed state, 3 days. Mood: 6–7/10. Energy: elevated. Sleep: 4–5 hours (reduced). Week of 05/12: Stable, euthymic. Mood: 5/10. Sleep: 7 hours. Week of 05/19: Mild depressive dip. Mood: 3/10. Appetite reduced. Stayed in bed until noon 2 days. Week of 05/26: Improving. Mood: 5/10. Returned to gym twice. James reports lithium adherence 100% this month.",
  },
  {
    title: "Safety Plan — Bipolar Crisis Protocol",
    category: "Safety Plan",
    notes: "Warning signs of mania: decreased sleep need, racing thoughts, impulsive spending, irritability, talking faster than usual. Warning signs of depression: sleeping 10+ hours, social withdrawal, hopelessness, neglecting hygiene. Crisis steps: (1) Contact therapist Dr. Osei-Ansah. (2) Contact psychiatrist Dr. Patel for medication review. (3) Contact caregiver (father, Emmanuel Osei) — remove access to finances and car keys if manic. (4) Crisis line: 988. (5) ER if suicidal ideation with plan. Do not make major decisions during mood episodes.",
  },
  {
    title: "Medication Notes — June 2026",
    category: "Progress Note",
    notes: "Current regimen: Lithium carbonate 900 mg/day (serum level: 0.8 mEq/L — therapeutic). Quetiapine 50 mg QHS (sleep and mood stabilization). Lamotrigine 100 mg daily (depressive phase prophylaxis). Labs due 07/15/2026: lithium level, BMP, TSH. James reports side effect: mild hand tremor (lithium). Discussed dose timing to minimize tremor. Hydration emphasized (at least 8 glasses/day on lithium).",
  },
  {
    title: "CBT for Bipolar — Session Summary June 2026",
    category: "Session Summary",
    notes: "Focus: identifying prodromal signs and building an early intervention plan. James identified his top 3 manic prodromes: decreased sleep, increase in social media posting frequency, and financial planning 'projects.' Created a behavioral contract: if sleep < 6 hours for 2 consecutive nights → contact psychiatrist same day. Reviewed thought records for depressive beliefs ('I'm a burden to my family'). Challenged with behavioral activation experiments.",
  },
  {
    title: "Interpersonal & Social Rhythm Therapy Plan",
    category: "Behavior Plan",
    notes: "Social rhythm targets: Sleep: 11:00pm–7:00am. Morning activity (coffee + 10 min walk): 7:30am. Work start: 9:00am. Lunch: 12:30pm. Evening meal: 6:30pm. Wind-down (no screens): 10:00pm. James tracking rhythms with SRRS daily. Target: ≥ 80% adherence to anchor times. Research supports social rhythm regularity as mood-stabilizing. Next review: 06/28/2026.",
  },
  {
    title: "Caregiver Psychoeducation — Emmanuel Osei",
    category: "Session Summary",
    notes: "Session with James and father Emmanuel. Covered: bipolar disorder cycle, medication importance, and how to distinguish normal mood variation from early episode signs. Discussed stigma in Ghanaian-American family context. Emmanuel expressed willingness to be a 'mood monitor' — agreed on a 3-question weekly check-in script (sleep, spending, talking speed). Crisis contact plan reviewed. Emmanuel will store one week of James's medication as a safeguard against impulsive self-discontinuation.",
  },
  {
    title: "Hospitalization History & Relapse Prevention Summary",
    category: "Assessment",
    notes: "James Osei: 2 prior psychiatric hospitalizations. (1) Feb 2022: Manic episode with psychotic features (grandiosity, no sleep 4 days, disorganized speech). Hospitalized 12 days. Stabilized on lithium and quetiapine. (2) Sep 2024: Severe depressive episode with passive suicidal ideation. Hospitalized 7 days. Lamotrigine added. Current status: stable 20 months. Relapse risk factors: medication non-adherence, sleep disruption, alcohol use, high life stress. Protective factors: supportive family, employment, regular therapy attendance.",
  },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 NeuroPath mock seed starting…\n");

  // 1. Look up the clinician — abort if not found
  const [clinician] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, CLINICIAN_EMAIL));

  if (!clinician) {
    console.error(`❌  No user found with email ${CLINICIAN_EMAIL}.`);
    console.error("    Create that clinician account first, then re-run this script.");
    process.exit(1);
  }

  const clinicianId = clinician.id;
  console.log(`✅  Clinician: ${clinician.email} (id: ${clinicianId})`);

  // 2. Idempotency check
  const [existing] = await db
    .select()
    .from(familiesTable)
    .where(and(eq(familiesTable.clinicianId, clinicianId), like(familiesTable.familyName, "[SEED]%")));

  if (existing) {
    console.log("\n⚠️  Seed data already exists for this clinician. Skipping insert.");
    printCredentials();
    process.exit(0);
  }

  // 3. Parent Family A — Rivera (2 children)
  // Login is per-child-row: username + accessCode on the primary child (Sofia).
  // The /client-session/login endpoint looks up children by username+accessCode,
  // then loads all siblings in the same family — so Rivera login works for both.
  console.log("\n📋  Inserting Rivera Family…");
  const [riveraFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Rivera Family",
      firstName: "Maria",
      lastName: "Rivera",
      primaryContact: "Maria Rivera",
      email: "maria.rivera@example.com",
      phone: "555-201-0101",
      accountType: "parent",
    })
    .returning();

  const [sofia] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: riveraFamily.id,
      firstName: "Sofia",
      lastName: "Rivera",
      childName: "Sofia Rivera",
      age: 9,
      diagnosis: "ADHD — Combined Type",
      accountType: "child",
      status: "active",
      username: "rivera.parent",
      accessCode: "RIV001",
    })
    .returning();

  const [marco] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: riveraFamily.id,
      firstName: "Marco",
      lastName: "Rivera",
      childName: "Marco Rivera",
      age: 12,
      diagnosis: "Dyslexia — Phonological Subtype",
      accountType: "child",
      status: "active",
    })
    .returning();

  await insertClientSession(sofia.id, "rivera.parent", "RIV001");
  await insertDocuments(sofia.id, clinicianId, riveraSofiaDocuments);
  await insertDocuments(marco.id, clinicianId, riveraMarcoDocuments);
  console.log("   ✓ Rivera Family inserted (Sofia + Marco, 12 documents)");

  // 4. Parent Family B — Nguyen (1 child)
  console.log("\n📋  Inserting Nguyen Family…");
  const [nguyenFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Nguyen Family",
      firstName: "Linh",
      lastName: "Nguyen",
      primaryContact: "Linh Nguyen",
      email: "linh.nguyen@example.com",
      phone: "555-202-0202",
      accountType: "parent",
    })
    .returning();

  const [lily] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: nguyenFamily.id,
      firstName: "Lily",
      lastName: "Nguyen",
      childName: "Lily Nguyen",
      age: 7,
      diagnosis: "Sensory Processing Disorder",
      accountType: "child",
      status: "active",
      username: "nguyen.parent",
      accessCode: "NGU001",
    })
    .returning();

  await insertClientSession(lily.id, "nguyen.parent", "NGU001");
  await insertDocuments(lily.id, clinicianId, nguyenLilyDocuments);
  console.log("   ✓ Nguyen Family inserted (Lily, 7 documents)");

  // 5. Client A — Jordan Ellison (Anxiety) — individual family wrapper
  console.log("\n📋  Inserting Jordan Ellison (Client A — Anxiety)…");
  const [jordanFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Jordan Ellison",
      firstName: "Jordan",
      lastName: "Ellison",
      accountType: "individual",
    })
    .returning();

  const [jordan] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: jordanFamily.id,
      firstName: "Jordan",
      lastName: "Ellison",
      childName: "Jordan Ellison",
      age: 17,
      diagnosis: "Generalized Anxiety Disorder / Panic Attacks",
      accountType: "client",
      status: "active",
      username: "jordan.e",
      accessCode: "JOR001",
    })
    .returning();

  await insertClientSession(jordan.id, "jordan.e", "JOR001");
  await insertDocuments(jordan.id, clinicianId, jordanEllsonDocuments);
  console.log("   ✓ Jordan Ellison inserted (individual family + 8 documents)");

  // 6. Client B — Alex Mercer (ADHD) — individual family wrapper
  console.log("\n📋  Inserting Alex Mercer (Client B — ADHD)…");
  const [alexFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Alex Mercer",
      firstName: "Alex",
      lastName: "Mercer",
      accountType: "individual",
    })
    .returning();

  const [alex] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: alexFamily.id,
      firstName: "Alex",
      lastName: "Mercer",
      childName: "Alex Mercer",
      age: 15,
      diagnosis: "ADHD — Combined Type",
      accountType: "client",
      status: "active",
      username: "alex.m",
      accessCode: "ALE001",
    })
    .returning();

  await insertClientSession(alex.id, "alex.m", "ALE001");
  await insertDocuments(alex.id, clinicianId, alexMercerDocuments);
  console.log("   ✓ Alex Mercer inserted (individual family + 6 documents)");

  // 7. Caregiver A — Thornton Family (Alzheimer's)
  console.log("\n📋  Inserting Thornton Family (Caregiver A — Alzheimer's)…");
  const [thorntonFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Thornton Family",
      firstName: "Ruth",
      lastName: "Thornton",
      primaryContact: "Ruth Thornton",
      email: "ruth.thornton@example.com",
      phone: "555-203-0303",
      accountType: "caregiver",
    })
    .returning();

  const [eleanor] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: thorntonFamily.id,
      firstName: "Eleanor",
      lastName: "Thornton",
      childName: "Eleanor Thornton",
      age: 74,
      diagnosis: "Alzheimer's Disease — Moderate Stage",
      accountType: "patient",
      status: "active",
      username: "thornton.care",
      accessCode: "THO001",
    })
    .returning();

  await insertClientSession(eleanor.id, "thornton.care", "THO001");
  await insertDocuments(eleanor.id, clinicianId, thorntonEleanorDocuments);
  console.log("   ✓ Thornton Family inserted (Eleanor, 8 documents)");

  // 8. Caregiver B — Osei Family (Bipolar Disorder)
  console.log("\n📋  Inserting Osei Family (Caregiver B — Bipolar Disorder)…");
  const [oseiFamily] = await db
    .insert(familiesTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyName: "[SEED] Osei Family",
      firstName: "Emmanuel",
      lastName: "Osei",
      primaryContact: "Emmanuel Osei",
      email: "emmanuel.osei@example.com",
      phone: "555-204-0404",
      accountType: "caregiver",
    })
    .returning();

  const [james] = await db
    .insert(childrenTable)
    .values({
      clinicianId,
      tenantId: clinicianId,
      familyId: oseiFamily.id,
      firstName: "James",
      lastName: "Osei",
      childName: "James Osei",
      age: 31,
      diagnosis: "Bipolar Disorder — Type I",
      accountType: "patient",
      status: "active",
      username: "osei.care",
      accessCode: "OSE001",
    })
    .returning();

  await insertClientSession(james.id, "osei.care", "OSE001");
  await insertDocuments(james.id, clinicianId, oseiJamesDocuments);
  console.log("   ✓ Osei Family inserted (James, 7 documents)");

  // ── 30 days of randomised progress data for every client ─────────────────
  console.log("\n📊  Generating 30-day progress data for all clients…");

  const allClients: Array<{ child: { id: string }; spec: ProgressSpec }> = [
    {
      child: sofia,
      spec: {
        behaviors: ["Difficulty sustaining attention during math","Impulsive interruption of teacher","Left workstation without permission","Emotional reaction to low grade","Refusal to start writing task","Peer conflict over shared materials","Distracted by classroom noise"],
        strategies: ["Fidget tool provided","Timer set for task chunk","Preferential seating adjusted","Positive behavioral momentum","Token board referenced","Break card honored","Parent feedback requested"],
        wins: ["Completed homework 4 nights in a row","Used break card appropriately","Stayed in seat for full lesson","Shared materials with peer","Accepted teacher correction calmly"],
      },
    },
    {
      child: marco,
      spec: {
        behaviors: ["Refusal to read aloud","Avoidance of written work","Frustration during timed test","Negative self-talk about reading","Shut down when called on unexpectedly","Ripped paper after decoding error","Complained of headache to avoid reading"],
        strategies: ["Text-to-speech tool offered","Oral response accepted","Encouragement and reframing","Error correction with neutral tone","Multisensory spelling activity","Extended time granted","Reading buddy paired"],
        wins: ["Read three paragraphs aloud voluntarily","Completed decoding worksheet with 90% accuracy","Used audiobook without resistance","Self-corrected a word and continued","Tried new reading strategy without prompting"],
      },
    },
    {
      child: lily,
      spec: {
        behaviors: ["Meltdown over clothing texture","Covered ears during fire drill","Refused to participate in art","Aggression when touched unexpectedly","Withdrawal during group activity","Sought excessive proprioceptive input","Distress during cafeteria lunch"],
        strategies: ["Noise-canceling headphones offered","Sensory diet activity used","Weighted blanket provided","Gentle warning before transition","Heavy work task assigned","Calm corner access given","Parent coaching applied"],
        wins: ["Wore school uniform without complaint","Participated in group circle time","Tolerated handpainting for 5 minutes","Used headphones proactively","Ate full lunch in cafeteria"],
      },
    },
    {
      child: jordan,
      spec: {
        behaviors: ["Panic attack during class presentation","Avoidance of cafeteria due to crowd anxiety","Reassurance-seeking behavior","Refused to answer question in class","Physical symptoms before school","Difficulty sleeping before exam","Catastrophic thinking about test outcome"],
        strategies: ["Grounding technique (5-4-3-2-1) practiced","Breathing exercise (4-7-8) used","Thought record completed","Exposure step attempted","Safety plan reviewed","Parent communication initiated","Scheduled worry time established"],
        wins: ["Ate lunch in cafeteria without leaving early","Answered one question in class voluntarily","Panic attack duration under 10 minutes","Used grounding exercise independently","Completed exposure step 3 on hierarchy"],
      },
    },
    {
      child: alex,
      spec: {
        behaviors: ["Interrupted peer conversation","Forgot to bring homework","Impulsive purchase decision","Difficulty starting large assignment","Lost track of time during project","Argumentative when corrected","Distracted during study session"],
        strategies: ["Pause-and-plan card reviewed","Chunking strategy applied","Planner review completed","Pomodoro timer set","Executive functioning coaching session","Parent check-in conducted","Preferred task used as reward"],
        wins: ["Submitted assignment on time","Used planner without prompting","Completed study session using timer","Requested help appropriately","Prioritized tasks using urgency matrix"],
      },
    },
    {
      child: eleanor,
      spec: {
        behaviors: ["Wandering episode (brief, returned safely)","Sundowning agitation at 5pm","Refused morning hygiene routine","Repeated same question 12 times in one hour","Verbally aggressive toward caregiver","Paranoid accusation (misplaced item)","Distress when family member left"],
        strategies: ["Reminiscence activity used to redirect","Bright light therapy session","Familiar music played during ADLs","Calm verbal reassurance provided","Routine maintained without deviation","Snack and hydration offered","Caregiver practiced validation approach"],
        wins: ["Completed morning routine with minimal prompting","Participated in reminiscence activity (30 min)","Recognized caregiver by name","Ate full meal without redirection","Slept 7 consecutive hours"],
      },
    },
    {
      child: james,
      spec: {
        behaviors: ["Reduced sleep (4 hours reported)","Increased spending impulse","Racing thoughts reported","Irritability with family member","Missed morning medication","Withdrew from social activity","Negative thought spiral about work"],
        strategies: ["Social rhythm check-in completed","Crisis plan reviewed","Medication reminder established","Behavioral activation task assigned","Mood log reviewed with clinician","Caregiver coaching provided","Thought record completed"],
        wins: ["Maintained sleep schedule 5 of 7 nights","Attended therapy session proactively","Completed social rhythm tracking","Reached out to support person during low mood","Declined alcohol at social event"],
      },
    },
  ];

  for (const { child, spec } of allClients) {
    await insertProgressData(child.id, clinicianId, spec);
    console.log(`   ✓ Progress data generated for ${child.id}`);
  }

  console.log("\n🎉  Seed complete!\n");
  printCredentials();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
