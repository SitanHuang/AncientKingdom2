function load_gamesave({
  localstorageKey=null,
  str=null,
}={}) {
  delete window.heatmap;

  var source = localstorageKey == null ? str : localStorage[localstorageKey];
  var o = eval('(' + source + ')');
  showYear = o.showYear || showYear;
  data = o.data;
  popv2 = o.popv2;
  civs = o.civs;
  military = o.military || {};
  MESSAGES = o.msg || MESSAGES;
  AGGRESSIVENESS = o.agr || AGGRESSIVENESS;
  RCHANCEMOD = o.rmod || RCHANCEMOD;
  INCOMEMOD = o.imod || INCOMEMOD;
  MANDATE_THRESHOLD = o.mthre || MANDATE_THRESHOLD;
  civOrders = Object.keys(civs).sort();
  turn = o.turn || 0;
  popv2_init();
  Military.init(military);
  Military.migrateLegacyCells();
  normalizeCellTypes();
  MilitaryUI.clearSelection();
  MilitaryUI.refresh();
  showInfo();
  drawCanvas()
}
