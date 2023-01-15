MESSAGES = [];

function msg_alert(msg, relevant_civs=[]) {
  alert(msg);
  push_msg(msg, relevant_civs, true);
}

function push_msg(msg, relevant_civs=[], noalert) {
  console.log(msg);
  // year, msg, civs
  MESSAGES.unshift([(Math.floor(turn / civOrders.length) / 4), msg, relevant_civs]);
  // if (!noalert && relevant_civs.indexOf(civOrders[i]) >= 0)

  if (MESSAGES.length > 200)
    MESSAGES.pop();
}

function _paint_msgs(civName) {
  let lastyr = 0;
  let content = '';
  let lines = 0;
  MESSAGES
    .sort((a, b) => (b[0] - a[0]) || (b[2].indexOf(civName) - a[2].indexOf(civName)))
    .forEach((x, i) => {
      let html = `${x[0].toFixed(2)}: ${x[1]}`;

      let thisyr = x[0] >= (Math.floor(turn / civOrders.length) / 4) - 0.25;

      html = x[2].indexOf(civName) >= 0 ? (thisyr ? '<b style="color:red">' : '<b>') + html + '</b>' : html;
      if (thisyr)
        lines++;
      if (x[0] != lastyr && i != MESSAGES.length - 1)
        html = '<line/>' + html;
      html += '<br/>';
      lastyr = x[0];
      content += html;
    });
  return `<msg style="height: calc(${Math.min(15, lines)}em*1.4 + 1em);">${content}</msg>`;
}