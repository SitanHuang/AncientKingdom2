const GOV_FAMILIES_PER_CIV = 10; // exclusive

const GOV_PERSON_MODS_AI_STRATS = {
  desc: (a, b) => b - a, // higher is better
  asc: (a, b) => a - b // lower is better
};


// all relative +-%
const GOV_PERSON_MODS = {
  "MILITARY": [
    { // done
      id: "MUKCT",
      name: "Upkeep cost",
      min: -0.20,
      max: 0.05,
      ai: 'asc'
    }, { // done
      id: "MMVCT",
      name: "Movement cost",
      min: -0.20,
      max: 0.03,
      ai: 'asc'
    }, {
      id: "MCCCT",
      name: "Combat strength",
      min: -0.08,
      max: 0.50,
      ai: 'desc'
    },
  ],
  "POPULATION": [
    { // done
      id: "PPPGR",
      name: "Population growth",
      min: -0.02,
      max: 0.10,
      ai: 'desc'
    }, { // done
      id: "PDSCR",
      name: "Disaster chance",
      min: -0.25,
      max: -0.02,
      ai: 'asc'
    }, { // done
      id: "PIMHR",
      name: "Unhappiness from immigration",
      min: -0.50,
      max: 0.10,
      ai: 'asc'
    }, { // done
      id: "PUOFC",
      name: "Urban overflow cost",
      min: -0.25,
      max: 0.05,
      ai: 'asc'
    },
  ],
  "ECONOMY": [
    { // done
      id: "EDPIG",
      name: "Deposit interest",
      min: -0.05,
      max: 0.20,
      ai: 'desc'
    }, { // done
      id: "EDPMX",
      name: "Deposit cap",
      min: -0.05,
      max: 0.20,
      ai: 'desc'
    }, { // done
      id: "EGRVG",
      name: "Revenue gain",
      min: -0.08,
      max: 0.10,
      ai: 'desc'
    }, { // done
      id: "EFNPG",
      name: "Finance center growth rate",
      min: 0.02,
      max: 0.50,
      ai: 'desc'
    }, { // done
      id: "EHPGR",
      name: "Happiness growth",
      min: -0.04,
      max: 0.20,
      ai: 'desc'
    },
  ],
  "POLITICAL": [
    { // done
      id: "OMVPC",
      name: "Movement political cost",
      min: -0.20,
      max: 0.30,
      ai: 'asc'
    }, { // done
      id: "OPPGN",
      name: "Political power gain",
      min: -0.08,
      max: 0.16,
      ai: 'desc'
    }, { // done
      id: "OPPCP",
      name: "Political power cap",
      min: -0.08,
      max: 0.20,
      ai: 'desc'
    }, { // done
      id: "ORBRD",
      name: "Rebel chance per round",
      min: -0.25,
      max: 0.05,
      ai: 'asc'
    }, { // done
      id: "OFRHS",
      name: "Foreign hostility",
      min: -0.60,
      max: 1.50,
      ai: 'asc'
    }, { // done
      id: "OSTOI",
      name: "Schools research speed",
      min: -0.10,
      max: 0.25,
      ai: 'desc'
    }, { // done
      id: "OPROP",
      name: "Political research output",
      min: -0.10,
      max: 0.25,
      ai: 'desc'
    },
  ],
};

const GOV_PERSON_MODS_BY_ID = {};
Object.values(GOV_PERSON_MODS).flat().forEach(x => GOV_PERSON_MODS_BY_ID[x.id] = x);

const GOV_PERSON_MODS_IDS = Object.keys(GOV_PERSON_MODS_BY_ID);

function person_mod_rval(mid, val) {
  const mod = GOV_PERSON_MODS_BY_ID[mid];

  const range = Math.abs(mod.max - mod.min);
  const min = Math.min(mod.max, mod.min);

  const rval = (val - min) / range;
  return mod.ai == 'asc' ? 1 - rval : rval;
}

