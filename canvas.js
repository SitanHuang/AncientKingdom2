
var canvas = null;
var BLOCK_SIZE = 20.2;

var count = 0;
var lazyDraw = false;
var lazyDraw2 = false;
var lazyDrawCount = 67;

var showBorder = true;
var showStripes = false;
var showCellBorder = false;
var showYear = {
    yr: true,
    offset: 0,
};

var canvasPixelRatio = 1;
var canvasDevicePixelRatio = 1;

function getCanvasPixelRatio() {
    return Math.max(1, Number(window.devicePixelRatio) || 1);
}

function sizeCanvasForDisplay(canvasElement, logicalWidth, logicalHeight, logicalPixelUnit) {
    var ratio = getCanvasPixelRatio();
    // Align map-cell edges to physical pixels. Fractional backing-pixel edges can
    // expose antialiased seams between adjacent fills at small BLOCK_SIZE values.
    if (logicalPixelUnit > 0) {
        ratio = Math.max(1, Math.ceil(logicalPixelUnit * ratio)) / logicalPixelUnit;
    }
    canvasElement.style.width = logicalWidth + "px";
    canvasElement.style.height = logicalHeight + "px";
    canvasElement.width = Math.round(logicalWidth * ratio);
    canvasElement.height = Math.round(logicalHeight * ratio);
    canvasPixelRatio = ratio;
    canvasDevicePixelRatio = getCanvasPixelRatio();
    return {
        x: canvasElement.width / logicalWidth,
        y: canvasElement.height / logicalHeight
    };
}

function canvasEventToCell(event) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var original = event.originalEvent || event;
    var clientX = original.clientX;
    var clientY = original.clientY;
    if (clientX == null || clientY == null) return null;
    var x = (clientX - rect.left) * (BLOCK_SIZE * data[0].length) / rect.width;
    var y = (clientY - rect.top) * (BLOCK_SIZE * data.length) / rect.height;
    var row = Math.floor(y / BLOCK_SIZE);
    var col = Math.floor(x / BLOCK_SIZE);
    if (row < 0 || col < 0 || row >= data.length || col >= data[row].length) return null;
    return { row: row, col: col };
}

function drawCellGrid(context, rows, cols, blockSize, canvasScale) {
    var desiredWidth = Math.min(1, blockSize * 0.15);
    var verticalWidth = Math.max(1, Math.round(desiredWidth * canvasScale.x)) / canvasScale.x;
    var horizontalWidth = Math.max(1, Math.round(desiredWidth * canvasScale.y)) / canvasScale.y;
    context.save();
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (var col = 1; col < cols; col++) {
        context.fillRect(col * blockSize, 0, verticalWidth, rows * blockSize);
    }
    for (var row = 1; row < rows; row++) {
        context.fillRect(0, row * blockSize, cols * blockSize, horizontalWidth);
    }
    context.restore();
}

function canvasScreenshot(force) {
    if (force) {
        const [ old, old2 ] = [lazyDraw, lazyDraw2];
        [lazyDraw, lazyDraw2] = [false, false];
        count = 0;
        drawCanvas();
        [lazyDraw, lazyDraw2] = [ old, old2 ];
    }

    const data = canvas.toDataURL('image/jpeg');
    const image = document.createElement('img');
    image.src = data;
    image.rel = "preload";
    image.width = Math.round(parseFloat(canvas.style.width) || canvas.clientWidth);
    image.height = Math.round(parseFloat(canvas.style.height) || canvas.clientHeight);

    GALLERY_DATA.push({
        img: image,
        pop: window.average && window.average.pop || 0,
        gdp: Math.floor(window.average?.income),
        gdpPerCapita: Math.floor(1000 * 1e6 * window.average?.income / window.average?.pop) / 1000,
        year: Math.floor(turn / civOrders.length) / 4,
        dynasty: dynasty_get_mandate(),
        contenders: civOrders.filter(x => civs[x].mandateInAcquirement).join(", ")
    });

    _gallery_prev_year = Math.floor(turn / civOrders.length) / 4;
    _gallery_change_cml = 0;

    galleryDisp(true);
}

