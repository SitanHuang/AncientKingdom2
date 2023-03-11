manageGov = null;
refreshGov = null;

promoteGov = null;
demoteGov = null;
abdicate = null;

{
  inspectForeignGov = function () {
    let c2 = prompt("Who?");
    if (!c2 || !civs[c2]) return;
    manageGov(c2, false);
  };

  function buildPersonCols(p, op, inf) {
    let html = `
      <th>${p.name}</th>
      <td>${p.family}</td>
      <td>${p.age | 0}</td>
      <td data-sort='${person_tot_mod_value(p)}'
          style="font-family: sans-serif; font-size: 14px;">
    `;

    let mods = Object.keys(p.mods)
                .sort((a, b) => (
                  person_mod_value(b, p.mods[b]) -
                  person_mod_value(a, p.mods[a])
                ));

    for (const mid of mods) {
      const val = p.mods[mid];
      const mod = GOV_PERSON_MODS_BY_ID[mid];

      const mval = person_mod_value(mid, val);
      const rval = person_mod_rval(mid, val);
      const color = (mod.ai == 'asc' ? -1 : 1) * val > 0 ? 'green' : val == 0 ? 'black' : 'red';

      html += `
      ${mod.name}:
      <span style="font-weight: ${(rval > 0.7 || Math.abs(val) > 0.1 || Math.abs(mval) > 0.7 ? 'bold' : 'normal')};
                   color: ${color};">
        ${val > 0 ? '+' : ''}${Math.round(val * 1000) / 10}%
      </span><br> 
      `;
    }


    if (op)
      html += `<td style="
        font-weight: ${p.opinion < 1 ? 'bold' : ''};
        color: ${stepColor(p.opinion, [[0.9, 'red'], [1.1, '#bd8218'], [2, 'green']])}
      ">${Math.round(p.opinion * 100) / 100}</td>`;
    if (inf)
      html += `<td style="
        font-weight: ${p.influence > 1 ? 'bold' : ''};
      ">${Math.round(p.influence * 100) / 100}</td>`;

    return html;
  }

  function stepColor(val, steps) {
    for (let i = 0;i < steps.length - 1;i++) {
      if (val < steps[i][0])
        return steps[i][1];
    }
    return steps[steps.length - 1][1];
  }

  function buildModsTable(gov) {
    const modsPerRow = 4;

    let html = '';

    let i = 0;
    for (const mid in GOV_PERSON_MODS_BY_ID) {
      if (i % modsPerRow == 0)
        html += '<tr>';
      const mod = GOV_PERSON_MODS_BY_ID[mid];
      const val = gov.mods[mid];

      const color = (mod.ai == 'asc' ? -1 : 1) * val > 0 ? 'green' : val == 0 ? 'black' : 'red';

      html += `
        <th style="text-align: left">${mod.name}
        <${Math.round(val * 10) == 0 ? 'td' : 'th'}
          style="text-align: right; color: ${color}">
          ${val > 0 ? '+' : ''}${Math.round(val * 1000) / 10} %
      `;
      i++;
    }

    return html;
  }

  manageGov = function (civName, actionable) {
    refreshGov = () => manageGov(civName, actionable);

    const civ = civs[civName];
    const gov = civ.gov;

    $('#govLeader tbody').html();
    $('#govMods').html();
    $('#govAdvisors tbody').html();
    $('#govBureacrats tbody').html();
    $('#gov-panel').show().toggleClass('actionable', actionable);

    if (!gov?.leader)
      return;

    $('#govMods').html(buildModsTable(gov));

    const leader = gov.persons[gov.leader];

    $('#govLeader tbody').html(
      `
      <tr>
      ${buildPersonCols(leader)}
      <td style="
        font-weight: ${gov.cohesion < 1 ? 'bold' : ''};
        text-align: right;
        color: ${stepColor(gov.cohesion, [[0.9, 'red'], [1.1, '#bd8218'], [2, 'green']])}
      ">${Math.round(gov.cohesion * 10000) / 100}</td>
      <td class="action">
        <button onclick="abdicate()"> Abdicate </button>
      </td>
      `
    );

    let html = '';
    if (!window.tableSetup3) {
      window.tableSetup3 = new Tablesort($('#govAdvisors')[0]);
    }
    Object.values(gov.persons).forEach(p => {
      if (p.pos != GOV_POSITIONS.ADVISOR)
        return;
      html += `
        <tr>
        ${ buildPersonCols(p, true, true)  }
        <td>${person_successor_score(leader, p) | 0}
        <td class="action">
          <button onclick="demoteGov(${p.id})"> Demote </button>
        </td>
      `;
    });
    $('#govAdvisors tbody').html(html);

    window.tableSetup3.refresh();


    html = '';
    if (!window.tableSetup4) {
      window.tableSetup4 = new Tablesort($('#govBureacrats')[0]);
    }
    Object.values(gov.persons).forEach(p => {
      if (p.pos != GOV_POSITIONS.BUREAUCRAT)
        return;
      html += `
        <tr>
        ${ buildPersonCols(p, true, true)  }
        <td>${person_successor_score(leader, p) | 0}
        <td class="action">
          <button onclick="promoteGov(${p.id})"> Promote </button>
        </td>
      `;
    });
    $('#govBureacrats tbody').html(html);
    window.tableSetup4.refresh();

    promoteGov = function(pid) {
      if (Object.keys(gov.advisors).length >= GOV_ADVISORS_PER_CIV) {
        alert('Max number of advisors reached!');
        return false;
      }

      if (!gov_promote_to_advisors(gov, pid))
        alert('Failed.');

      gov_refresh(civs[civName], civName);
      refreshGov();
    }

    demoteGov = function(pid) {
      if (!gov_demote_to_bureaucrat(gov, pid))
        alert('Failed.');

      gov_refresh(civs[civName], civName);
      refreshGov();
    }

    abdicate = function() {
      alert('The leader is set to abdicate at the end of the turn.');
      gov._abdicate = true;
    }
  };
}