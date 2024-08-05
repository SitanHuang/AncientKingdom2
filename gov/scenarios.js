function gov_opinion_aggressive_war(civ, civName, gov) {
  // military branch opinion increases
  gov_batch_mod_opinion(
    gov,
    x => (
      x.mods.MUKCT < 0 ||
      x.mods.MMVCT < 0 ||
      x.mods.MCCCT > 0
    ),
    0.15
  );

  // foreign experts opinion decreases
  gov_batch_mod_opinion(
    gov,
    x => x.mods.OFRHS < 0,
    -0.10
  );

  // general opinion decreases
  gov_batch_mod_opinion(
    gov,
    x => (
      x.mods.MUKCT < 0 ||
      x.mods.MMVCT < 0 ||
      x.mods.MCCCT > 0
    ),
    -0.07 - ((Math.max(0, 100 - civ.happiness) / 1500) || 0)
  );
}

// seen as bad omen
function gov_opinion_disaster(civ, civName, gov) {
  // general opinion decreases
  gov_batch_mod_opinion(
    gov,
    x => !x.mods.PDSCR, // except those with diaster mod
    -0.20
  );
}

function gov_opinion_rebel(civ, civName, gov) {
  // general opinion decreases
  gov_batch_mod_opinion(
    gov,
    x => true,
    -0.15
  );
}

// deposit/money < 0
// ->>>>> CAREFUL ai relies on legit < threshold to start fixing bankruptcy
function gov_opinion_bankrupt(civ, civName, gov) {
  const isAtWar = Object.values(civ.war || {}).filter(x => x > 0).length;
  if (civ.income < 100 || isAtWar || isNaN(civ.money) || isNaN(civ.deposit) || civ.newMoney > civ.oldMoney || gov.cohesion < 0)
    return;
  let deficit = Math.min(civ.money, civ.deposit) / civ.income;

  deficit = Math.atan(deficit) / 1.57 * 0.4;

  // general opinion decreases
  gov_batch_mod_opinion(
    gov,
    x => true,
    deficit
  );
}