/** Creates a canvas filled with a 45-degree pinstripe.
  * @returns the filled HTMLCanvasElement. */
function createPinstripeCanvas(side_length, bg, colour) {
    const patternCanvas = document.createElement("canvas");
    const pctx = patternCanvas.getContext('2d');

    const CANVAS_SIDE_LENGTH = side_length;
    const WIDTH = CANVAS_SIDE_LENGTH;
    const HEIGHT = CANVAS_SIDE_LENGTH;
    const DIVISIONS = 3;

    patternCanvas.width = WIDTH;
    patternCanvas.height = HEIGHT;

    pctx.fillStyle = bg;
    pctx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);

    pctx.lineWidth = 0;
    pctx.fillStyle = colour;

    // Top line
    pctx.beginPath();
    pctx.moveTo(0, HEIGHT * (1 / DIVISIONS));
    pctx.lineTo(WIDTH * (1 / DIVISIONS), 0);
    pctx.lineTo(0, 0);
    pctx.lineTo(0, HEIGHT * (1 / DIVISIONS));
    pctx.fill();

    // Middle line
    pctx.beginPath();
    pctx.moveTo(WIDTH, HEIGHT * (1 / DIVISIONS));
    pctx.lineTo(WIDTH * (1 / DIVISIONS), HEIGHT);
    pctx.lineTo(0, HEIGHT);
    pctx.lineTo(0, HEIGHT * ((DIVISIONS - 1) / DIVISIONS));
    pctx.lineTo(WIDTH * ((DIVISIONS - 1) / DIVISIONS), 0);
    pctx.lineTo(WIDTH, 0);
    pctx.lineTo(WIDTH, HEIGHT * (1 / DIVISIONS));
    pctx.fill();

    // Bottom line
    pctx.beginPath();
    pctx.moveTo(WIDTH, HEIGHT * ((DIVISIONS - 1) / DIVISIONS));
    pctx.lineTo(WIDTH * ((DIVISIONS - 1) / DIVISIONS), HEIGHT);
    pctx.lineTo(WIDTH, HEIGHT);
    pctx.lineTo(WIDTH, HEIGHT * ((DIVISIONS - 1) / DIVISIONS));
    pctx.fill();

    return patternCanvas;
}

let _canvas_cache = {
    prevBS: BLOCK_SIZE,
    patterns: {}
};

function median(values){
  if(values.length == 0) return NaN;

  values.sort(function(a,b){
    return a-b;
  });

  var half = Math.floor(values.length / 2);

  if (values.length % 2)
    return values[half];

  return (values[half - 1] + values[half]) / 2.0;
}

gp=0;
ge=0;
gte=0;
gdef=0;
gpm=0;
gem=0;
gpem=0;
g_bycountry=0;

gp_culture = -1; // -1 = all, 1 = mixed, string = specific