function person_mod_value(mid, val) {
  const mod = GOV_PERSON_MODS_BY_ID[mid];
  if (mod.ai == 'asc') {
    return val / mod.min;
  }
  return val / mod.max;
  // let range = Math.abs(mod.max - mod.min);
  // let min = Math.min(mod.max, mod.min);

  // // lower is better -> above zero is bad
  // if (mod.ai == 'asc') {
  //   if (val > 0) // bad (mod.max > 0 is a given)
  //     return 1 - val / mod.max;
  //   // val < 0
  //   let max = Math.min(mod.max, 0);
  //   range = Math.abs(max - mod.min);
  //   min = Math.min(max, mod.min);
  //   return -(val - max) / range;
  // }

  // // higher is better -> below zero is bad
  // if (val < 0) // bad (mod.min < 0 is a given)
  //   return 1 - val / mod.min;
  // // val > 0
  // min = Math.max(0, mod.min);
  // range = Math.abs(mod.max - min);
  // return (val - min) / range;
}

function person_tot_mod_value(person) {
  let val = 0;
  for (const mid in person.mods)
    val += person_mod_value(mid, person.mods[mid]);
  return val;
}

function person_add(civ, src) {
  let person = person_gen(src);
  civ.gov.persons[person.id] = person;
  return person.id;
}

function person_remove(civ, pid) {
  delete civ.gov.persons[pid];
  delete civ.gov.advisors[pid];
}

function person_dispmods(p, deli) {
  let mods = Object.keys(p.mods)
    .sort((a, b) => (
      person_mod_value(b, p.mods[b]) -
      person_mod_value(a, p.mods[a])
    ));
  
  let s = [];

  for (const mid of mods) {
    const val = p.mods[mid];
    const mod = GOV_PERSON_MODS_BY_ID[mid];

    s.push(`${mod.name}: ${val > 0 ? '+' : ''}${Math.round(val * 1000) / 10}%`);
  }
  return s.join(deli);
}

function person_dispname(civ, pid) {
  let p = civ;
  if (pid)
    p = civ.gov.persons[pid];
  return p.name + ' of F' + p.family;
}

function person_disprole(civ, pid) {
  let p = civ;
  if (pid)
    p = civ.gov.persons[pid];
  return ['Bureaucrat', 'Advisor', 'Leader'][p.pos - 1];
}

function person_death_chance(age) {
  return Math.exp((age - 160) / 50) / 4;
}

function person_successor_score(leader, person) {
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

function person_gen(src={}) {
  // const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let person = Object.assign({
    family: Math.random() * GOV_FAMILIES_PER_CIV | 0,
    name: GOV_PERSONS_NAMES[Math.random() * GOV_PERSONS_NAMES.length | 0]
        /* + ' ' + chars[Math.random() * chars.length | 0] + '.'*/,
    influence: Math.random() + 0.5, // 0.5 - 1.5
    opinion: Math.random() + 0.5, // 0.5 - 1.5
    mods: {},
    age: Math.random() * 50 | 0 + 18 + Math.random(), // 18 - 58
    pos: GOV_POSITIONS.BUREAUCRAT,
    id: Math.random(),
  }, src);

  // "2 modifiers of one area, and 1 mod in another"
  let categories = Object.values(GOV_PERSON_MODS).sort(() => Math.random() - 0.5);
  let category = categories[0].sort(() => Math.random() - 0.5);
  let mod = category[0];
  person.mods[mod.id] = _person_gen_mod(mod);
  mod = category[1];
  person.mods[mod.id] = _person_gen_mod(mod);
  category = categories[1].sort(() => Math.random() - 0.5);
  mod = category[0];
  person.mods[mod.id] = _person_gen_mod(mod);

  person._mval = person_tot_mod_value(person);

  return person;
}

function _person_gen_mod(mod) {
  const range = Math.abs(mod.max - mod.min);
  const min = Math.min(mod.max, mod.min);
  return Math.random() * range + min;
}