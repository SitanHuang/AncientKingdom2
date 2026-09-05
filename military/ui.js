(function (global) {
    "use strict";

    var api = null;
    var selectedIds = [];
    var listedIds = [];
    var selectedTile = null;
    var placementTile = null;
    var unitPanel = null;
    var unitList = null;
    var stackSummary = null;
    var armySummary = null;
    var armyRibbons = null;
    var unitDetail = null;
    var pinnedDetailId = null;
    var recruitmentPanel = null;
    var showManpowerOverlay = true;
    var showUnitMarkers = true;
    var lastActiveCiv = null;
    var options = {};

    function activeCivName() {
        if (options.getActiveCiv) return options.getActiveCiv();
        return global.civOrders && global.i >= 0 ? global.civOrders[global.i] : null;
    }

    function civColor(civName) {
        return global.civs[civName].color;
    }

    function civTextColor(civName) {
        return global.civs[civName].fontColor || "#fff";
    }

    function notify(message) {
        (options.notify || global.alert)(message);
    }

    function resultReason(result) {
        var reasons = {
            "no-territory": "This civilization has no deployment territory.",
            "invalid-manpower": "Enter a positive manpower amount.",
            "not-owned": "The selected tile is not owned by this civilization.",
            "population-cap": "The population or per-turn conscription limit has been reached.",
            "money": "There is not enough money for that conscription.",
            "empty-queue": "That training queue has no manpower to deploy.",
            "missing-queue": "That training queue no longer exists.",
            "missing-division": "That division no longer exists.",
            "out-of-range": "The destination is beyond the eligible divisions' remaining moves.",
            "no-eligible-divisions": "None of the selected divisions can make that attack.",
            "invalid-route": "Choose a reachable friendly tile or an enemy tile next to friendly territory or an earlier waypoint.",
            "no-access": "The selected divisions cannot enter that territory.",
            "politic": "There is not enough political power for that attack.",
            "not-at-war": "The target is not at war with you."
        };
        return result && (result.message || reasons[result.reason] || result.reason);
    }

    function redraw() {
        if (options.redraw) options.redraw();
    }

    function make(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function button(text, action, value) {
        var icons = { "toggle-overlay": "👥", clear: "✕", "close-detail": "✕", disband: "🗑", help: "❔" };
        var element = make("button", "", icons[action] || text);
        element.title = text;
        element.setAttribute("aria-label", text);
        element.type = "button";
        element.dataset.action = action;
        if (value !== undefined) element.dataset.value = value;
        return element;
    }

    function number(value, digits) {
        if (!isFinite(value)) return "0";
        return Number(value).toLocaleString(undefined, {
            maximumFractionDigits: digits === undefined ? 0 : digits
        });
    }

    function percent(value) {
        return number(value * 100, 0) + "%";
    }

    function divisionName(division) {
        return division.name || "Division " + division.id;
    }

    function nextDivisionName(name) {
        return name.replace(/([^\d])(\d+)(?!.*\d)/, function (_, prefix, number) {
            return prefix + (Number(number) + 1);
        });
    }

    function getSelectedDivisions() {
        var divisions = [];
        selectedIds.forEach(function (id) {
            var division = api.getDivision(id);
            if (division) divisions.push(division);
        });
        return divisions;
    }

    function ownTile(row, col) {
        var cell = global.data && global.data[row] && global.data[row][col];
        return cell && cell.color === activeCivName();
    }

    function quarterNumber() {
        var civCount = global.civOrders && global.civOrders.length || 1;
        return Math.floor((global.turn || 0) / civCount);
    }

    function seededFraction(key) {
        var hash = 2166136261;
        for (var index = 0; index < key.length; index++) {
            hash ^= key.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    // Keeps the real value inside the stated uncertainty while deliberately
    // avoiding a range whose midpoint gives the exact value away.
    function intelRange(value, uncertainty, key, minimum, maximum) {
        if (value <= minimum) {
            return { low: minimum, high: minimum, estimate: minimum };
        }
        var random = seededFraction(key + ":side");
        var position = random < 0.5 ? 0.24 + random * 0.30 : 0.61 + (random - 0.5) * 0.30;
        var width = value * uncertainty / Math.max(position, 1 - position);
        var low = Math.max(minimum, value - width * position);
        var high = Math.min(maximum, value + width * (1 - position));
        return {
            low: low,
            high: high,
            estimate: (low + high) / 2
        };
    }

    function intelKey(row, col, divisions) {
        var civsOnTile = divisions.map(function (division) { return division.civ; }).sort().join("|");
        return row + "," + col + ":" + civsOnTile + ":" + quarterNumber();
    }

    function enemyIntel(divisions, actual) {
        var tileKey = intelKey(selectedTile.row, selectedTile.col, divisions);
        var manpower = intelRange(actual.manpower, 0.25, tileKey + ":men", 0, Infinity);
        var morale = intelRange(actual.morale, 0.35, tileKey + ":morale", 0.05, 2);
        var estimated = api.getStackStats(
            divisions,
            selectedTile.row,
            selectedTile.col,
            { manpower: manpower.estimate, morale: morale.estimate }
        );
        estimated.requestedManpower = Math.max(0, estimated.maxManpower - manpower.estimate);
        return { manpower: manpower, morale: morale, stats: estimated };
    }

    function stat(label, value) {
        var icons = { Men: "👥", Moves: "👣", Attack: "⚔", Defense: "🛡", Requested: "➕",
            Recovered: "💚", Upkeep: "💰", Experience: "⭐", Morale: "🔥", Entrenchment: "⛏",
            "Building defense": "🏰", Encirclement: "⭕", Divisions: "🚩" };
        var element = make("span", "", (icons[label] || label + ":") + " " + value);
        element.title = label + ": " + value;
        element.setAttribute("aria-label", element.title);
        return element;
    }

    function displayedStats(stats, enemyScale) {
        stats = Object.assign({}, stats);
        var manpower = stats.manpower;
        var morale = stats.morale;
        var requested = stats.requestedManpower;
        var attack = stats.attack;
        var defense = stats.defense;
        if (enemyScale) {
            manpower *= enemyScale.manpower;
            morale = enemyScale.morale;
            requested = Math.max(0, stats.maxManpower - manpower);
            attack *= enemyScale.attack;
            defense *= enemyScale.defense;
            if (stats.upkeep !== undefined) stats.upkeep *= enemyScale.manpower;
        }
        stats.manpower = manpower;
        stats.morale = morale;
        stats.requestedManpower = requested;
        stats.attack = attack;
        stats.defense = defense;
        return stats;
    }

    function appendStats(container, stats, enemyScale, isEnemy) {
        stats = displayedStats(stats, enemyScale);
        container.appendChild(stat("Men", number(stats.manpower) + " / " + number(stats.maxManpower)));
        if (!isEnemy) {
            container.appendChild(stat("Requested", number(Math.max(0, stats.requestedManpower))));
            container.appendChild(stat("Recovered", number(stats.recoveredLastTurn)));
            container.appendChild(stat("Moves", number(stats.movesRemaining, 0) + " / " + number(stats.moveLimit, 0)));
            if (stats.upkeep !== undefined) container.appendChild(stat("Upkeep", "$" + number(stats.upkeep, 2)));
        }
        container.appendChild(stat("Experience", number(stats.experience, 2)));
        container.appendChild(stat("Morale", number(stats.morale, 2)));
        container.appendChild(stat("Entrenchment", number(stats.entrenchment, 2)));
        container.appendChild(stat("Attack", number(stats.attack, 1)));
        container.appendChild(stat("Defense", number(stats.defense, 1)));
        if (stats.buildingBonus > 1) container.appendChild(stat("Building defense", "+" + percent(stats.buildingBonus - 1)));
        if (stats.encirclement !== undefined) container.appendChild(stat("Encirclement", percent(1 - stats.encirclement)));
    }

    function rangeBar(label, range, domainMaximum, color) {
        var row = make("div", "military-intel-row");
        row.appendChild(make("span", "", label + " " + number(range.low, 2) + "–" + number(range.high, 2)));
        var bar = make("div", "military-range-bar");
        var band = make("span", "military-range-band");
        var midpoint = make("span", "military-range-midpoint");
        var scale = Math.max(domainMaximum, range.high, 0.0001);
        band.style.left = Math.max(0, range.low / scale * 100) + "%";
        band.style.width = Math.max(0, (range.high - range.low) / scale * 100) + "%";
        band.style.backgroundColor = color;
        midpoint.style.left = Math.max(0, Math.min(100, range.estimate / scale * 100)) + "%";
        bar.appendChild(band);
        bar.appendChild(midpoint);
        row.appendChild(bar);
        return row;
    }

    function renderArmies(owned) {
        armyRibbons.hidden = !owned;
        armySummary.hidden = !owned;
        armySummary.replaceChildren();
        if (!owned) return;
        var groups = {};
        api.getDivisions(activeCivName()).forEach(function (division) {
            var color = division.armyColor || "none";
            var group = groups[color] || (groups[color] = { count: 0, men: 0, capacity: 0, strength: 0, defense: 0 });
            group.count++;
            group.men += division.manpower;
            group.capacity += division.maxManpower;
            var stats = api.getDivisionStats(division.id);
            group.strength += stats.attack;
            group.defense += stats.defense;
        });
        var maximum = Math.max.apply(null, Object.keys(groups).map(function (color) { return groups[color].strength; })) || 1;
        Object.keys(api.armyColors).concat(["none"]).forEach(function (color) {
            var group = groups[color];
            if (!group) return;
            var row = make("div", "military-army-summary-row");
            var colorIcon = button(color === "none" ? "∅" : "", "select-army", color);
            colorIcon.className = "military-army-swatch";
            colorIcon.style.backgroundColor = api.armyColors[color] || "transparent";
            colorIcon.title = color === "none" ? "Select all unmarked units" : "Select all " + color + " army units";
            colorIcon.setAttribute("aria-label", colorIcon.title);
            row.appendChild(colorIcon);
            row.appendChild(stat("Divisions", group.count));
            row.appendChild(stat("Men", manpowerLabel(group.men) + "/" + manpowerLabel(group.capacity)));
            row.appendChild(stat("Attack", manpowerLabel(group.strength)));
            row.appendChild(stat("Defense", manpowerLabel(group.defense)));
            var bar = button("", "select-army", color);
            bar.className = "military-army-strength";
            bar.title = colorIcon.title;
            bar.setAttribute("aria-label", bar.title);
            bar.style.width = group.strength / maximum * 100 + "%";
            bar.style.backgroundColor = api.armyColors[color] || "#999";
            row.appendChild(bar);
            row.title = "Current army attack strength: " + number(group.strength, 1);
            armySummary.appendChild(row);
        });
        Array.from(armyRibbons.children).forEach(function (ribbon) {
            var selected = getSelectedDivisions();
            var marked = selected.length && selected.every(function (division) {
                return (division.armyColor || "none") === ribbon.dataset.value;
            });
            ribbon.setAttribute("aria-pressed", !!marked);
        });
    }

    function renderStackSummary(divisions, owned) {
        stackSummary.replaceChildren();
        var actual = api.getStackStats(divisions, selectedTile.row, selectedTile.col);
        var title = make("div", "military-panel-title");
        var icon = unitIcon(divisions[0].civ);
        title.appendChild(icon);
        title.appendChild(stat("Divisions", divisions.length));
        stackSummary.appendChild(title);

        var grid = make("div", "military-stat-grid");
        if (owned) {
            var strengths = divisions.map(function (division) { return api.getDivisionStats(division.id); });
            actual.attack = strengths.reduce(function (sum, stats) { return sum + stats.attack; }, 0);
            actual.defense = strengths.reduce(function (sum, stats) { return sum + stats.defense; }, 0);
            grid.classList.add("military-friendly-stats");
            grid.appendChild(stat("Men", manpowerLabel(actual.manpower) + "/" + manpowerLabel(actual.maxManpower)));
            grid.appendChild(stat("Moves", actual.movesRemaining + "/" + actual.moveLimit));
            grid.appendChild(stat("Attack", manpowerLabel(actual.attack)));
            grid.appendChild(stat("Defense", manpowerLabel(actual.defense)));
        } else {
            var intel = enemyIntel(divisions, actual);
            var estimated = intel.stats;
            appendStats(grid, estimated, undefined, true);
            // stackSummary.appendChild(make("div", "military-intel-note", "Enemy count is exact. Estimates refresh each quarter."));
            var intelRows = make("div", "military-intel");
            intelRows.appendChild(rangeBar("Men", intel.manpower, actual.maxManpower, civColor(divisions[0].civ)));
            intelRows.appendChild(rangeBar("Morale", intel.morale, 2, "#b17b22"));
            stackSummary.appendChild(intelRows);
        }
        stackSummary.insertBefore(grid, stackSummary.children[1] || null);
    }

    function unitIcon(civName, armyColor) {
        var icon = make("span", "military-unit-icon", (civName || "?").charAt(0).toUpperCase());
        icon.style.backgroundColor = civColor(civName);
        icon.style.color = civTextColor(civName);
        if (api.armyColors[armyColor]) icon.style.borderColor = api.armyColors[armyColor];
        if (armyColor) icon.style.borderWidth = '3px';
        icon.title = civName;
        return icon;
    }

    function statusBar(label, ratio, color, revealValue) {
        ratio = Math.max(0, Math.min(1, ratio || 0));
        var bar = make("span", "military-unit-status");
        var fill = make("span", "military-unit-status-fill");
        fill.style.width = ratio * 100 + "%";
        fill.style.backgroundColor = color;
        bar.appendChild(fill);
        bar.setAttribute("aria-label", label);
        if (revealValue) bar.title = label + ": " + number(ratio * 100, 0) + "%";
        return bar;
    }

    function renderDivision(division, owned, enemyScale) {
        var stats = api.getDivisionStats(division.id);
        var shown = displayedStats(stats, enemyScale);
        var row = make("div", "military-unit-row");
        row.dataset.divisionId = division.id;
        row.dataset.owned = owned ? "true" : "false";
        row.dataset.selected = selectedIds.indexOf(division.id) >= 0 ? "true" : "false";
        row.classList.add(owned ? "military-unit-owned" : "military-unit-enemy");
        if (owned) {
            row.tabIndex = 0;
            row.setAttribute("role", "option");
            row.setAttribute("aria-selected", row.dataset.selected);
            row.setAttribute("aria-label", "Select only " + divisionName(division));
            row.title = "Left-click: select only this unit. Shift-left-click: toggle selection. Right-click: pin details.";
        }
        var heading = make("div", "military-unit-heading");
        var title = make("strong", "military-panel-title");
        title.appendChild(unitIcon(division.civ, division.armyColor));
        title.appendChild(make("span", "military-unit-name", divisionName(division)));
        heading.appendChild(title);
        var men = make("span", "military-unit-men", (owned ? "" : "~") + manpowerLabel(shown.manpower));
        men.title = owned ? number(shown.manpower) + " / " + number(shown.maxManpower) + " men" : "Estimated manpower";
        heading.appendChild(men);
        var ribbon = make("span", "military-unit-ribbon");
        ribbon.style.backgroundColor = api.armyColors[division.armyColor] || "transparent";
        ribbon.title = division.armyColor || "No army";
        heading.appendChild(ribbon);

        if (owned) {
            var actions = make("span", "military-unit-actions");
            var deselect = button("×", "deselect", division.id);
            deselect.title = "Deselect";
            deselect.setAttribute("aria-label", "Deselect " + divisionName(division));
            actions.appendChild(deselect);
            heading.appendChild(actions);
        }
        row.appendChild(heading);
        var bars = make("div", "military-unit-status-bars");
        bars.appendChild(statusBar("HP", shown.morale, "rgb(145, 205, 16)", owned));
        bars.appendChild(statusBar("Manpower", shown.maxManpower ? shown.manpower / shown.maxManpower : 0,
            "rgb(255, 122, 0)", owned));
        row.appendChild(bars);
        return row;
    }

    function positionUnitDetail(row) {
        if (!unitDetail || !row) return;
        var bounds = row.getBoundingClientRect();
        var detailWidth = unitDetail.offsetWidth || 352;
        var left = Math.max(8, bounds.left - detailWidth - 8);
        var top = Math.max(8, Math.min(bounds.top, global.innerHeight - unitDetail.offsetHeight - 8));
        if (left < 8 || bounds.left < detailWidth + 16) {
            left = Math.max(8, Math.min(bounds.right - detailWidth, global.innerWidth - detailWidth - 8));
            top = Math.max(8, Math.min(bounds.bottom + 6, global.innerHeight - unitDetail.offsetHeight - 8));
        }
        unitDetail.style.left = left + "px";
        unitDetail.style.top = top + "px";
    }

    function hideUnitDetail(force) {
        if (!unitDetail || (!force && pinnedDetailId)) return;
        unitDetail.hidden = true;
        unitDetail.classList.remove("is-pinned");
        if (force) pinnedDetailId = null;
    }

    function showUnitDetail(divisionId, row, pinned) {
        var division = api.getDivision(divisionId);
        if (!division || division.civ !== activeCivName()) return;
        var stats = api.getDivisionStats(division.id);
        unitDetail.replaceChildren();
        var heading = make("div", "military-unit-detail-heading");
        var title = make("strong", "military-panel-title");
        title.appendChild(unitIcon(division.civ, division.armyColor));
        title.appendChild(make("span", "military-unit-name", divisionName(division)));
        heading.appendChild(title);
        if (pinned) heading.appendChild(button("Close", "close-detail"));
        unitDetail.appendChild(heading);
        var grid = make("div", "military-stat-grid");
        appendStats(grid, stats);
        unitDetail.appendChild(grid);
        if (pinned) {
            var actions = make("div", "military-unit-detail-actions");
            actions.appendChild(button("Disband division", "disband", division.id));
            unitDetail.appendChild(actions);
        }
        pinnedDetailId = pinned ? division.id : null;
        unitDetail.classList.toggle("is-pinned", !!pinned);
        unitDetail.hidden = false;
        positionUnitDetail(row);
    }

    function renderSelection() {
        if (!unitPanel) return;
        var divisions = getSelectedDivisions();
        if (!divisions.length) {
            selectedIds = [];
            selectedTile = null;
            unitPanel.hidden = true;
            hideUnitDetail(true);
            return;
        }

        selectedTile = { row: divisions[0].row, col: divisions[0].col };
        var activeCiv = activeCivName();
        var owned = divisions.every(function (division) { return division.civ === activeCiv; });
        unitPanel.hidden = false;
        renderArmies(owned);
        renderStackSummary(divisions, owned);
        unitList.replaceChildren();

        var enemyScale = null;
        if (!owned) {
            var actual = api.getStackStats(divisions, selectedTile.row, selectedTile.col);
            var intel = enemyIntel(divisions, actual);
            enemyScale = {
                manpower: actual.manpower ? intel.manpower.estimate / actual.manpower : 1,
                morale: intel.morale.estimate,
                attack: actual.attack ? intel.stats.attack / actual.attack : 1,
                defense: actual.defense ? intel.stats.defense / actual.defense : 1
            };
        }
        var listed = api.resolveDivisions(listedIds).filter(function (division) {
            return division.civ === divisions[0].civ;
        });
        listedIds = listed.map(function (division) { return division.id; });
        listed.forEach(function (division) {
            unitList.appendChild(renderDivision(division, owned, enemyScale));
        });
        if (pinnedDetailId) {
            var pinnedRow = unitList.querySelector('[data-division-id="' + pinnedDetailId + '"]');
            if (pinnedRow) showUnitDetail(pinnedDetailId, pinnedRow, true);
            else hideUnitDetail(true);
        }
    }

    function createUnitPanel() {
        unitPanel = make("aside", "military-unit-panel");
        unitPanel.id = "military-unit-panel";
        unitPanel.hidden = true;
        var header = make("div", "military-panel-header");
        header.appendChild(make("h3", "", "Divisions"));
        var headerActions = make("span", "military-unit-actions");
        headerActions.appendChild(button("Manpower overlay", "toggle-overlay"));
        headerActions.appendChild(button("Close", "clear"));
        header.appendChild(headerActions);
        unitPanel.appendChild(header);
        var help = button("?", "help");
        help.title = "Right-click: move. Alt-right-click: queue (first target starts next turn). Right-click current tile or target: cancel. Shift-left-click map tiles to add units; Shift-left-click unit rows toggles selection. Right-click a row pins details.";
        headerActions.appendChild(help);
        armySummary = make("section", "military-army-summary");
        armyRibbons = make("div", "military-army-ribbons");
        Object.keys(api.armyColors).concat(["none"]).forEach(function (color) {
            var ribbon = button(color === "none" ? "None" : "", "mark-army", color);
            ribbon.style.backgroundColor = api.armyColors[color] || "transparent";
            ribbon.title = color === "none" ? "Unmark selected units" : "Assign selected units to " + color + " army";
            ribbon.setAttribute("aria-label", ribbon.title);
            armyRibbons.appendChild(ribbon);
        });
        unitPanel.appendChild(armySummary);
        unitPanel.appendChild(armyRibbons);
        stackSummary = make("section", "military-stack-summary");
        unitList = make("section", "military-unit-list");
        unitList.setAttribute("role", "listbox");
        unitList.setAttribute("aria-multiselectable", "true");
        unitList.setAttribute("aria-label", "Divisions");
        unitPanel.appendChild(stackSummary);
        unitPanel.appendChild(unitList);
        unitPanel.addEventListener("click", onUnitPanelClick);
        unitPanel.addEventListener("contextmenu", onUnitPanelContextMenu);
        unitPanel.addEventListener("mouseover", onUnitPanelMouseOver);
        unitPanel.addEventListener("mouseout", onUnitPanelMouseOut);
        unitPanel.addEventListener("keydown", onUnitPanelKeyDown);
        document.body.appendChild(unitPanel);

        unitDetail = make("aside", "military-unit-detail");
        unitDetail.hidden = true;
        unitDetail.addEventListener("click", onUnitDetailClick);
        document.body.appendChild(unitDetail);
    }

    function onUnitPanelClick(event) {
        var target = event.target.closest("button[data-action]");
        if (!target) {
            var row = event.target.closest(".military-unit-row[data-owned='true']");
            if (!row) return;
            selectOnly(row.dataset.divisionId, event.shiftKey);
            return;
        }
        var action = target.dataset.action;
        if (action === "help") {
            notify(target.title);
        } else if (action === "select-army") {
            hideUnitDetail(true);
            selectedIds = api.getDivisions(activeCivName()).filter(function (division) {
                return (division.armyColor || "none") === target.dataset.value;
            }).map(function (division) { return division.id; });
            listedIds = selectedIds.slice();
            renderSelection();
            redraw();
        } else if (action === "mark-army") {
            getSelectedDivisions().forEach(function (division) {
                if (division.civ === activeCivName()) api.setDivisionArmy(division.id, target.dataset.value);
            });
            renderSelection();
            redraw();
        } else if (action === "clear") {
            clearSelection();
        } else if (action === "toggle-overlay") {
            setManpowerOverlay(!showManpowerOverlay);
        } else if (action === "deselect") {
            if (pinnedDetailId === target.dataset.value) hideUnitDetail(true);
            selectedIds = selectedIds.filter(function (id) { return String(id) !== target.dataset.value; });
            renderSelection();
            redraw();
        }
    }

    function selectOnly(id, toggle) {
        hideUnitDetail(true);
        if (toggle && selectedIds.indexOf(id) < 0) selectedIds.push(id);
        else if (toggle) selectedIds = selectedIds.filter(function (selected) { return selected !== id; });
        else selectedIds = [id];
        renderSelection();
        redraw();
    }

    function onUnitPanelContextMenu(event) {
        var row = event.target.closest(".military-unit-row[data-owned='true']");
        if (!row) return;
        event.preventDefault();
        showUnitDetail(row.dataset.divisionId, row, true);
    }

    function onUnitPanelMouseOver(event) {
        if (pinnedDetailId) return;
        var row = event.target.closest(".military-unit-row[data-owned='true']");
        if (!row || row.contains(event.relatedTarget)) return;
        showUnitDetail(row.dataset.divisionId, row, false);
    }

    function onUnitPanelMouseOut(event) {
        if (pinnedDetailId) return;
        var row = event.target.closest(".military-unit-row[data-owned='true']");
        if (!row || row.contains(event.relatedTarget)) return;
        hideUnitDetail(false);
    }

    function onUnitPanelKeyDown(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var row = event.target.closest(".military-unit-row[data-owned='true']");
        if (!row || event.target.closest("button")) return;
        event.preventDefault();
        selectOnly(row.dataset.divisionId, event.shiftKey);
    }

    function onUnitDetailClick(event) {
        var target = event.target.closest("button[data-action]");
        if (!target) return;
        if (target.dataset.action === "close-detail") {
            hideUnitDetail(true);
        } else if (target.dataset.action === "disband") {
            var division = api.getDivision(target.dataset.value);
            if (division && global.confirm("Disband " + divisionName(division) + " and return its manpower to population?")) {
                api.disbandDivision(division.id);
                hideUnitDetail(true);
                renderSelection();
                refreshRecruitment();
                redraw();
            }
        }
    }

    function clearSelection() {
        selectedIds = [];
        listedIds = [];
        selectedTile = null;
        hideUnitDetail(true);
        renderSelection();
        redraw();
    }

    function selectHalf() {
        if (selectedIds.length < 2) return false;
        selectedIds = selectedIds.slice(0, Math.ceil(selectedIds.length / 2));
        if (pinnedDetailId && selectedIds.indexOf(pinnedDetailId) < 0) hideUnitDetail(true);
        renderSelection();
        redraw();
        return true;
    }

    function unselectLast() {
        if (!selectedIds.length) return false;
        var removed = selectedIds.pop();
        if (pinnedDetailId === removed) hideUnitDetail(true);
        renderSelection();
        redraw();
        return true;
    }

    function isTextEntry(element) {
        if (!element) return false;
        return element.tagName === "INPUT" || element.tagName === "TEXTAREA" ||
            element.tagName === "SELECT" || element.isContentEditable;
    }

    function onKeyboardShortcut(event) {
        if (isTextEntry(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
        var handled = false;
        if (event.key && event.key.toLowerCase() === "h") handled = selectHalf();
        else if (event.key === "Escape") handled = unselectLast();
        if (handled) event.preventDefault();
    }

    function selectTile(row, col, event) {
        placementTile = { row: row, col: col };
        var activeCiv = activeCivName();
        var divisions = api.getDivisionsAt(row, col);
        var owned = divisions.filter(function (division) { return division.civ === activeCiv; });
        var visible = owned.length ? owned : divisions.filter(function (division) { return division.civ !== activeCiv; });
        if (event && event.shiftKey) {
            var previous = getSelectedDivisions().filter(function (division) { return division.civ === activeCiv; });
            selectedIds = previous.map(function (division) { return division.id; });
            owned.forEach(function (division) {
                if (selectedIds.indexOf(division.id) < 0) selectedIds.push(division.id);
            });
            listedIds = Array.from(new Set(listedIds.concat(selectedIds)));
        } else {
            selectedIds = visible.map(function (division) { return division.id; });
            listedIds = selectedIds.slice();
        }
        selectedTile = selectedIds.length ? { row: row, col: col } : null;
        renderSelection();
        refreshRecruitmentLocation();
        redraw();
        return selectedIds.length > 0;
    }

    function onTileRightClick(row, col, event) {
        var activeCiv = activeCivName();
        var owned = getSelectedDivisions().filter(function (division) { return division.civ === activeCiv; });
        if (!owned.length) return false;
        var result = api.orderDivisions(owned.map(function (division) { return division.id; }), row, col, {
            human: true,
            append: !!(event && event.altKey)
        });
        if (!result.ok) notify(resultReason(result));
        var survivors = getSelectedDivisions();
        selectedIds = survivors.map(function (division) { return division.id; });
        selectedTile = survivors.length ? { row: survivors[0].row, col: survivors[0].col } : null;
        renderSelection();
        refreshRecruitment();
        redraw();
        return true;
    }

    function input(type, className, value) {
        var element = make("input", className);
        element.type = type;
        if (value !== undefined) element.value = value;
        return element;
    }

    function labelledInput(labelText, element) {
        var row = make("div", "military-form-row");
        var label = make("label", "", labelText);
        label.appendChild(element);
        row.appendChild(label);
        return row;
    }

    function createRecruitmentPanel(target) {
        recruitmentPanel = make("section", "military-recruitment");
        recruitmentPanel.id = "military-recruitment";
        recruitmentPanel.appendChild(make("h3", "", "Military"));
        recruitmentPanel.appendChild(make("div", "military-upkeep-summary"));

        var settings = make("div", "military-settings");
        var growth = input("number", "military-growth-share");
        growth.min = "0";
        growth.max = "100";
        growth.step = "5";
        var upkeep = input("number", "military-upkeep-share");
        upkeep.min = "0";
        upkeep.max = "100";
        upkeep.step = "5";
        settings.appendChild(labelledInput("Growth to military (%) ", growth));
        settings.appendChild(labelledInput("Cash available for upkeep (%) ", upkeep));
        recruitmentPanel.appendChild(settings);

        var overlaySetting = make("label", "military-overlay-setting");
        var overlay = input("checkbox", "military-overlay-toggle");
        overlaySetting.appendChild(overlay);
        overlaySetting.appendChild(document.createTextNode("Show manpower over the map"));
        recruitmentPanel.appendChild(overlaySetting);

        recruitmentPanel.appendChild(make("h4", "", "Recruit training queue"));
        var recruitForm = make("div", "military-recruit-form");
        var recruitName = input("text", "military-recruit-name");
        recruitName.placeholder = "Division name";
        recruitName.required = true;
        var recruitMen = input("number", "military-recruit-men", 10000);
        recruitMen.min = "1000";
        recruitMen.step = "1000";
        var recruitFields = make("div", "military-recruit-fields");
        recruitFields.appendChild(labelledInput("Name ", recruitName));
        recruitFields.appendChild(labelledInput("Manpower cap ", recruitMen));
        recruitForm.appendChild(recruitFields);
        recruitForm.appendChild(button("Add recruit queue", "recruit"));
        recruitmentPanel.appendChild(recruitForm);

        recruitmentPanel.appendChild(make("h4", "", "Immediate conscription"));
        var conscriptForm = make("div", "military-recruit-form");
        var conscriptName = input("text", "military-conscript-name");
        conscriptName.placeholder = "Division name";
        conscriptName.required = true;
        var conscriptMen = input("number", "military-conscript-men", 10000);
        conscriptMen.min = "1000";
        conscriptMen.step = "1000";
        var conscriptFields = make("div", "military-recruit-fields");
        conscriptFields.appendChild(labelledInput("Name ", conscriptName));
        conscriptFields.appendChild(labelledInput("Manpower cap ", conscriptMen));
        conscriptForm.appendChild(conscriptFields);
        conscriptForm.appendChild(button("Conscript at selected tile", "conscript"));
        conscriptForm.appendChild(make("div", "military-location-hint"));
        recruitmentPanel.appendChild(conscriptForm);

        var queueHeading = make("div", "military-section-heading");
        queueHeading.appendChild(make("h4", "", "Training queues"));
        queueHeading.appendChild(button("Deploy all", "deploy-all"));
        recruitmentPanel.appendChild(queueHeading);
        var queueTable = make("table", "military-queue-table");
        queueTable.innerHTML = "<thead><tr><th>Name</th><th>Progress</th><th>Recovered</th><th>Upkeep</th><th>Deploy / Disband</th></tr></thead><tbody></tbody>";
        recruitmentPanel.appendChild(queueTable);
        recruitmentPanel.addEventListener("change", onRecruitmentChange);
        recruitmentPanel.addEventListener("click", onRecruitmentClick);
        target.appendChild(recruitmentPanel);
        refreshRecruitment();
    }

    function onRecruitmentChange(event) {
        var civName = activeCivName();
        if (event.target.classList.contains("military-growth-share")) {
            api.setGrowthShare(civName, Math.max(0, Math.min(100, Number(event.target.value))) / 100);
        } else if (event.target.classList.contains("military-upkeep-share")) {
            api.setMaxUpkeepShare(civName, Math.max(0, Math.min(100, Number(event.target.value))) / 100);
        } else if (event.target.classList.contains("military-overlay-toggle")) {
            setManpowerOverlay(event.target.checked);
        }
        refreshRecruitment();
    }

    function onRecruitmentClick(event) {
        var target = event.target.closest("button[data-action]");
        if (!target) return;
        var action = target.dataset.action;
        var civName = activeCivName();
        if (action === "recruit") {
            var recruitCap = Number(recruitmentPanel.querySelector(".military-recruit-men").value);
            var recruitName = recruitmentPanel.querySelector(".military-recruit-name").value.trim();
            if (!recruitName) {
                notify("Enter a division name first.");
                return;
            }
            var recruitResult = api.createRecruitQueue(civName, recruitCap, { name: recruitName });
            if (!recruitResult.ok) {
                notify(resultReason(recruitResult));
            } else {
                recruitmentPanel.querySelector(".military-recruit-name").value = nextDivisionName(recruitName);
            }
        } else if (action === "conscript") {
            var conscriptCap = Number(recruitmentPanel.querySelector(".military-conscript-men").value);
            var conscriptName = recruitmentPanel.querySelector(".military-conscript-name").value.trim();
            if (!conscriptName) {
                notify("Enter a division name first.");
                return;
            }
            if (!placementTile || !ownTile(placementTile.row, placementTile.col)) {
                notify("Select an owned map tile for this division first.");
                return;
            }
            var conscriptResult = api.conscript(civName, placementTile.row, placementTile.col, conscriptCap, { name: conscriptName });
            if (!conscriptResult.ok) notify(resultReason(conscriptResult));
            else {
                recruitmentPanel.querySelector(".military-conscript-name").value = nextDivisionName(conscriptName);
                selectTile(placementTile.row, placementTile.col);
            }
        } else if (action === "deploy") {
            var deployResult = api.deployQueue(target.dataset.value);
            if (!deployResult.ok) notify(resultReason(deployResult));
        } else if (action === "deploy-all") {
            var deployed = 0;
            api.getQueues(civName).slice().forEach(function (queue) {
                if (queue.manpower <= 0) return;
                if (api.deployQueue(queue.id).ok) deployed++;
            });
            if (!deployed) notify("No training queues currently have manpower to deploy.");
        } else if (action === "cancel-queue") {
            var queue = api.getQueue(target.dataset.value);
            var name = queue && (queue.name || "Queue " + queue.id);
            if (queue && global.confirm("Disband " + name + " and return its manpower to population?")) {
                api.cancelQueue(queue.id);
            }
        }
        refreshRecruitment();
        renderSelection();
        redraw();
    }

    function refreshRecruitmentLocation() {
        if (!recruitmentPanel) return;
        var hint = recruitmentPanel.querySelector(".military-location-hint");
        if (placementTile && ownTile(placementTile.row, placementTile.col)) {
            hint.textContent = "Spawn tile: " + placementTile.row + ", " + placementTile.col;
        } else {
            hint.textContent = "Select an owned map tile before conscripting.";
        }
    }

    function renderQueues(civName) {
        var body = recruitmentPanel.querySelector(".military-queue-table tbody");
        body.replaceChildren();
        var queues = api.getQueues(civName);
        if (!queues.length) {
            var emptyRow = make("tr");
            var empty = make("td", "military-empty-queue", "No divisions are training.");
            empty.colSpan = 5;
            emptyRow.appendChild(empty);
            body.appendChild(emptyRow);
            return;
        }
        queues.forEach(function (queue) {
            var row = make("tr");
            row.appendChild(make("td", "", queue.name || "Division " + queue.id));
            row.appendChild(make("td", "", number(queue.manpower) + " / " + number(queue.maxManpower) + " (request " + number(Math.max(0, queue.maxManpower - queue.manpower)) + ")"));
            row.appendChild(make("td", "", "+" + number(queue.recoveredLastTurn)));
            var upkeep = api.getFormationUpkeep(queue);
            row.appendChild(make("td", "", "$" + number(upkeep, 2)));
            var actionCell = make("td");
            var actions = make("span", "military-queue-actions");
            var deploy = button("Deploy", "deploy", queue.id);
            deploy.disabled = queue.manpower <= 0;
            actions.appendChild(deploy);
            actions.appendChild(button("Disband", "cancel-queue", queue.id));
            actionCell.appendChild(actions);
            row.appendChild(actionCell);
            body.appendChild(row);
        });
    }

    function refreshRecruitment() {
        if (!recruitmentPanel || !activeCivName()) return;
        var civName = activeCivName();
        var settings = api.getSettings(civName);
        recruitmentPanel.querySelector(".military-upkeep-summary").textContent =
            "Current active and training upkeep: $" + number(api.getUpkeep(civName), 2) + " per quarter";
        recruitmentPanel.querySelector(".military-growth-share").value = number(settings.growthShare * 100, 0).replace(/,/g, "");
        recruitmentPanel.querySelector(".military-upkeep-share").value = number(settings.maxUpkeepShare * 100, 0).replace(/,/g, "");
        recruitmentPanel.querySelector(".military-overlay-toggle").checked = showManpowerOverlay;
        renderQueues(civName);
        refreshRecruitmentLocation();
    }

    function manpowerLabel(manpower) {
        if (manpower >= 1000000) return number(manpower / 1000000, 1) + "m";
        if (manpower >= 1000) return number(manpower / 1000, manpower < 10000 ? 1 : 0) + "k";
        return number(manpower);
    }

    function drawOrders(context, blockSize) {
        context.save();
        context.strokeStyle = "#ffdc63";
        context.fillStyle = "#ffdc63";
        context.lineWidth = Math.max(1.5, blockSize * 0.07);
        getSelectedDivisions().forEach(function (division) {
            if (division.civ !== activeCivName()) return;
            var from = [division.row, division.col];
            (division.moveTargets || []).forEach(function (target, index) {
                var x = (target[1] + 0.5) * blockSize;
                var y = (target[0] + 0.5) * blockSize;
                var startX = (from[1] + 0.5) * blockSize;
                var startY = (from[0] + 0.5) * blockSize;
                var angle = Math.atan2(y - startY, x - startX);
                var size = Math.max(4, blockSize * 0.25);
                context.beginPath();
                context.moveTo(startX, startY);
                context.lineTo(x, y);
                context.stroke();
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5));
                context.lineTo(x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5));
                context.closePath();
                context.fill();
                context.font = Math.max(9, blockSize * 0.4) + "px sans-serif";
                context.fillText(String(index + 1), x + 3, y - 3);
                from = target;
            });
        });
        context.restore();
    }

    function drawSelection(context, blockSize) {
        if (!selectedTile) return;
        context.save();
        context.strokeStyle = "rgba(255, 255, 255, 0.95)";
        context.lineWidth = Math.max(2, blockSize * 0.08);
        var drawn = {};
        getSelectedDivisions().forEach(function (division) {
            var key = division.row + ":" + division.col;
            if (drawn[key]) return;
            drawn[key] = true;
            context.strokeRect(
                division.col * blockSize + context.lineWidth / 2,
                division.row * blockSize + context.lineWidth / 2,
                blockSize - context.lineWidth,
                blockSize - context.lineWidth
            );
        });
        context.restore();
    }

    function getTileStacks() {
        var totals = new Map();
        api.getDivisions().forEach(function (division) {
            if (division.manpower <= 0) return;
            var key = division.row + "," + division.col;
            var total = totals.get(key);
            if (!total) {
                total = { row: division.row, col: division.col, manpower: 0, divisions: [] };
                totals.set(key, total);
            }
            total.manpower += division.manpower;
            total.divisions.push(division);
        });
        return totals;
    }

    function drawUnitMarkers(context, blockSize, totals) {
        context.save();
        totals.forEach(function (total) {
            var groups = {};
            total.divisions.forEach(function (division) {
                (groups[division.civ] || (groups[division.civ] = [])).push(division);
            });

            var size = Math.max(6, Math.min(13, blockSize * 0.42));
            var visible = Object.keys(groups).slice(0, 3);
            visible.forEach(function (civName, index) {
                var divisions = groups[civName];
                divisions.sort(function (a, b) {
                    return Number(!!b.armyColor) - Number(!!a.armyColor);
                });
                var count = divisions.length;
                var layers = Math.min(4, count);
                var offset = Math.max(1.25, size * 0.13);
                var x = total.col * blockSize + blockSize - size - 1 - index * Math.max(3, size * 0.58);
                var y = total.row * blockSize + blockSize - size - 1;
                for (var layer = layers - 1; layer >= 0; layer--) {
                    var layerX = x - layer * offset;
                    var layerY = y - layer * offset;
                    context.fillStyle = civColor(civName);
                    context.fillRect(layerX, layerY, size, size);
                    context.strokeStyle = api.armyColors[divisions[layer].armyColor] || civTextColor(civName);
                    context.lineWidth = Math.max(1, size * 0.09);
                    context.strokeRect(layerX + context.lineWidth / 2, layerY + context.lineWidth / 2,
                        size - context.lineWidth, size - context.lineWidth);
                }
                if (size >= 8) {
                    context.fillStyle = civTextColor(civName);
                    context.font = "bold " + Math.floor(size * (count > 9 ? 0.55 : 0.68)) + "px 'Roboto Mono', monospace";
                    context.textAlign = "center";
                    context.textBaseline = "middle";
                    context.fillText(count > 99 ? "99+" : String(count), x + size / 2, y + size / 2 + size * 0.04);
                }
            });
        });
        context.restore();
    }

    function drawManpower(context, blockSize, totals) {

        context.save();
        context.textAlign = "center";
        context.textBaseline = "top";
        context.font = "bold " + Math.max(7, Math.floor(blockSize * 0.32)) + "px 'Roboto Mono', monospace";
        context.lineJoin = "round";
        totals.forEach(function (total) {
            var x = total.col * blockSize;
            var y = total.row * blockSize;
            var displayedManpower = total.manpower;
            var civName = total.divisions[0].civ;
            var approximate = total.divisions.some(function (division) {
                return division.civ !== activeCivName();
            });
            if (approximate) {
                displayedManpower = intelRange(
                    total.manpower,
                    0.25,
                    intelKey(total.row, total.col, total.divisions) + ":men",
                    0,
                    Infinity
                ).estimate;
            }
            var label = (approximate ? "~" : "") + manpowerLabel(displayedManpower);
            context.lineWidth = Math.max(2, blockSize * 0.1);
            context.strokeStyle = civColor(civName);
            context.strokeText(label, x + blockSize / 2, y + 1);
            context.fillStyle = civTextColor(civName);
            context.fillText(label, x + blockSize / 2, y + 1);
        });
        context.restore();
    }

    function drawOverlay(context, blockSize) {
        var totals = getTileStacks();
        if (showUnitMarkers) {
            drawUnitMarkers(context, blockSize, totals);
            if (showManpowerOverlay) drawManpower(context, blockSize, totals);
        }
        drawOrders(context, blockSize);
        drawSelection(context, blockSize);
    }

    function setManpowerOverlay(enabled) {
        showManpowerOverlay = !!enabled;
        if (recruitmentPanel) recruitmentPanel.querySelector(".military-overlay-toggle").checked = showManpowerOverlay;
        redraw();
    }

    function setUnitMarkersVisible(enabled) {
        showUnitMarkers = !!enabled;
        redraw();
    }

    function refresh() {
        var activeCiv = activeCivName();
        if (lastActiveCiv !== null && activeCiv !== lastActiveCiv) {
            selectedIds = [];
            listedIds = [];
            selectedTile = null;
            placementTile = null;
        }
        lastActiveCiv = activeCiv;
        renderSelection();
        refreshRecruitment();
    }

    function init(initOptions) {
        options = initOptions || {};
        api = options.military || global.Military;
        lastActiveCiv = activeCivName();
        if (!unitPanel) createUnitPanel();
        if (!MilitaryUI.keyboardShortcutsReady) {
            document.addEventListener("keydown", onKeyboardShortcut);
            MilitaryUI.keyboardShortcutsReady = true;
        }
        if (options.recruitmentTarget && !recruitmentPanel) {
            var target = typeof options.recruitmentTarget === "string"
                ? document.querySelector(options.recruitmentTarget)
                : options.recruitmentTarget;
            if (target) createRecruitmentPanel(target);
        }
        refresh();
        return MilitaryUI;
    }

    var MilitaryUI = {
        init: init,
        refresh: refresh,
        refreshRecruitment: refreshRecruitment,
        selectTile: selectTile,
        onTileClick: selectTile,
        onTileRightClick: onTileRightClick,
        clearSelection: clearSelection,
        selectHalf: selectHalf,
        unselectLast: unselectLast,
        drawOverlay: drawOverlay,
        setManpowerOverlay: setManpowerOverlay,
        setUnitMarkersVisible: setUnitMarkersVisible,
        isManpowerOverlayEnabled: function () { return showManpowerOverlay; },
        areUnitMarkersVisible: function () { return showUnitMarkers; },
        getSelection: function () { return selectedIds.slice(); },
        getSelectedTile: function () {
            return selectedTile && { row: selectedTile.row, col: selectedTile.col };
        }
    };

    global.MilitaryUI = MilitaryUI;
})(window);
