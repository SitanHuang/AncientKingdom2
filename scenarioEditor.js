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
                if (type.defend == types.land.defend) {
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

    showInfo();

    document.getElementById('year').innerText = 'Year: ' + (Math.floor(turn / civOrders.length) / 4);

    drawCanvas();
};

setAllAI = (x) => {
    civOrders.forEach((c) => {
        civs[c].ai = x;
    })
}