const GOV_FAMILIES_PER_CIV = 10; // exclusive

const GOV_PERSON_MODS_AI_STRATS = {
  desc: (a, b) => b - a, // higher is better
  asc: (a, b) => a - b // lower is better
};


// all relative +-%
const GOV_PERSON_MODS = {
  "MILITARY": [
    {
      id: "MUKCT",
      name: "Upkeep cost",
      min: -0.50,
      max: 0.15,
      ai: 'asc'
    }, {
      id: "MMVCT",
      name: "Movement cost",
      min: -0.50,
      max: 0.15,
      ai: 'asc'
    }, {
      id: "MCCCT",
      name: "Combat strength",
      min: -0.40,
      max: 2.00,
      ai: 'desc'
    },
  ],
  "POPULATION": [
    {
      id: "PPPGR",
      name: "Population growth",
      min: -0.10,
      max: 0.25,
      ai: 'desc'
    }, {
      id: "PDSCR",
      name: "Disaster chance",
      min: -0.60,
      max: -0.10,
      ai: 'asc'
    }, {
      id: "PIMHR",
      name: "Unhappiness from immigration",
      min: -0.70,
      max: -0.10,
      ai: 'asc'
    },
  ],
  "ECONOMY": [
    {
      id: "EDPIG",
      name: "Deposit interest",
      min: -0.10,
      max: 1.00,
      ai: 'desc'
    }, {
      id: "EGRVG",
      name: "Revenue gain",
      min: -0.40,
      max: 0.30,
      ai: 'desc'
    }, {
      id: "EFNPG",
      name: "Finance center growth rate",
      min: 0.10,
      max: 0.80,
      ai: 'desc'
    }, {
      id: "EFNPG",
      name: "Happiness growth",
      min: -0.20,
      max: 0.80,
      ai: 'desc'
    },
  ],
  "POLITICAL": [
    {
      id: "OMVPC",
      name: "Movement political cost",
      min: -0.50,
      max: 1.50,
      ai: 'asc'
    }, {
      id: "OPPGN",
      name: "Political power gain",
      min: -0.40,
      max: 0.80,
      ai: 'desc'
    }, {
      id: "ORBRD",
      name: "Rebel chance per round",
      min: -0.10,
      max: 0.05,
      ai: 'asc'
    }, {
      id: "OFRHS",
      name: "Foreign hostility",
      min: -0.60,
      max: 1.50,
      ai: 'asc'
    }, {
      id: "OSTOI",
      name: "Schools research speed",
      min: -0.10,
      max: 0.50,
      ai: 'desc'
    },
  ],
};

const GOV_PERSON_MODS_BY_ID = {};
Object.values(GOV_PERSON_MODS).flat().forEach(x => GOV_PERSON_MODS_BY_ID[x.id] = x);

function person_add(civ, src) {
  let person = person_gen(src);
  civ.persons[person.id] = person;
  return person.id;
}

function person_remove(civ, pid) {
  delete civ.persons[pid];
  delete civ.advisors[pid];
}

function person_death_chance(age) {
  return Math.exp((age - 300) / 70);
}

function person_gen(src={}) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let person = Object.assign({
    family: Math.random() * GOV_FAMILIES_PER_CIV | 0,
    name: GOV_PERSONS_NAMES[Math.random() * GOV_PERSONS_NAMES.length | 0] +
        ' ' + chars[Math.random() * chars.length | 0] + '.',
    influence: Math.random() + 0.5, // 0.5 - 1.5
    opinion: Math.random() + 0.7, // 0.7 - 1.7
    mods: {},
    age: Math.random() * 50 | 0 + 18, // 18 - 58
    pos: GOV_POSITIONS.BUREAUCRAT,
    id: Math.random(),
  }, src);

  // "2 modifiers of one area, and 1 mod in another"
  let categories = Object.values(GOV_PERSON_MODS).sort(() => Math.random() - 0.5);
  [0, 0, 1].forEach(i => {
    let category = categories[i];
    let mod = category[Math.random() * category.length | 0];
    person.mods[mod.id] = _person_gen_mod(mod);
  });

  return person;
}

function _person_gen_mod(mod) {
  const range = Math.abs(mod.max - mod.min) + 1;
  const min = Math.min(mod.max, mod.min);
  return Math.random() * range + min;
}