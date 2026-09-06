# Military system

The military system stores divisions separately from map cells. A cell keeps its
normal building type while any number of divisions can occupy the same tile.
Buildings have no inherent army: an undefended hostile building can be occupied
without a battle.

The implementation is split by responsibility:

- `state.js` owns serialized state, indexes, defaults, turn reset, building
  bonuses, and legacy migration.
- `recruitment.js` owns training queues, conscription, reinforcement from
  population growth, disbanding, upkeep, and desertion.
- `movement.js` owns access, pathfinding, move budgets, attack eligibility, and
  movement costs.
- `combat.js` owns combat power, casualties, experience, morale, retreat,
  capture, and battle consequences.
- `ai.js` is the common military planner used after either economic AI1 or AI2.
- `ui.js` and `ui.css` own selection, orders, recruitment controls, intelligence
  estimates, and map/unit overlays.

## Saved state

The global `military` object is saved beside `data`, `civs`, and `popv2`:

```js
military = {
  divisions: {
    d1: {
      id: "d1",
      civ: "China",
      name: "Jade Guard",
      row: 10,
      col: 12,
      manpower: 7200,
      maxManpower: 10000,
      experience: 1.08,
      morale: 0.9,
      entrenchment: 1.5,
      moveLimit: 5,
      movesRemaining: 3,
      pendingMovePenalty: 0,
      movedThisTurn: true,
      recoveredLastTurn: 120,
      recoveredThisTurn: 0
    }
  },
  queues: {
    q1: {
      id: "q1",
      civ: "China",
      name: "Bronze Spears",
      row: 8,
      col: 11,
      manpower: 2400,
      maxManpower: 10000,
      experience: 1,
      recoveredLastTurn: 200,
      recoveredThisTurn: 0
    }
  },
  civSettings: {
    China: {
      growthShare: 0.5,
      maxUpkeepShare: 1,
      factoryProductionShare: 1
    }
  },
  nextDivisionId: 2,
  nextQueueId: 2
};
```

There is intentionally no schema version. Loading fills missing fields with
current defaults and leaves unknown fields intact, so new properties can be
added without invalidating older saves.

### Legacy saves

Old cell types are serialized as copied objects, not references to `types`.
Loading therefore performs two compatibility steps:

1. A cell with a legacy military `type.val` becomes a division at that tile.
   Its underlying cell becomes normal land unless an underlying type was saved.
2. Every remaining serialized building type is identified by its current `id`,
   old `defend` value, or drawing function and replaced with the current
   canonical type object.

Pre-`popv2` saves also initialize their population structure before military
migration. Legacy `.val` and `.defend` are read only by these migration paths;
live gameplay does not use them.

## Population scale

All manpower and money conversions preserve the old small-country adjustment:

```text
men per legacy unit = 100 * (1 + civ.ii / 10)
legacy equivalent   = manpower / men per legacy unit
```

This conversion is used consistently for legacy migration, conscription cost,
upkeep, movement money cost, and battle-side economic effects.

## Recruitment and reinforcement

Every division and training queue has a fixed `maxManpower`. Its request is:

```text
requested manpower = max(0, maxManpower - manpower)
```

Positive population growth is offered to the military before it reaches the
civilian population. `growthShare` selects what fraction is available. Requests
are grouped by the civilization's current contiguous territory partition:

- A deployed division can receive only growth generated in its own partition.
- A queue belongs to the partition containing the currently calculated capital
  or supply center.
- Available growth is divided proportionally among all requests in that
  partition.
- A deployed division's yield applies the existing small-country scale:

  ```text
  recovery multiplier = 1 + 100 / men per legacy unit
  ```

  This is bounded at `2` for a zero-county country and approaches the one-man
  baseline as the country grows. After the normal 70% recovery factor, the
  smallest countries can therefore recover up to 1.4 men per assigned growth.
- A queue has a two-man base yield per assigned growth.
- Reinforcements joining a deployed division have `0.5` experience, blended
  with the experience of its existing manpower. Queue recruits retain their
  normal training experience.
