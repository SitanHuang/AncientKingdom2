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

function blocWar(list1, list2, years, override=false) {
    !list1.push && (list1 = list1.split(","));
    !list2.push && (list2 = list2.split(","));
    list1.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list2.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = years * 4 + 0.5;
        });
    });
}

function blocUnset(list1, list2, years) {
    !list1.push && (list1 = list1.split(","));
    !list2.push && (list2 = list2.split(","));
    list1.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list2.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            delete civ.war[cn2];
            delete civ2.war[cn];
        });
    });
}

function formPact(list, years, override=false) {
    !list.push && (list = list.split(","));
    list.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = -years * 4 - 6.5;
        });
    });
}

function formAlliance(list, years, override = false) {
    !list.push && (list = list.split(","));
    list.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = -years * 4 - 5;
        });
    });
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
    civs[name] = civ;
    civOrders = Object.keys(civs).sort();
    ai && (civs[name].ai = true);
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
