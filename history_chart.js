class HistoryChart {
  constructor(selector, width=800, height=50) {
    this.selector = selector;
    this.width = width;
    this.height = height;
  }

  // data: [[null, x], [label, x], ...]
  draw(data, max, min=-1) {
    let svg = this.svg = d3.select(this.selector).html("")
      .append("svg")
        .attr("width", this.width).attr("height", this.height);
      // .attr("style", "border: 1px solid grey;");

    let Tooltip = d3.select(this.selector)
      .append("div")
      .style("position", "absolute")
      .style("display", "inline-block")
      .style("opacity", 0)
      .style("background-color", "white")
      .style("border", "1px solid grey")
      .style("border-radius", "5px")
      .style("padding", "2px");

    let mouseover = function () {
      Tooltip
        .style("opacity", 1);
    }
    let mousemove = function (text) {
      return function () {
        Tooltip
          .text(text)
          .style("left", (d3.mouse(this)[0] + 15) + "px")
          .style("top", (d3.mouse(this)[1]) + "px")
      }
    }
    let mouseleave = function () {
      Tooltip
        .style("opacity", 0);
    }

    let range = max - min;

    for (let i = 1; i < data.length; i++) {
      let x0 = data[i - 1][1];
      let x1 = data[i][1];
      let y = data[i][0];
      
      if (i == data.length - 1)
        x1 = max;
      
      if (i == 1 && min == -1) {
        min = x0;
        range = max - min;
      }

      x0 -= min;
      x1 -= min;

      let width = x1 - x0;

      let x = x0 / range * this.width;
      width = width / range * this.width;

      let rect = svg.append('rect')
                    .attr('x', x)
                    .attr('y', 0)
                    .attr('width', width)
                    .attr('fill', civs[y]?.color || 'white')
                    .attr('height', this.height);
      if (civs[y]) {
        rect
          .on("mouseover", mouseover)
          .on("mousemove", mousemove(y))
          .on("mouseleave", mouseleave);
      }
    }
  }
}