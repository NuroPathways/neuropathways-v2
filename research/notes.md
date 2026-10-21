# NeuroPathways Parent Activity Library — Research Notes

**Status:** complete  
**Depth:** Quick

## Plan

- **Question:** Which general, low-pressure parent-child activity patterns can be supported by published autism and caregiver-coaching research without copying curricula or treating a diagnosis as an individual plan?
- **Scope:** Communication, child-led play, visual predictability and transitions, daily-living participation, and caregiver preparation. Exclude individualized clinical protocols, exposure, coercion, restraint, and crisis procedures.
- **Audience:** NeuroPathways clinicians selecting original starter activities and parents seeing clearly labeled examples.
- **Deliverable:** A versioned, curated activity library with practical selection metadata, references, exclusions, and parent-facing instructions.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Parent-mediated communication and child-led play | done | 3 |
| 2 | Visual supports, predictability, and transitions | done | 3 |
| 3 | Parent coaching, functional communication, and safety boundaries | done | 4 |

## Coverage Checklist

- [x] Which parent-mediated practices support communication and shared play without requiring speech or eye contact?
- [x] What do the sources support about visual supports and predictable routines, and what are their limits?
- [x] How should activities preserve child choice, assent, pauses, and access to familiar communication?
- [x] Which daily-living examples can remain optional participation rather than compliance tests?
- [x] What context, required-information, exclusion, and risk metadata are needed to avoid unsafe generalization?
- [x] Which major claims have at least two independent Tier 1 or Tier 2 sources?

## Findings Log

_[@key] markers reference entries in research/sources.json._

### Parent-mediated communication and child-led play

Everyday routines and shared play can be contexts for parent-child interaction, but that does not establish efficacy for each activity template. The small Project ImPACT study observed parent and child changes in eight dyads; the More Than Words RCT reported no overall child-outcome effect, with subgroup findings needing replication; and a play scoping review mapped heterogeneous approaches without appraising their efficacy [@communication-play-01-project-impact] [@communication-play-02-more-than-words] [@communication-play-03-play-review]. The library therefore permits multiple communication modes and child-led/brief shared play but makes no speech, eye-contact, or outcome claim.

### Visual supports, predictability, and transitions

Home/community visual-support literature is heterogeneous and limited; accessibility, participation, individual fit, and caregiver information matter [@visual-transitions-01-home-community-scoping]. A 2025 TEACCH meta-analysis reported pooled adaptive-skill findings across varied studies/settings, with quality and reporting limitations [@visual-transitions-02-teacch-review]. A two-participant transition study found visual schedules alone did not reduce the studied behavior [@visual-transitions-03-transition-study]. The library treats visuals as optional familiar supports, never as a reason to force a transition.

### Parent coaching, functional communication, and safety boundaries

RUBI and Stepping Stones Triple P trials concern structured programs and enrolled populations, not the efficacy of a short standalone activity; RUBI parent-rated outcomes did not reach prespecified clinical-importance thresholds, and the Stepping Stones trial was small [@parent-coaching-01-rubi-rct] [@parent-coaching-02-stepping-stones-triple-p]. Parent-implemented FCT studies show potential but note fidelity and maintenance gaps [@parent-coaching-03-parent-implemented-fct-review]. The assent review supports ongoing choice and response to withdrawal as an ethical practice framework, not as a tested activity outcome [@parent-coaching-04-assent-safety-review].

## Conflicts & Open Questions

- Broad claims that visual schedules reliably prevent transition distress conflict with a small study in which schedules alone did not reduce the targeted behavior; the study is too small and narrow to generalize [@visual-transitions-03-transition-study].
- “Parent-mediated support works” is too broad: More Than Words showed no overall child-outcome effect, and RUBI's parent-rated outcomes did not meet prespecified clinical-importance thresholds, despite other positive findings [@communication-play-02-more-than-words] [@parent-coaching-01-rubi-rct].
- The fetched research does not establish effectiveness for NeuroPathways' original brief templates, nor does it validate any one activity for a specific child.

## Gaps

- The referenced NeuroPathways research report was not present among the attached workspace files; this implementation uses peer-reviewed publications and reviews instead.
- AAC-specific activity outcomes, family/cultural variation, and child assent/withdrawal outcomes were not comprehensively evaluated in these sources. Keep these as required personalization and safety checks, not as proven effects.
- Evidence for a short, generic starter activity library itself is not established; describe the library as research-informed design, not evidence-based treatment.

## Disposition

- Deduplicated source registry: `research/sources.json`; saved source captures are under `research/sources/`.
- Product-facing research summary: `research/neuropathways-parent-activity-library.md`.
- Research references appear in the clinician activity library with direct links and per-source limitations; the UI does not claim that an individual template is proven effective.
- Complete: all six coverage questions were evaluated. The evidence gaps above remain explicit limitations rather than being treated as resolved.
