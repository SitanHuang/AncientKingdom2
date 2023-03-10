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
  
  _gov_age_spawn_death(civ, civName, gov);
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
  // TODO: increase rebel chance

  // todo: update influence + opinion
  // todo: if different family -> big change to influence + opinion

  let leader = gov.persons[gov.leader];

  let successor = Object.values(gov.persons)
                    .sort((a, b) => 
                      person_successor_score(leader, b) - 
                      person_successor_score(leader, a))[0];

  person_remove(civ, gov.leader);

  gov_demote_to_bureaucrat(gov, successor);

  successor.pos = GOV_POSITIONS.LEADER;
  gov.leader = successor.id;
}

function gov_demote_to_bureaucrat(gov, person) {
  if (!person?.id)
    person = gov.persons[person];

  person.pos = GOV_POSITIONS.BUREAUCRAT;
  delete gov.advisors[person.id];

  // TODO: update influence & opinion

  return true;
}

function gov_promote_to_advisors(gov, person) {
  if (!person?.id)
    person = gov.persons[person];
  
  if (person.pos != GOV_POSITIONS.BUREAUCRAT)
    return false;
  
  person.pos = GOV_POSITIONS.ADVISOR;
  gov.advisors[person.id] = 1;

  // TODO: update influence & opinion

  return true;
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

  Object.values(gov.persons).forEach(p => {
    // influence naturally increase
    p.influence += (Math.random() - 0.3) / 100;

    if (Math.random() < person_death_chance(p.age += 0.25)) {
      p.pos == GOV_POSITIONS.LEADER ?
        _gov_trigger_succession(civ, gov) :
        person_remove(civ, p.id);

      if (p.pos == GOV_POSITIONS.LEADER || (!civ.ai && p.pos == GOV_POSITIONS.ADVISOR))
        push_msg(person_disprole(p) + ' ' + person_dispname(p) + ' of ' + civName + ' has passed away at the age of ' + (p.age | 0) + '.', [civName]);

      return;
    }
  });
}