- A deployed division's recovery chance also applies country scale:

  ```text
  country chance factor = clamp(0.5 + 300 / men per legacy unit, 0.5, 1)
  success chance        = 75% * country chance factor * local tax efficiency
  ```

  Countries through 50 counties retain the 75% baseline. The chance
  then declines smoothly with country size toward a 37.5% floor before local
  efficiency, preventing large countries from replenishing as reliably without
  making recovery negligible. Training queues retain their existing
  `75% * local tax efficiency` chance. A successful request receives 70% of its
  scaled yield.
- Successful deployed reinforcement adds all gained men to `nextDecline`;
  successful queue training adds half of its gained men.

Growth accumulates in `recoveredThisTurn`. At the start of the civilization's
next turn that value moves to `recoveredLastTurn`, where `showInfo` and unit
details can display it for one complete turn. A new accumulation then begins at
zero; this prevents both premature clearing and stale recovery values.

### Training queues

Creating a queue is free and begins at zero manpower. A queue pays upkeep for
the manpower already trained. It can be deployed at any time, including while
partially filled, and becomes a division at the civilization's current regional
capital/supply center. `Deploy all` deploys every non-empty queue and leaves
empty queues in training.

### Conscription

Conscription creates a division immediately on any owned tile:

```text
money cost       = legacy equivalent * 2
per-turn limit   = 10% of civ.pop
population use   = added to civ.nextDecline
population floor = at least 10% of civ.pop remains outside pending decline
```

If the requested amount exceeds a population limit, the created division uses
the available amount as both current and maximum manpower. The per-turn limit
resets when that civilization begins its next turn.

Disbanding a division or cancelling a queue returns its current manpower by
subtracting it from `nextDecline`.

## Upkeep and desertion

Each active division and training queue calculates upkeep independently from
the tax efficiency at its current tile:

```text
local efficiency = clamp(regions_taxEff(civ, row, col), 0.1, 1)
force scale      = max(1, (total military manpower / 550000) ^ 2)
unit upkeep      = unit legacy equivalent / 4
                   * max(0, 1 + gov.mods.MUKCT)
                   * force scale / local efficiency
civ upkeep       = sum of every unit and queue's upkeep
```

This makes forces in distant, detached, or poorly administered territory more
expensive while keeping capital-area upkeep at the existing baseline. Efficiency
cannot discount upkeep below that baseline, and the `0.1` floor caps the location
penalty at ten times. Training queues follow the current capital, so their upkeep
uses that capital tile's efficiency. Total military manpower includes both
deployed divisions and trained manpower still in recruitment queues. The force
scale remains `1` through 550,000 men, then grows quadratically for larger armies.

Upkeep runs after government, urban, deposit, and dynasty money deductions.
`maxUpkeepShare` controls how much remaining cash is available to it. If full
upkeep cannot be paid, every non-empty division and queue loses a fixed:

```text
min(current manpower, max(1000, current manpower * 10%))
```

Deserters return to population through `nextDecline`. Empty active divisions are
removed. The turn records needed upkeep, amount paid, funding ratio, deserters,
active manpower, and queued manpower on `civ.militaryUpkeep` for UI and AI use.

## Turns, movement, and access

At the start of a civilization's turn:

- Conscription used this turn resets to zero.
- A division that did not move gains `0.25` entrenchment, capped at `2`.
- Morale moves back toward its normal value of `1`.
- Movement normally resets to five tiles.
- A division attacked during the previous turn has a one-tile movement penalty,
  so it resets to four instead.
- Queues follow the currently calculated capital partition.

Orders execute immediately. Friendly and allowed allied movement uses
four-direction breadth-first pathfinding and costs no money or political power.
Each traversed tile consumes one move. When several selected divisions are
ordered, each division follows the route as far as its remaining movement
allows, stopping at the closest reachable point to the requested tile. Fully
exhausted divisions wait until their next turn. Player orders persist in each
division’s `moveTargets` queue and resume immediately after movement resets in
`beginTurn`. Blocked routes wait for access or political power to return. An
unsuccessful attack waits until the next turn before retrying. The low-level
`moveDivisions` and `attack` APIs remain immediate actions for AI callers.

