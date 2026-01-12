_dynastyData = [[null, 0]];
MANDATE_THRESHOLD = 0.55;

_dynastyPopReq = Infinity;
_dynastyIncReq = Infinity;

function dynasty_get_mandate() {
  let mandate = civOrders.filter(x => !isNaN(civs[x].mandate))[0] || null;

  let lastEntry = _dynastyData[_dynastyData.length - 1];
  if (lastEntry[0] != mandate) {
    _dynastyData.push([lastEntry[0], turn - 1]);
    _dynastyData.push([mandate, turn]);
  }

  return mandate;
}

function dynasty_decay_func(civ, deduct=0.9) {
  let y = civ.years || 0;
  y -= 50;
  // 1-0.9\left(\max\left(0,\min\left(1,\frac{x}{200}\right)\right)\right)\left(\max\left(0,\min\left(1,\frac{x}{300}\right)\right)\right)\cdot\left(3-2\left(\max\left(0,\min\left(1,\frac{x}{200}\right)\right)\right)\right)
  return 1 - deduct * Math.max(0, Math.min(1, y / 200)) * Math.max(0, Math.min(1, y / 300)) * (3 - 2 * Math.max(0, Math.min(1, y / 200)));
};

function dynasty_assign_candidate() {
  // every year
  if (turn <= 10 ||
    Math.floor(turn / civOrders.length) != turn / civOrders.length ||
    // mandate held minimum 10 years
    turn - _dynastyData[_dynastyData.length - 1][1] < 10 * civOrders.length * 4) return;

  let civNames = [...civOrders].sort((a, b) => civs[b].pop - civs[a].pop);

  let totPop = 0;
  let totInc = 0;
  let prevCiv = null;
  let prevTurn = 0;

  for (let x of civNames) {
    let civ = civs[x];
    totPop += civ.pop || 0;
    totInc += civ.incomesRA || 0;

    if (civ.mandate) {
      prevCiv = x;
      prevTUrn = civ.mandate;
    }
  };

  let popReq = _dynastyPopReq = totPop * MANDATE_THRESHOLD + 1000;
  // let incReq = _dynastyIncReq = totInc * MANDATE_THRESHOLD * 0.7;
  let incReq = _dynastyIncReq = 0;

  // check new candidate
  for (let x of civNames) {
    let civ = civs[x];
    if (civ.pop > popReq && civ.incomesRA > incReq) {
      if (prevCiv && prevCiv != x)
        delete civs[prevCiv].mandate;
      if (!civ.mandate) {
        civ.years = 1;
        delete civ._aiAutoUntil;
        delete civ._aiAutoChoice;
      }
      civ.mandate = turn;
      return;
    }
  }

  // check old candidate
  if (prevCiv) {
    let factor = (turn - prevTurn) / civNames.length / 4; // years since last assigned mandate
    factor = Math.max(0.4, 1 - factor / 200);

    let civ = civs[prevCiv];
    if (civ.pop < popReq * factor || civ.incomesRA < incReq * factor)
      delete civ.mandate;
  }
}
