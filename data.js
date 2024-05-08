var data;
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
        },
        defend: 55
    },
    headquarter: {
        income: function (civ) {
            civ.politic += randn_bm() * 2;
            civ.money -= randn_bm() * 5;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("统", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        },
        defend: 75
    },
    land: {
        income: function (civ) {
            civ.politic -= randn_bm() / 55;
            civ.money += randn_bm();
        },
        draw: function () {
        },
        defend: 1
    },
    finance: {
        defend: 35,
        income: function (civ) {
            civ.politic += randn_bm();
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
        defend: 16,
        income: function (civ) {
            if (civ.money <= 0 || civ.politic <= 0) return;

            civ.politic -= randn_bm();
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
        defend: 25,
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
        defend: 15,
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
        income: function (civ) {
            civ.politic += randn_bm() / 20;
            civ.money += randn_bm();
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("G", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        },
        defend: 5
    },
    fort: {
        income: function (civ) {
            civ.politic += randn_bm() / 10;
            civ.money -= randn_bm() * 2;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText("#", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        },
        defend: 60
    },
    military: {
        val: 1,
        income: function (civ) {
            civ.politic += (randn_bm() * this.val / 20) || 0;
            const mukct = 1 + (civ.gov.mods.MUKCT || 0);
            civ.money -= this.val / 4 * mukct;
        },
        draw: function (x, y) {
            var context = canvas.getContext('2d');
            context.font = BLOCK_SIZE - 3 + "px 'Roboto Mono'";
            context.fillStyle = civs[data[y][x].color].fontColor;
            context.fillText(this.val, x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
        }
    }
};

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
