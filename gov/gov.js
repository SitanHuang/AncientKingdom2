const GOV_ADVISORS_PER_CIV = 5;
const GOV_COURT_SIZE = 40 + GOV_ADVISORS_PER_CIV; // excluding only leader, total 46

const GOV_POSITIONS = {
  BUREAUCRAT: 1,
  ADVISOR: 2,
  LEADER: 3
}

function gov_exec(civ, civName) {
  const gov = civ.gov;

  gov_refresh(civ, civName);

  // TODO: cohesion should affect some civ stats

  _gov_age_spawn_death(civ, civName, gov);

  gov_refresh(civ, civName);

  const leader = gov.persons[gov.leader];
  if (civ.culture) {
    leader.culture = leader.culture ?? civ.culture;
  }
  civ.culture = leader.culture;
}

function gov_refresh(civ, civName) {
  const gov = civ.gov;
  // sum modifiers
  _gov_sum_modifiers(gov);

  // calc cohesion
  _gov_calc_cohesion(gov);
}

function gov_init(civ, civName) {
  civ.gov = {
    persons: {}, // personID: person
    leader: null, // personID
    advisors: {}, // personID: 1
    mods: {},
  };

  civ.gov.leader = person_add(civ, { pos: GOV_POSITIONS.LEADER });

  gov_refresh(civ, civName);
}

function _gov_sum_modifiers(gov) {
  gov.mods = {};
  GOV_PERSON_MODS_IDS.forEach(x => gov.mods[x] = 0);
  Object.values(gov.persons).forEach(p => {
    if (p.pos == GOV_POSITIONS.BUREAUCRAT)
      return;
    for (const mod in p.mods)
      gov.mods[mod] += p.mods[mod];
  });
}

function _gov_calc_cohesion(gov) {
  let coh = 1;
  let inf = 0;

  Object.values(gov.persons).forEach(p => {
    if (p.pos == GOV_POSITIONS.LEADER)
      return;

    inf += p.influence;
    coh += p.influence * p.opinion;
  });

  return gov.cohesion = Math.min(coh / inf, 2);
}

function _gov_trigger_succession(civ, gov) {
  civ.rchance *= 1.5;
  civ.rchance += 0.05;

  let leader = gov.persons[gov.leader];

  let successor = Object.values(gov.persons)
                    .sort((a, b) =>
                      person_successor_score(leader, b) -
                      person_successor_score(leader, a))[0];

  person_remove(civ, gov.leader);

  gov_demote_to_bureaucrat(gov, successor);

  // on top of the demotion debuffs
  if (successor.family != leader.family) {
    gov_propagate_opinion(gov, leader, -0.7 * Math.random());
  }

  // undo the loss from demotion
  gov_propagate_opinion(gov, successor, 0.15 * Math.random());
  gov_propagate_influence(gov, successor, 0.1 - Math.random());

  successor.pos = GOV_POSITIONS.LEADER;
  gov.leader = successor.id;
}

function gov_demote_to_bureaucrat(gov, person) {
  if (!person?.id)
    person = gov.persons[person];

  person.pos = GOV_POSITIONS.BUREAUCRAT;
  delete gov.advisors[person.id];

  gov_propagate_opinion(gov, person, -0.25 * Math.random());
  gov_propagate_influence(gov, person, -0.1 - Math.random());

  return true;
}

function gov_promote_to_advisors(gov, person) {
  if (!person?.id)
    person = gov.persons[person];

  if (person.pos != GOV_POSITIONS.BUREAUCRAT)
    return false;

  person.pos = GOV_POSITIONS.ADVISOR;
  gov.advisors[person.id] = 1;

  gov_propagate_opinion(gov, person, 0.25 * Math.random());
  gov_propagate_influence(gov, person, 0.1 + Math.random());

  return true;
}

