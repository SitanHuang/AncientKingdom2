const GOV_ADVISORS_PER_CIV = 5;
const GOV_COURT_SIZE = 45;

const GOV_POSITIONS = {
  BUREAUCRAT: 1,
  ADVISOR: 2,
  LEADER: 3
}

function gov_exec(civ, civName) {
  if (!civ.gov) 
    gov_init(civ, civName);

  // TODO: sum modifiers
  
  gov_age_spawn_death();
}

function gov_init(civ, civName) {
  civ.gov = {
    persons: {}, // personID: person
    leader: person_add(civ, { pos: GOV_POSITIONS.LEADER }), // personID
    advisors: {} // personID: 1
  };
}

function gov_age_spawn_death(civ) {
  // TODO
  // increase age, check death
  // spawn
}