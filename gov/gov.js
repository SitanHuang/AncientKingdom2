const GOV_ADVISORS_PER_CIV = 5;
const GOV_COURT_SIZE = 45; // excluding only leader, total 46

const GOV_POSITIONS = {
  BUREAUCRAT: 1,
  ADVISOR: 2,
  LEADER: 3
}

function gov_exec(civ, civName) {
  const gov = civ.gov;

  // sum modifiers
  _gov_sum_modifiers(gov);

  _gov_age_spawn_death(civ, civName, gov);
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

function _gov_successor_score(leader, person) {
  if (person.pos == GOV_POSITIONS.LEADER)
    return -Infinity;

  let score = person.age;
  if (leader.family == person.family)
    score += 500;
  if (person.pos == GOV_POSITIONS.ADVISOR)
    score += 500 + person.influence;
  else
    score += person.influence;

  return score;
}

function _gov_trigger_succession(civ, gov) {
  // TODO: increase rebel chance

  let leader = gov.persons[gov.leader];

  let successor = Object.values(gov.persons)
                    .sort((a, b) => 
                      _gov_successor_score(leader, b) - 
                      _gov_successor_score(leader, a))[0];

  person_remove(civ, gov.leader);

  successor.pos = GOV_POSITIONS.LEADER;
  gov.leader = successor.id;
}

function _gov_age_spawn_death(civ, civName, gov) {
  let leader = gov.persons[gov.leader];
  let advisors = Object.keys(gov.advisors).map(x => gov.persons[x]);
  let currentSize = Object.keys(gov.persons).length;
  for (; currentSize < GOV_COURT_SIZE + 1; currentSize++) {
    person_add(civ, {
      pos: GOV_POSITIONS.BUREAUCRAT,
      family: Math.random() < 0.4 ?
        Math.random() * GOV_FAMILIES_PER_CIV | 0 :
        (
          Math.random() < 0.4 && advisors.length ?
            advisors[Math.random() * advisors.length | 0].family :
            leader.family
        )
    });
  }

  Object.values(gov.persons).forEach(p => {
    if (Math.random() < person_death_chance(p.age++)) {
      p.pos == GOV_POSITIONS.LEADER ?
        _gov_trigger_succession(civ, gov) :
        person_remove(civ, p.id);

      if (p.pos == GOV_POSITIONS.LEADER || (!civ.ai && p.pos == GOV_POSITIONS.ADVISOR))
        push_msg(person_disprole(p) + ' ' + person_dispname(p) + ' of ' + civName + ' has passed away at the age of ' + p.age + '.', [civName]);

      return;
    }
  });
}