`Military.setAlliedAccessResolver(fn)` is the extension point for allowing a
civilization's divisions into allied territory. Until a resolver is installed,
foreign non-enemy territory is blocked.

An attack can enter only an adjacent enemy tile and costs one remaining move.
The selected eligible stack pays the order cost once:

```text
political cost = 0.7 * max(0, 1 + gov.mods.OMVPC)
money cost     = legacy equivalent / 4 * max(0, 1 + gov.mods.MMVCT)
```

Foreign-culture and economic/population-dominance modifiers add the same extra
political, money, logistics, and defender compensation effects used by the old
system.

## Combat

Units defending one tile combine into one defensive stack. Base power is the
sum of each division's:

```text
manpower
* experience factor
* morale factor
* entrenchment (defense only)
* encirclement factor
* location factor
* civilization combat factors
```

Important factors are:

- Experience ranges from `1` to `4`; each point above one adds 25% to its
  factor.
- Morale ranges from `0.05` to `2` and affects combat effectiveness.
- Entrenchment ranges from `1` to `2` and applies only while defending.
- Encirclement loses 25% for each exposed adjacent side after the first, down to
  a 25% minimum.
- Reclaiming a tile whose `_oldcolor` matches the attacker has a `1.5` location
  factor; attacking other hostile territory has `0.75`.
- Defense includes the square root of `regions_defBonus` and the cell's building
  bonus. Buildings add defense only when divisions are present.
- Foreign dominant culture adds the previous cultural-defense modifier.
- Technology, `MCCCT`, happiness, political power/`OPPCP`, government cohesion,
  rebellion risk, and dynasty decay all feed civilization combat strength.

Casualties are intentionally bounded by the attacking stack's strength. A weak
attack against an overwhelming defense does not automatically annihilate the
attacker, and defender casualties cannot exceed the attackers' starting
manpower. Within a defending stack, losses are distributed in proportion to
each division's defensive power.

Both sides gain small amounts of experience from fighting. The power balance
moves attacker and defender morale in opposite directions.

### Entry attrition

Hostile entry can damage an attacking stack even when there is no defending
division:

- An undefended fort applies 8% of its building defense bonus as attrition.
- An undefended headquarters does the same. Building attrition is clamped to
  3–8%.
- A tile whose dominant culture differs from the invader applies 2.5%
  attrition, whether or not divisions defend it.
- Building and cultural attrition add together, capped at 15%.

Attrition is added to ordinary attacker casualties and is still capped by the
attacking stack's current manpower. Battle results expose the total as
`attritionLosses` and its building/culture breakdown as `attrition`.

### Retreat and capture

A surviving side retreats when the incoming power is at least `1.5` times its
own, average morale is at most `0.35`, or remaining manpower is at most 20% of
capacity.

Defenders retreat separately to adjacent owned tiles with the fewest divisions.
Occupancy is recalculated after each move, causing a retreating stack to spread
out. A defender with no valid retreat tile is encircled and removed. Retreating
units have no moves left and lose entrenchment.

If any defenders successfully retreat from a building, the building has a 75%
chance to be replaced by land. Population remains on the tile and decays through
the normal population system. An entered non-land building with no remaining
defenders also has a 25% chance to be removed. If no defenders remain and the
attackers did not retreat, the tile changes ownership and the attackers enter
it.

Battles also retain the prior population damage, happiness, logistics, treasury,
political, occupation, and small-country-collapse effects.

### Casualty reporting

Combat records actual manpower removed, including attrition, encirclement, and
combat-remnant removal. Each civilization tracks losses suffered and inflicted
for the current turn window. `beginTurn` moves those counters into the completed
window and starts new current counters. `Military.getCasualtyReport(civName)`
combines the completed window with any battles the player has already fought in
the current turn. `showInfo` displays both lost and inflicted totals when opened;
attacks refresh the military selection without opening the information panel. Upkeep desertion is reported separately and is
not counted as combat casualties.