// without propagation
function gov_batch_mod_opinion(gov, cond, delta) {
  const leader = gov.persons[gov.leader];

  Object.values(gov.persons).forEach(x => {
    if (x.pos == GOV_POSITIONS.LEADER)
      return;

    let d = delta;
    if (x.family == leader.family && delta < 0)
      d *= Math.random() / 2;

    if (cond(x))
      x.opinion += d * 2 * Math.random();
  });
}

// influence change of family reflects upon change of individual
function gov_propagate_influence(gov, person, delta) {
  person.influence += delta;

  Object.values(gov.persons).forEach(x => {
    if (x.family == person.family)
      x.influence += delta / 10;
  });
}

// opinion change of family reflects upon change of individual
function gov_propagate_opinion(gov, person, delta) {
  if (person.opinion > 1)
    person.opinion += delta / 3;
  else
    person.opinion += delta;

  Object.values(gov.persons).forEach(x => {
    if (x.family == person.family) {
      if (x.opinion > 1)
        x.opinion += delta / 5 * person.influence / 3;
      else
        x.opinion += delta / 5 * person.influence;
    } else {
      // other families get slightly opposite deltas
      if (x.opinion > 1)
        x.opinion -= delta / 10 * person.influence;
      else
        x.opinion -= delta / 10 * person.influence / 3;
    }
  });
}

function gov_family_avg_opinion(gov, family) {
  let coh = 1;
  let inf = 0;

  Object.values(gov.persons).forEach(p => {
    if (p.pos == GOV_POSITIONS.LEADER ||
        p.family != family)
      return;

    inf += p.influence;
    coh += p.influence * p.opinion;
  });

  return Math.min(coh / inf, 2);
}

function _gov_age_spawn_death(civ, civName, gov) {
  let leader = gov.persons[gov.leader];
  let advisors = Object.keys(gov.advisors).map(x => gov.persons[x]);
  let currentSize = Object.keys(gov.persons).length;
  for (; currentSize < GOV_COURT_SIZE + 1; currentSize++) {
    person_add(civ, {
      pos: GOV_POSITIONS.BUREAUCRAT,
      family: Math.random() < 0.2 ?
        leader.family :
        (
          Math.random() < 0.4 && advisors.length ?
            advisors[Math.random() * advisors.length | 0].family :
            Math.random() * GOV_FAMILIES_PER_CIV | 0
        )
    });
  }

  const familyAvgs = {};

  Object.values(gov.persons).forEach(p => {
    // influence naturally increase
    p.influence += (Math.random() - 0.3) / 50;
    // opinion naturally fluctuates
    p.opinion += (Math.random() - 0.65) / 50;

    // opinion increases if in position of power
    if (p.pos == GOV_POSITIONS.ADVISOR && p.opinion < 1.1)
      p.opinion += (Math.random()) / 50;

    // opinion drifts to family average but inverse to own influence
    let familyAvg = familyAvgs[p.family];
    if (!familyAvg) {
      familyAvg = familyAvgs[p.family] = gov_family_avg_opinion(gov, p.family);
    }
    if (familyAvg) {
      const diff = familyAvg - p.opinion;
      p.opinion += diff / p.influence * Math.random() / 100;
    }

    if (Math.random() < person_death_chance(p.age += 0.25)) {
      p.pos == GOV_POSITIONS.LEADER ?
        _gov_trigger_succession(civ, gov) :
        person_remove(civ, p.id);

      if (p.pos == GOV_POSITIONS.LEADER || (!civ.ai && p.pos == GOV_POSITIONS.ADVISOR))
        push_msg(
          person_disprole(p) + ' ' + person_dispname(p) + ' of ' + civName +
          ' has passed away at the age of ' + (p.age | 0) +
          ' (' + person_dispmods(p, ', ') + ')' + '.', [civName]
        );

      return;
    }

    if (p.pos == GOV_POSITIONS.LEADER && gov._abdicate) {
      delete gov._abdicate;
      _gov_trigger_succession(civ, gov);
      push_msg(person_disprole(p) + ' ' + person_dispname(p) + ' of ' + civName + ' has abdicated at the age of ' + (p.age | 0) + '.', [civName]);
    }
  });
}