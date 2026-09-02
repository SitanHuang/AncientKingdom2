function load_gamesave({
  localstorageKey=null,
  str=null,
}={}) {
  delete window.heatmap;

  str = localstorageKey ?? str;
  o = eval('o = ' + localStorage[localstorageKey]);
  showYear = o.showYear;
  data = o.data;
  popv2 = o.popv2;
  civs = o.civs;
  MESSAGES = o.msg || MESSAGES;
  AGGRESSIVENESS = o.agr || AGGRESSIVENESS;
  RCHANCEMOD = o.rmod || RCHANCEMOD;
  INCOMEMOD = o.imod || INCOMEMOD;
  MANDATE_THRESHOLD = o.mthre || MANDATE_THRESHOLD;
  civOrders = Object.keys(civs).sort();
  Object.values(civs)
  turn = o.turn || 0;
  showInfo();
  drawCanvas()
}