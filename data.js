var data;
var popv2;
var civs = {
    China: {
        color: '#DB4437',
        fontColor: '#ffffff',
        money: -1,
        technology: -1,
        politic: -1
    },
    Blue: {
        color: '#90caf9',
        fontColor: '#000000',
        money: -1,
        technology: -1,
        politic: -1
    },
    Green: {
        color: '#52b848',
        fontColor: '#000000',
        money: -1,
        technology: -1,
        politic: -1
    },
    Black: {
        color: '#000000',
        fontColor: '#ffffff',
        money: -1,
        technology: -1,
        politic: -1
    },
    Yellow: {
        color: '#ffe067',
        fontColor: '#000000',
        money: -1,
        technology: -1,
        politic: -1
    },
    Purple: {
        color: '#950095',
        fontColor: '#ffffff',
        money: -1,
        technology: -1,
        politic: -1
    },
    White: {
        color: '#f0f0f0',
        fontColor: '#000000',
        money: -1,
        technology: -1,
        politic: -1
    }
};

function randn_bm() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) return randn_bm() // resample between 0 and 1
    return num
}

var types = {
    capital: {
        id: 'capital',
        defenseBonus: 0.55,
        initialPopulationWeight: 55,
        strategicValue: 6,
        income: function (civ) {
            civ.politic += randn_bm() * 10;
            civ.money += randn_bm() * 55;
            civ.happiness += randn_bm() * 0.1 * (1 - civ.ii / data.length / data[0].length);
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("京", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    headquarter: {
        id: 'headquarter',
        defenseBonus: 0.75,
        initialPopulationWeight: 75,
        strategicValue: 4,
        income: function (civ) {
            civ.politic += randn_bm() * 2;
            civ.money -= randn_bm() * 5;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("统", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    land: {
        id: 'land',
        defenseBonus: 0,
        initialPopulationWeight: 1,
        strategicValue: 1,
        income: function (civ) {
            civ.politic -= randn_bm() / 55;
            civ.money += randn_bm() * 5;
        },
        draw: function () {
        }
    },
    finance: {
        id: 'finance',
        defenseBonus: 0.35,
        initialPopulationWeight: 35,
        strategicValue: 3,
        income: function (civ) {
            // civ.politic += randn_bm();
            civ.money += randn_bm() * 35;
            civ.happiness += Math.max(randn_bm() * 0.12 * (1 - civ.ii / data.length / data[0].length), 0.05);
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("经", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    school: {
        id: 'school',
        defenseBonus: 0.16,
        initialPopulationWeight: 16,
        strategicValue: 3,
        income: function (civ) {
            if (civ.money <= 0 || civ.politic <= 10) return;

            civ.politic -= randn_bm() / 2;
            civ.money -= randn_bm() * 30;
            civ.technology += Math.max(0.60 - civ.ii / data.length / data[0].length, 0.05) / 5;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("学", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    city: {
        id: 'city',
        defenseBonus: 0.25,
        initialPopulationWeight: 25,
        strategicValue: 4.5,
        income: function (civ) {
            civ.politic += randn_bm() / 4;
            civ.money += randn_bm() * 7;
            civ.happiness += randn_bm() * 0.01 * (1 - civ.ii / data.length / data[0].length);
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("市", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    town: {
        id: 'town',
        defenseBonus: 0.15,
        initialPopulationWeight: 15,
        strategicValue: 2,
        income: function (civ) {
            civ.politic += randn_bm() / 7;
            civ.money += randn_bm() * 5;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("T", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    gate: {
        id: 'gate',
        defenseBonus: 0.05,
        initialPopulationWeight: 5,
        strategicValue: 2,
        income: function (civ) {
            civ.politic += randn_bm() / 20;
            civ.money += randn_bm();
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("G", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    },
    fort: {
        id: 'fort',
        defenseBonus: 0.60,
        initialPopulationWeight: 60,
        strategicValue: 3.2,
        income: function (civ) {
            civ.politic += randn_bm() / 10;
            civ.money -= randn_bm() * 2;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("#", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    }
};

function cellTypeId(type) {
    if (!type) return null;
    if (type.id && types[type.id]) return type.id;
    if (type.val != null) return 'military';

    var legacyDefenseTypes = {
        1: 'land',
        5: 'gate',
        15: 'town',
        16: 'school',
        25: 'city',
        35: 'finance',
        55: 'capital',
        60: 'fort',
        75: 'headquarter'
    };
    if (legacyDefenseTypes[type.defend]) return legacyDefenseTypes[type.defend];

    var source = type.draw && type.draw.toString();
    for (var id in types) {
        if (source === types[id].draw.toString()) return id;
    }
    return null;
}

function normalizeCellTypes() {
    if (!data) return;
    for (var row = 0; row < data.length; row++) {
        for (var col = 0; col < data[row].length; col++) {
            var cell = data[row][col];
            if (!cell || !cell.type || cell.type.val != null) continue;
            var id = cellTypeId(cell.type);
            if (types[id]) cell.type = types[id];
        }
    }
}

function readMap() {
    var img = new Image();
    img.src = imgDataURL;
    img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        data = [];

        var context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        var d = context.getImageData(0, 0, img.width, img.height).data;

        var i = 0;
        for (var row = 0; row < img.height; row++) {
            var rowData = [];
            for (var col = 0; col < img.width; col++, i += 4) {
                var val = d[i];
                if (val < 50) { // black
                    rowData.push({
                        color: null,
                        type: null
                    })
                } else {
                    rowData.push(null)
                }
            }
            data.push(rowData)
        }
        ready()
    }
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function dataURLtoFile(dataurl, filename) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return {
        filename: filename + '.' + mime.replace(/[^\/]+\//, ''),
        u8arr
    };
}
