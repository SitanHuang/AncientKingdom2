addheatmapdata=()=>{};
function delBlock() {
    window.onClickTemp = function (row, col) {
        data[row][col]=null;
        drawCanvas();
    }
}
function addBlock() {
    window.onClickTemp = function (row, col) {
        data[row][col]={color: null, type: null};
        drawCanvas();
    }
}
function placeDivision() {
    var civName = civOrders[i];
    var name = prompt('Division name');
    var manpower = parseInt(prompt('Manpower', '10000'));
    if (!name || !Number.isFinite(manpower) || manpower < 1) return;
    $('#panel').hide();
    window.onClickTemp = function (row, col) {
        var cell = data[row] && data[row][col];
        if (!cell || cell.color != civName) {
            alert('Select territory owned by ' + civName + '.');
            return;
        }
        Military._addDivision({
            civ: civName,
            name: name,
            row: row,
            col: col,
            manpower: manpower,
            maxManpower: manpower,
            experience: 1,
            morale: 1,
            entrenchment: 1
        });
        MilitaryUI.selectTile(row, col);
        drawCanvas();
    };
}
buy = function (type, price) {
    $('#panel').hide();
    var civName = civOrders[i];
    var civ = civs[civName];
    if (civ.money < price) {
        alert('Not enough money.');
        drawCanvas();
        buyClick = null;
        return;
    }
    drawCanvas(function (row, col) {
        var land = data[row][col];
        if (land && land.color != civName && land.color != null) return false;
        if (land == null) return false;
        var bool = false;
        getNeighbors(row, col, function (land) {
            if (land && land.color == civName) {
                bool = true;
            }
        });
        return bool;
    });
    buyClick = function (row, col) {
        var land = data[row][col];
        if (land == null) {
            alert('Land is null');
        } else {
            var bool = true;
            // getNeighbors(row, col, function (land) {
            //     if (land && land.color == civName) {
            //         bool = true;
            //     }
            // });
            if (!bool) {
                alert('Land is not adjacent to your territory.')
            } else {
                if (cellTypeId(type) == 'land') {
                    getNeighbors(row, col, function(l, r, c) {
                        if (!l.color) {
                            data[r][c] = {
                                color: civName,
                                type: type
                            };
                        }
                        if (landLevel >= 2)
                          getNeighbors(r, c, function(l, r, c) {
                              if (!l.color) {
                                  data[r][c] = {
                                      color: civName,
                                      type: type
                                  };
                              }
                              if (landLevel >= 3)
                              getNeighbors(r, c, function(l, r, c) {
                                  if (!l.color) {
                                      data[r][c] = {
                                          color: civName,
                                          type: type
                                      };
                                  }
                                  if (landLevel >= 4)
                                  getNeighbors(r, c, function(l, r, c) {
                                      if (!l.color) {
                                          data[r][c] = {
                                              color: civName,
                                              type: type
                                          };
                                      }
                                  })
                              })
                          })
                    })
                }
                data[row][col] = {
                    color: civName,
                    type: type
                };
                civ.money += price / 2;
                buyClick = null;
                drawCanvas();
            }
        }
        showInfo();
    }
};

calculateYears = (x, y) => {
};

prepareTurn = function () {
    buyClick = null;
    i++;
    if (i >= civOrders.length)
        i = 0;

    Military.beginTurn(civOrders[i]);
    MilitaryUI.refresh();
    showInfo();

    document.getElementById('year').innerText = 'Year: ' + (Math.floor(turn / civOrders.length) / 4);

    drawCanvas();
};

setAllAI = (x) => {
    civOrders.forEach((c) => {
        civs[c].ai = x;
    })
}