## Military AI

Economic AI1 and AI2 both call `MilitaryAI.think`; neither contains a separate
combat implementation. The military planner runs once per civilization turn and
then immediately executes its moves.

The force target is derived from:

- border length and spaced defensive posts;
- visible neighboring forces and the neighbor's affordable mobilization
  potential;
- the relative population, income, and territory size of both countries;
- active wars;
- neutral relations, alliances, and non-aggression pacts;
- added risk as a pact or alliance approaches expiry;
- reserve requirements and threats to the capital;
- sustainable income, available cash, upkeep modifiers, population, and country
  size.

Peace uses 50% growth and at most 50% of cash for upkeep. War uses 100% growth
and at most 75% of cash for upkeep. Targets are additionally capped at 3% of
population in peace, 8% in war, 64 divisions, and a country-size division cap.

The AI trims forces it cannot maintain, deploys useful queues, creates queues to
fill sustainable long-term shortages, and uses immediate conscription for urgent
frontline or capital gaps. Conscription still obeys the normal 10% population
limit and money cost.

Stationing prioritizes enemy-occupied border tiles and fills unguarded gaps next
to hostile forces. Attack decisions use ground-truth combat power, favor enemy
occupied/strategic tiles, and recalculate the front after immediate movement so
later orders see the new map state.

`MilitaryAI.debug(civName)` exposes the last plan and actions for inspection.

## Player interface and intelligence

Left-clicking a tile selects all divisions on that tile. Shift-left-click adds
friendly units from other tiles without duplicates; every selected tile is outlined. Right-click sets a
persistent destination and moves each selected division as far as its remaining
points allow. Units stay selected even when their movement separates them.
Remaining travel resumes at the beginning of their civilization’s next turn.
Alt-right-click appends waypoints, visited in order. If it starts a new route,
that division waits until its next turn, even when it has movement points left.
Additional Alt waypoints preserve that delay; ordinary right-click
replaces the route. Right-clicking a unit’s current tile or any of its queued
targets cancels its whole route. Selected units show numbered target arrows.

Enemy waypoints must border friendly or accessible allied territory, or an
earlier queued enemy target, and be reachable through that planned corridor.
Units approach through accessible territory and attack as a stack when adjacent.
They cannot skip unplanned enemy tiles. Routes survive saving and loading.

Outside text inputs, `H` keeps the first half of the current unit selection
(rounding up) and `Escape` removes the last unit shown in the list. Repeated use
can narrow a large stack quickly. These shortcuts do nothing while an input,
textarea, select, or editable element has focus, so typing division names is not
interrupted.

The top-right list sits flush against the screen edge without a shadow and
follows the compact Rhine-style presentation:

- Each row shows the civilization icon and division name.
- The top ribbon buttons assign all selected friendly divisions to purple, red,
  blue, green, olive, orange, or charcoal armies; None removes the assignment.
  The summary above them shows each army’s division count, current/capacity
  manpower, attack, and defense across the active civilization, with strength
  bars scaled to the strongest army. Clicking a summary color or strength bar
  selects all units of that army across the civilization, including None for
  unmarked units. Unit rows and map markers show army colors.
  AI countries
  automatically assign their top 20% of divisions by experience to the red
  army (with morale and manpower as tie breakers).
- The green HP-style bar represents current morale/readiness, with normal morale
  (`1`) treated as full visual health.
- The orange bar represents current manpower divided by maximum manpower.
- Each compact row displays its current manpower directly (estimated for enemies).
- Hovering a friendly row previews its statistics. Left-click or Enter/Space
  selects only that division; Shift-left-click (or Shift-Enter/Space) toggles a
  row’s selection. Other rows stay visible for building a multi-unit selection.
  Right-click pins its detail popup. Compact stat and control icons have tooltips;
  the friendly summary includes both attack and defense.
- The `×` removes one division from the selection; disbanding is in the pinned
  detail panel.
