annex = function (owner, civName) {
    iterateMathRandom((row, col) => {
        let land = data[row][col];
        if (land && land.color == civName)
            land.color = owner
    });
    drawCanvas()
};
function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
function idealTextColor(bgColor) {

   var nThreshold = 105;
   var components = getRGBComponents(bgColor);
   var bgDelta = (components.R * 0.299) + (components.G * 0.587) + (components.B * 0.114);

   return ((255 - bgDelta) < nThreshold) ? "#000000" : "#ffffff";   
}

function getRGBComponents(color) {       

    var r = color.substring(1, 3);
    var g = color.substring(3, 5);
    var b = color.substring(5, 7);

    return {
       R: parseInt(r, 16),
       G: parseInt(g, 16),
       B: parseInt(b, 16)
    };
}
addCiv = function (name, ai, color) {
    let c = color || getRandomColor();
    let civ = {
        color: c,
        fontColor: idealTextColor(c),
        money: -1,
        technology: -1,
        politic: -1
    }
    ai && (civs[name].ai = true);
    civs[name] = civ;
    civOrders = Object.keys(civs).sort();
    showInfo();
}

function makeAlliance(civsList, years, variation) {
    civsList = civsList.split(",");
    years = Math.round(years || (35 * Math.random())) * 4;
    civsList.forEach(x => {
        let civ = civs[x];
        civ.war = civ.war || {};
        civsList.filter(y => y != x).forEach(y => {
            let civ2 = civs[y];
            civ2.war = civ2.war || {};
            civ.war[y] = civ2.war[x] = -years - 5 - Math.round(Math.random() * (variation || 0));
        });
    });
}