function drawCanvas(compare, relationship, pop) {
    let start = new Date();
    if (gp) pop=1;
    if ((lazyDraw || lazyDraw2) && count++ % lazyDrawCount != 0) return;
    //BLOCK_SIZE += 0.17;
    BLOCK_SIZE = Math.max(1, Math.floor(BLOCK_SIZE));
    if (BLOCK_SIZE != _canvas_cache.prevBS)
        _canvas_cache = {
            prevBS: BLOCK_SIZE,
            patterns: {}
        };
    canvas = $('canvas')[0];
    var logicalWidth = BLOCK_SIZE * data[0].length;
    var logicalHeight = BLOCK_SIZE * data.length;
    var canvasScale = sizeCanvasForDisplay(canvas, logicalWidth, logicalHeight, BLOCK_SIZE);
    var context = canvas.getContext('2d', {antialias: false, depth: false});
    context.setTransform(canvasScale.x, 0, 0, canvasScale.y, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = "white";
    context.fillRect(0, 0, logicalWidth, logicalHeight);

    for (var row = 0;row < data.length;row++) {
        var rowData = data[row];
        for (var col = 0;col < rowData.length;col++) {
            var d = rowData[col];
            if (d == null) {
                context.fillStyle = "rgba(80, 100, 125,1)";
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE,  (BLOCK_SIZE + 1),  (BLOCK_SIZE + 1));
            } else if (d.color && gte) {
                let p = (g_bycountry ? civs[d.color]?.teb : regions_taxEff(civs[d.color], d.color, row, col)) || 0;
                let max = 1;
                context.fillStyle = redYellowBlueScale(p / max, 0.7);
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                if (!g_bycountry) {
                    context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                    context.fillStyle = 'black';
                    context.fillText(Math.round(p * 10) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                }
                continue;
            } else if (d.color && gdef) {
                let p = regions_defBonus(civs[d.color], d.color, row, col) || 0;
                let max = 1.5;
                context.fillStyle = redYellowBlueScale(p / max, 0.5 / 1.5);
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                context.fillStyle = 'black';
                context.fillText(Math.round(p * 10) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                continue;
            } else if (gpm) {
                let p = ((g_bycountry ? civs[d.color]?._avgpm : res_pop_mod(row, col)) - 0.7) || 0;
                let max = g_bycountry ? max_avg_pm_country - 0.7 : (1.8 - 0.5);
                context.fillStyle = `rgb(${250 - p / max * 250}, ${250 - p / max * 125}, ${250 - p / max * 250})`;
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                if (!g_bycountry) {
                    context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                    context.fillStyle = 'black';
                    context.fillText(Math.round(res_pop_mod(row, col) * 10) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                }
                continue;
            } else if (gem) {
                let p = ((g_bycountry ? civs[d.color]?._avgem : res_econ_mod(row, col)) - 0.7) || 0;
                let max = g_bycountry ? max_avg_em_country - 0.7 : (3 - 0.5);
                context.fillStyle = `rgb(${250 - p / max * 5}, ${250 - p / max * 125}, ${250 - p / max * 250})`;
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                if (!g_bycountry) {
                    context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                    context.fillStyle = 'black';
                    context.fillText(Math.round(res_econ_mod(row, col) * 10) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                }
                continue;
            } else if (gpem) {
                let p = res_econ_mod(row, col) * res_pop_mod(row, col);
                let max = 5;
                context.fillStyle = `rgb(${250 - p / max * 5}, ${250 - p / max * 125}, ${250 - p / max * 250})`;
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                continue;
            } else if (d.color && d.type) {
                if (relationship) {
                    let relation_civ = civs[relationship];
                    if (isAlliance(relation_civ, d.color))
                        context.fillStyle = 'blue';
                    else if (isPeace(relation_civ, d.color))
                        context.fillStyle = '#cc9900';
                    else if (isAtWar(relation_civ, d.color))
                        context.fillStyle = '#800000';
                    else if (d.color == relationship)
                        context.fillStyle = '#009933';
                    else
                        context.fillStyle = 'grey';
                } else if (pop) {
                    let dPop = popv2_get_totpop(row, col);

                    let bgColor;

                    let max = g_bycountry ? Math.floor(max_pop_country || max_pop) : max_pop;

                    if (gp_culture == -1) {
                        let p = (g_bycountry ? civs[d.color].pop : dPop) || 0;
                        bgColor = {
                            R: 250 - p / max * 250,
                            G: 250 - p / max * 125,
                            B: 250 - p / max * 250,
                        };
                    } else if (gp_culture == 1) {
                        const table = {};
                        poptable_hook(table);
                        poptable_add_from_pt(table, row, col);

                        const colors = Object.entries(table._poptable);

                        bgColor = mixColors(colors.map(([key, val]) => {
                            const culture = popv2_culture_reinit_culture(key);
                            return [
                                culture.colorRGB,
                                val / max
                            ];
                        }));
                    } else if (gp_culture == 3) {
                        const table = {};
                        poptable_hook(table);
                        poptable_add_hist_from_pt(table, row, col);

                        const colors = Object.entries(table._poptable);

                        bgColor = mixColors(colors.map(([key, val]) => {
                            const culture = popv2_culture_reinit_culture(key);
                            return [
                                culture.colorRGB,
                                val / (max_hist_val || max)
                            ];
                        }), { minIntensity: 0, softMaxWeight: 2 });
                    } else if (typeof gp_culture == 'string') {
                        const table = {};
                        poptable_hook(table);
                        poptable_add_from_pt(table, row, col);

                        const colors = Object.entries(table._poptable).filter(([key,_]) => key == gp_culture);

                        dPop = table._poptable[gp_culture] || 0;

                        bgColor = mixColors(colors.map(([key, val]) => {
                            const culture = popv2_culture_reinit_culture(key);
                            return [
                                culture.colorRGB,
                                val / max
                            ];
                        }), {
                            minIntensity: 0,
                            softMaxWeight: 1,
                            intensityNorm: (x, D=0.3) =>
                                Math.log((x + D) / D) / Math.log((1 + D) / D)
                        });
                    }

                    context.fillStyle = `rgb(${bgColor.R}, ${bgColor.G}, ${bgColor.B})`;

                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    if (!g_bycountry && (dPop > 50000 || (typeof gp_culture == 'string' && dPop > 5000))) {
                        context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                        context.fillStyle = idealTextColor(bgColor);
                        if (dPop > 500) context.fillText(Math.round(dPop / 10000) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                    }
                    continue;
                } else if (ge) {
                    let p = (g_bycountry ? civs[d.color].income : d._econ) || 0;
                    let max = g_bycountry ? Math.floor(max_econ_country || max_econ) : max_econ;
                    context.fillStyle = `rgb(${250 - p / max * 5}, ${250 - p / max * 125}, ${250 - p / max * 250})`;
                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    if (!g_bycountry) {
                        context.font = BLOCK_SIZE / 2 + "px 'Roboto Mono'";
                        context.fillStyle = 'black';
                        if (d._econ > 0.5) context.fillText(Math.round(d._econ) + '', col * BLOCK_SIZE, row * BLOCK_SIZE + BLOCK_SIZE);
                    }
                    continue;
                } else {
                    let pat = civs[d.color].color;
                    if (showStripes && d._oldcolor && d._oldcolor != d.color) {
                        let key = d._oldcolor + ':' + d.color;
                        pat = _canvas_cache.patterns[key] = _canvas_cache.patterns[key] ||
                            context.createPattern(
                                createPinstripeCanvas(Math.max(4, BLOCK_SIZE / 3), civs[d._oldcolor].color, civs[d.color].color),
                                'repeat'
                            );
                    }
                    context.fillStyle = pat;
                }
                context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

                if (!lazyDraw) {
                    let _draw = d.type.draw;
                    let bold = d.growth > 1 && popv2_get_totpop(row, col) > Math.max(max_pop * 0.75, 100000) ? '"bold " + 1.2 * ' : '';
                    let body = _draw.toString()
                      .replace('x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE',
                        bold ? 'x * BLOCK_SIZE + BLOCK_SIZE / 4 * 0.9, y * BLOCK_SIZE + BLOCK_SIZE / 1.5 * 1.1' :
                               'x * BLOCK_SIZE + BLOCK_SIZE / 4, y * BLOCK_SIZE + BLOCK_SIZE / 1.5')
                      .replace('BLOCK_SIZE - 1 + "px \'Roboto Mono\'"',
                        bold + 'BLOCK_SIZE / 2 + "px \'Roboto Mono\'"')
                      .replace('BLOCK_SIZE - 3 + "px \'Roboto Mono\'"',
                        bold + 'BLOCK_SIZE / 2 + "px \'Roboto Mono\'"');

                    let __draw = eval('_tmp_eval_body_result = ' + body).bind(d.type);
                    let draw = (col, row) => { __draw.call(d.type, col, row) }
                    if (BLOCK_SIZE >= 20)
                        draw(col, row);
                    else if (BLOCK_SIZE >= 14 &&
                        (_draw.toString() == types.finance.draw.toString() || _draw.toString() == types.school.draw.toString() || bold))
                        draw(col, row);
                    else if (cellTypeId(d.type) == 'capital') {
                        draw(col, row);
                    } else if (_draw.toString() == types.headquarter.draw.toString())
                        draw(col, row);
                    else if (_draw.toString() != types.land.draw.toString()) {
                        let x = col;
                        let y = row;
//                         var context = canvas.getContext('2d');
                        context.font = BLOCK_SIZE - 1 + "px 'Roboto Mono'";
                        context.fillStyle = civs[d.color].fontColor;
                        context.fillText(" ·", x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE);
                    }
                }
            }
            if (compare) {
                if (!compare(row, col)) {
                    context.fillStyle = "rgba(0, 0, 0, 0.5)";
                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }
    }

    if (showCellBorder) {
        drawCellGrid(context, data.length, data[0].length, BLOCK_SIZE, canvasScale);
    }

    context.fillStyle = 'rgb(0, 0, 0)';
    if (showBorder)
        for (var row = 0;row < data.length;row++) {
            var rowData = data[row];
            for (var col = 0;col < rowData.length;col++) {
                var d = rowData[col];
                if (d && d.color && d.type) {
                    getNeighbors(row, col, (d2, r, c) => {
                        if ((d2 && d2.color && (d2._oldcolor || d2.color) != (d._oldcolor || d.color) && d2.type) || (d2 && !d2.color)) {
                            let _adj = r == row - 1 && c == col ? 1 :// top
                                    (r == row + 1 && c == col ? 2 : // bottom
                                    (r == row && c == col - 1 ? 3 : 4)); // left, right
                            // context.fillStyle = civs[d.color].fontColor;
                            let w = Math.min(4, BLOCK_SIZE * 0.05);
                            switch (_adj) {
                                case 1: // top
                                    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
                                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE - 2*w, BLOCK_SIZE, w * 4);
                                    context.fillStyle = d2?.color ? civs[d2._oldcolor || d2.color].color : 'black';
                                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, w);
                                    break;
                                case 2: // bottom
                                    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
                                    context.fillRect(col * BLOCK_SIZE, (row + 1) * BLOCK_SIZE - 2*w, BLOCK_SIZE, w * 4);
                                    context.fillStyle = d2?.color ? civs[d2._oldcolor || d2.color].color : 'black';
                                    context.fillRect(col * BLOCK_SIZE, (row + 1) * BLOCK_SIZE - w, BLOCK_SIZE, w);
                                    break;
                                case 3: // left
                                    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
                                    context.fillRect(col * BLOCK_SIZE - 2*w, row * BLOCK_SIZE, w * 4, BLOCK_SIZE);
                                    context.fillStyle = d2?.color ? civs[d2._oldcolor || d2.color].color : 'black';
                                    context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, w, BLOCK_SIZE);
                                    break;
                                case 4: // right
                                    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
                                    context.fillRect((col + 1) * BLOCK_SIZE - 2*w, row * BLOCK_SIZE, w * 4, BLOCK_SIZE);
                                    context.fillStyle = d2?.color ? civs[d2._oldcolor || d2.color].color : 'black';
                                    context.fillRect((col + 1) * BLOCK_SIZE - w, row * BLOCK_SIZE, w, BLOCK_SIZE);
                                    break;
                            }
                        }
                    });
                }
            }
        }

    if (relationship || BLOCK_SIZE <= 20) {
        let l = {};
        civOrders.forEach((x) => {
            if (civs[x].ii >= 5 || relationship)
              l[x] = {
                  leftmost: 10000000,
                  rightmost: -1,
                  upmost: 10000000,
                  downmost: -1,
                  capital: null,
                  x_points: [],
                  y_points: []
              }
        });
        for (var row = 0;row < data.length;row++) {
            var rowData = data[row];
            for (var col = 0;col < rowData.length;col++) {
                var d = rowData[col];
                let color = d?._oldcolor || d?.color;
                if (d && color && l[color]) {
                    l[color].leftmost = Math.min(l[color].leftmost, col);
                    l[color].rightmost = Math.max(l[color].rightmost, col);
                    l[color].upmost = Math.min(l[color].upmost, row);
                    l[color].downmost = Math.max(l[color].downmost, row);
                    if (cellTypeId(d.type) == 'capital') {
                        l[color].capital = [col * BLOCK_SIZE, row * BLOCK_SIZE];
                    } else {
                        l[color].x_points.push(col);
                        l[color].y_points.push(row);
                    }
                }
            }
        }
        Object.entries(l).forEach((entry) => {
            let [color, bound] = entry;
            let x_start = bound.leftmost * BLOCK_SIZE;
            let x_end = bound.rightmost * BLOCK_SIZE;
            let y_start = bound.upmost * BLOCK_SIZE;
            let y_end = bound.downmost * BLOCK_SIZE;
            let x_diff = x_end - x_start;
            let y_diff = y_end - y_start;
            let max_diff = Math.min(x_diff, y_diff);
//             let cx = x_start + x_diff / 2;
//             let cy = y_start + y_diff / 2;
            // let cx = bound.x_points.reduce((a, b) => {return a + b}, 0) / bound.x_points.length * BLOCK_SIZE - BLOCK_SIZE / 2;
            // let cy = bound.y_points.reduce((a, b) => {return a + b}, 0) / bound.y_points.length * BLOCK_SIZE - BLOCK_SIZE / 2;
            let cx = median(bound.x_points) * BLOCK_SIZE;
            let cy = median(bound.y_points) * BLOCK_SIZE;
            if (bound.capital) {
                cx = (cx * 9 + bound.capital[0]) / 10;
                cy = (cy * 9 + bound.capital[1]) / 10;
            }

            let font_size = Math.max(10, max_diff / color.length * 2 / 4);

            context.textAlign = "center";
            context.shadowColor = "black";
            context.shadowOffs = 0;
            context.fillStyle = "rgba(255, 255, 255, 0.9)";

            if (civOrders.filter(x => civs[x].mandate).length) {
                if (civs[color].mandate) {
                    context.font = 'bold ' + font_size + "px 'Roboto Mono'";
                    font_size *= 1.2;
                } else {
                    context.font = font_size + "px 'Roboto Mono'";
                    context.fillStyle = "rgba(0, 0, 0, 0.9)";
                    context.shadowColor = "white";
                }
            } else {
                context.font = 'bold ' + font_size + "px 'Roboto Mono'";
            }

            context.shadowBlur = font_size / 2;
            context.fillText(color, cx, cy + font_size / 2);
        })
    }

    if (showYear.yr) {
        const font_size = BLOCK_SIZE;

        const year = Math.floor(turn / civOrders.length) / 4;
        const season = year % 1;
        const dispYear = year - season + showYear.offset;
        const yearText = '公元' +
            (dispYear < 0 ? '前' + (-dispYear) : dispYear) + '年' +
            (season < 0.25 ? '春' :
            (season < 0.50 ? '夏' :
            (season < 0.75 ? '秋' : '冬')));

        context.textAlign = "left";
        context.shadowColor = "black";
        context.shadowOffs = 0;
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.shadowBlur = font_size / 2;
        context.font = 'bold ' + font_size + "px Serif";
        context.fillText(yearText, BLOCK_SIZE * 0.1, BLOCK_SIZE * 0.5 + font_size / 2);
    }

    if (typeof MilitaryUI != 'undefined') MilitaryUI.drawOverlay(context, BLOCK_SIZE);

    // BLOCK_SIZE -= 0.17;
    $('#canvasTime').text((new Date() - start) + 'ms');
}


window.onClickTemp = null;

function onClick(row, col) {
    if (onClickTemp) {
        onClickTemp(row, col);
        onClickTemp = null;
        return;
    }

    var civName = civOrders[i];
    var civ = civs[civName];

    if (buyClick) {
        buyClick(row, col);
        return;
    }

    var land = data[row] && data[row][col];
    if (typeof MilitaryUI != 'undefined' && MilitaryUI.onTileClick(row, col)) return;

    if (civ.technology == -1) {
        if (land == null) {
            alert('Land is null, please reselect.');
        } else if (land.color != null) {
            alert('Land is occupied, please reselect.');
        } else {
            getNeighbors(row, col, function (neighbor, neighborRow, neighborCol) {
                neighbor.color = civName;
                neighbor.type = types.land;
                getNeighbors(neighborRow, neighborCol, function (outerNeighbor) {
                    outerNeighbor.color = civName;
                    outerNeighbor.type = types.land;
                });
            });
            data[row][col] = { color: civName, type: types.capital };
            civ.birth = [row, col];
            civ.money = 50;
            civ.politic = 0;
            civ.technology = 1;
            showInfo();
        }
    }

    drawCanvas();
}