- Enemy rows are passive and never expose per-division details.
- The combined stack summary remains visible for both friendly and enemy stacks.

Enemy division count is exact, but manpower, morale, attack, and defense are
estimates. Each range is seeded by tile, civilizations, statistic, and quarter.
The real value is deliberately placed away from the range midpoint, so the mean
does not reveal ground truth. Enemy list bars use the corresponding estimates
and contain no exact tooltip.

On the map, stack markers show division counts with up to four offset layers.
The optional manpower labels show aggregate men without replacing the underlying
building drawing. The `units?` button is the master switch for both markers and
manpower labels; the Military menu checkbox controls whether manpower is shown
while that layer is enabled.

## Integration order

The browser loads the modules in dependency order:

```text
state -> recruitment -> combat -> movement -> ai -> ui
```

Each backend module extends the same global `Military` object. Public gameplay
code should use the non-underscored methods. `_addDivision`, `_removeDivision`,
`_moveDivision`, and related methods are low-level operations intended for the
military modules, migration, scenario editing, and focused tests.

## Heavy equipment and factories

Heavy equipment abstracts mounts, armor, and heavy weapons without adding a
movement bonus. Divisions and training queues save `maxHeavyEquipment` and
`heavyEquipment`; missing fields default to zero. One point equips 100 men.
Configuration caps cannot exceed maximum manpower / 100, and carried equipment
cannot exceed the cap or current manpower / 100.

Civilization-level statistics live directly on `civs[civName]`:
`heavyEquipmentStock`, `deployedHeavyEquipment`, `queuedHeavyEquipment`,
`equipmentProduction`, `equipmentProductionTurn`, and `lastEquipmentBattle`.
Conscription and casualty counters also live on the civilization. The deployed
and queued equipment totals are derived from formations, and the stats table's
**Heavy Eq.** extra column shows deployed equipment only. Loading migrates old
military settings statistics onto the civilization, keeps an existing civilization
value authoritative, and removes the old copies to avoid duplicate stock.
Player policy controls (`growthShare`, `maxUpkeepShare`, and
`factoryProductionShare`) remain in `military.civSettings`. Recruitment and
conscription accept `opts.maxHeavyEquipment`; queue deployment preserves both
fields. `Military.setEquipmentCap(formationOrId, cap)` creates an automatic
request, never an immediate delivery.

At each civilization economy turn, owned terrain with population modifier below
0.4 and economic modifier above 0.8 has potential free output:

```text
2 + 8 * clamp((0.4 - popMod) / 0.22, 0, 1) * clamp(econMod - 1, 0, 1)
```

Actual free output is potential output multiplied by the ruling culture's share
of the cell's population (`popv2.map[row][col].pop`). A 25% share produces 25%
of potential output even when another culture is dominant. Unowned or empty
tiles, missing population data, and zero ruling-culture population produce zero.
Potential terrain output remains visible; tile details show the culture share
and actual free output. No scenario names, coordinates, map orientation, or
continent assumptions affect eligibility. Fractional quantities are retained.

Factories use the canonical `factory` type and draw 厂. They have town-level
population weight and defense, no money income, and ordinary building capture
and destruction behavior. Construction preserves existing tile data and requires
owned ordinary land. Prices use the actual current owned-tile count N:

```text
construction = 250 * (1 + (N / 200)^2)
operating    =   2 * (1 + (N / 100)^2) per factory per turn
full output  =  10 * local tax efficiency
```

The player's **Factory production %** setting ranges from 0 to 100 (default
100), scaling operating expense and factory output proportionally. Zero pauses
factories while retaining free terrain production. Factories share available
funding proportionally after reserving army upkeep, including this turn's possible
refill. Insufficient funds reduce output without creating debt. Costs are recorded
in the ordinary expense total; production is guarded against duplicate calls in
the same turn.

After production, divisions and queues on owned territory in the capital's
connected partition share stock proportionally to their requests. Each formation
receives at most 25% of current equipment capacity per turn. Isolated or invading
formations cannot refill. Cap reductions, disbanding, and queue cancellation
return equipment only when supplied. Combat casualties, entry attrition, and
desertion destroy equipment in proportion to manpower lost; destruction and
encirclement lose the entire remaining load.

