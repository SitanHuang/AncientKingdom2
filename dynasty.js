_dynastyData = [[null, 0]];
MANDATE_THRESHOLD = 0.45;

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

function dynasty_assign_candidate() {
  // every year
  if (turn <= 10 ||
    Math.floor(turn / civOrders.length) != turn / civOrders.length ||
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
  let incReq = _dynastyIncReq = totInc * MANDATE_THRESHOLD + 200;

  // check new candidate
  for (let x of civNames) {
    let civ = civs[x];
    if (civ.pop > popReq && civ.incomesRA > incReq) {
      if (prevCiv)
        delete civs[prevCiv].mandate;
      civ.mandate = turn;
      return;
    }
  }

  // check old candidate
  if (prevCiv) {
    let factor = (turn - prevTurn) / civNames.length / 4; // years since last assigned mandate
    factor = Math.max(0.4, 1 - factor / 200);

    let civ = civs[prevCiv];
    if (civ.pop < popReq * factor && civ.incomesRA < incReq * factor)
      delete civ.mandate;
  }
}