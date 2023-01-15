function getOrReturn(row, col, callback, allowNull) {
    if (data[row] && (data[row][col] || (allowNull && typeof data[row][col] != 'undefined')))
        callback(data[row][col], row, col)
}

function getNeighbors(row, col, callback, allowNull) {
    getOrReturn(row - 1, col, callback, allowNull);
    getOrReturn(row + 1, col, callback, allowNull);
    getOrReturn(row, col - 1, callback, allowNull);
    getOrReturn(row, col + 1, callback, allowNull);
}

function getNeighbors8(row, col, callback, allowNull) {
    getOrReturn(row - 1, col, callback, allowNull);
    getOrReturn(row + 1, col, callback, allowNull);
    getOrReturn(row, col - 1, callback, allowNull);
    getOrReturn(row, col + 1, callback, allowNull);
    getOrReturn(row + 1, col + 1, callback, allowNull);
    getOrReturn(row - 1, col - 1, callback, allowNull);
    getOrReturn(row + 1, col - 1, callback, allowNull);
    getOrReturn(row - 1, col + 1, callback, allowNull);
}

function shuffle(a) {
    var j, x, i;
    for (i = a.length; i; i--) {
        j = Math.floor(Math.random() * i);
        x = a[i - 1];
        a[i - 1] = a[j];
        a[j] = x;
    }
}

function iterateMathRandom(callback) {
    var list = [];
    if (Math.random() < 0.3)
        for (var row = 0;row < data.length;row++) {
            var rowData = data[row];
            for (var col = 0;col < rowData.length;col++) {
                list.push([row, col]);
            }
        }
    else
        for (var col = 0;col < data[0].length;col++) {
            for (var row = 0;row < data.length;row++) {
                list.push([row, col]);
            }
        }
    if (Math.random() < 0.2)
        shuffle(list);
    else if (Math.random() < 0.55)
        list = list.reverse();
    list.forEach(function (x) {
        if (callback) callback(x[0], x[1])
    });
    return list;
}

function getAllUnits(color) {
    var list = [];
    if (Math.random() < 0.3)
        for (var row = 0;row < data.length;row++) {
            var rowData = data[row];
            for (var col = 0;col < rowData.length;col++) {
                var land = rowData[col];
                if (land && land.color && land.color == color) {
                    list.push({
                        row: row,
                        col: col,
                        land: land
                    });
                }
            }
        }
    else
        for (var col = 0;col < data[0].length;col++) {
            for (var row = 0;row < data.length;row++) {
                var land = data[row][col];
                if (land && land.color && land.color == color) {
                    list.push({
                        row: row,
                        col: col,
                        land: land
                    });
                }
            }
        }
    if (Math.random() < 0.2)
        shuffle(list);
    else if (Math.random() < 0.55)
        list = list.reverse();
    return list;
}

Math.dist = function(x1,y1,x2,y2){
  if(!x2) x2=0;
  if(!y2) y2=0;
  return Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1));
}

function findNearbyCitiesOfLargestCiv(source, color, target) {
    let cities = [];
    for (let row = 0;row < data.length;row++) {
        for (let col = 0;col < data[0].length;col++) {
            let land = data[row][col];
            if (land
                && land.color == target
                && land.type
                && land.type.draw.toString() != types.land.draw.toString()
                && !land.type.val) {
                    cities.push([row, col]);
                }
        }
    }
    let limit = Math.floor(cities.length * (Math.random() * 0.4 + 0.1));
    if (civs[color].happiness < 80)
      limit *= 1.1;
    else if (civs[color].happiness < 50)
      limit *= 1.1;
    let count = 0;
    let capitals = [];
    cities.sort((x, y) => {
        let d1 = Math.dist(x[0], x[1], source[0], source[1]);
        let d2 = Math.dist(y[0], y[1], source[0], source[1]);
        return d1 - d2 + Math.random();
    }).forEach(x => {
        if (count++ > limit)
            return;
        let x1 = data[x[0]][x[1]];
        if (x1) {
            civs[x1.color].ii--;
            x1.color = color || civOrders[i];
            // delete x1._oct;
            // delete x1._oldcolor;
            civs[x1.color].ii++;
            capitals.push([x, x1]);
        }
        getNeighbors(x[0], x[1], (xx1, row, col) => {
            if (xx1 && xx1.color && xx1.type) {
                civs[xx1.color].ii--;
                xx1.color = color || civOrders[i];
                // delete xx1._oct;
                // delete xx1._oldcolor;
                civs[xx1.color].ii++;
            }
        })
    });
    let b = civs[color].birth;
    if (!b || data[b[0]][b[1]]?.color != color) {
        let x = capitals.sort((a, b) => b[1].pop - a[1].pop)[0];
        if (!x || !x[1]) return;
        x[1].type = types.capital;
        delete x[1]._oct;
        delete x[1]._oldcolor;
        civs[color].birth = x[0];
    }
}