Coverage is `equipment * 100 / manpower`, bounded to 0–1, and is also hardness.
Equipment adds `base formation upkeep * 0.5 * coverage`, including queues.
Stack hardness is manpower-weighted. With Δ = attacker hardness − defender
hardness, ordinary attacker casualties multiply by `1 - 0.5 * Δ` and defender
casualties by `1 + 0.5 * Δ`, before existing casualty caps. Equal hardness cancels;
full superiority gives +50% damage and −50% losses. Entry attrition and existing
power, retreat, morale, and movement calculations retain their original rules.
Battle reports expose the matchup and the military panel shows its modifiers.

The **Heavy equipment** map mode replaces **Econ * Pop**. Its fixed 0–10 scale
shows potential terrain output, with gray for nonresources and hatching for
inactive resources. Factories have separate 厂 markers and retain their glyph at every zoom level,
including the normal map where other buildings may collapse to dots. Hover or select a tile
for terrain eligibility and production details; only the player's factories
reveal actual funding/output. The mode stays tile-based under **By Country**.
Divisions above 50% hardness are classified as Heavy and use rhombus indicators.
At or below 50%, including empty equipment requests, they are Light and remain
square. This visual classification does not change the continuous combat bonuses.

The common AI keeps full equipment caps (up to 100% of manpower) on every
formation when it has free production, stock, or already-equipped troops. New
queues and supplied conscripts follow the same policy. Starting without any
equipment, it requests equipment for the strongest fifth to establish factory
demand. Requests remain stable: cash fluctuations, changes in elite ranking,
and forecast changes never automatically strip deployed equipment. Actual
upkeep, population limits, and force planning govern affordability instead.
Peacetime downsizing removes unequipped units first and preserves the last
funded deployed division, avoiding disband/recruit cycles that empty the army.

The eight-turn production forecast informs affordable recruitment and desired
army size, not a restriction on the proportion allowed to request equipment.
Availability can raise desired manpower by up to 25%, with existing population
and funding limits retained and heavy upkeep anticipated. The AI can dedicate
up to 75% of peacetime growth to military training and reinforcement, and create
up to three queues per turn when equipment is available. Equipment caps express
long-term requests, not reservations or promises of immediate delivery; actual
stock is distributed proportionally once per production turn.
At war it considers conscription sooner (below 90% rather than 75% of target),
can cover three urgent posts rather than two, and gives urgent conscription first
claim before new training queues. No unit receives instant equipment or bypasses
supply, cash, population, or upkeep limits. It adjusts factory output to demand, stock, terrain
production, and available income, pausing excess production. It builds at most
one factory per turn, with four turns of unmet demand, reserving one turn of army
upkeep plus two turns of factory costs. Total factory operating cost must fit
within 20% of available income. It uses hardness casualty advantage to rank
otherwise viable attacks, retaining the existing retreat/power safety threshold.

### Affordability calibration

Run `node military/balance-report.cjs` for a read-only report using current cost
helpers, or add `--json` for individual state records. The bundled saves include
359 state snapshots with income attributes across 21 scenarios; related saves
are not independent samples, and legacy rolling-income values may be stale.

| Owned tiles | Construction | Full operating cost / turn |
| --- | ---: | ---: |
| 100 | $312.50 | $4 |
| 422 | $1,363.03 | $37.62 |
| 459 | $1,566.76 | $44.14 |
| 700 | $3,312.50 | $100 |

In the saved 100–199-tile cohort, median income is about $145 and median
construction costs 2.6 turns of gross income. The two largest snapshots have
422 and 459 tiles and enough saved cash for construction. There are no 700-tile
snapshots, so tests additionally cover the user's 700-tile, $2,000 income,
$5,000 cash benchmark with a standing army. C3 has one initially productive
resource tile, belonging to Brown, yielding about 2.19 equipment per turn.
