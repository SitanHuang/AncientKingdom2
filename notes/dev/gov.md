# Government & Advisors System (Target: 2024 version)

- 1 leader, successor picked by oldest person with same family; if non,
  person with greatest influence in cabinet then bureaucracy is picked
- 5 cabinet level positions, 50% of total cohesion
- 45 bureaucrats (non-cabinet *persons*), 50% of total cohesion

- any leader/cabinet deaths are reported to player
- leader deaths are reported to world

- new persons spawn with increased chance of from same family as leader &
  cabinet members

## Cohesion
- calculated from weighted average of opinions by influence
- low cohesion increases chance of rebellions
- each rebellion takes away the person with most influence times inverse of opinion

## Persons

- can be advisors/leaders/bureaucrats
- has a *family* number (0-10) and *name*
- has age (14-death), death chance is inverse exponential decay
- has 2 modifiers of one area, and 1 mod in another
- has opinions
  - has initial value
  - changes with promotion/demotion of self
  - changes when promotion/demotion of family members
  - changes with leader succession
  - changes with territory loss/gain
  - changes with happiness
- has influence
  - has initial value
  - increases with age
  - changes based on position
  - changes with promotion/demotion of self
  - changes when promotion/demotion of family members
  - changes with leader succession

## Advisor/Leader
- leader can be abdicated
- part of the cabinet/leader that affects
  - country wide modifiers

### Modifiers
#### Military Branch
- regular upkeep cost
- movement monetary cost
- combat mod
- fort def mod

#### Population
- general pop growth
- natural disaster chance reduction
- natural disaster magnitude reduction
- immigration unhappiness reduction
- urban overflow reduction

#### Economy
- deposit interest gain
- general income gain
- financial center pop growth
- happiness growth

#### Political
- movement political cost
- political power gain
- rebellion chance flat % reduction per round
- foreign hostility reduction
- school tech output increase

## Opinions
- held by each person

### Attributes (maybe)
- war: +- op from aggressive war
- isolationist: +-op from alliance
