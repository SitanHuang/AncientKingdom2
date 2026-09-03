(function (global) {
    "use strict";

    var api = null;
    var selectedIds = [];
    var selectedTile = null;
    var placementTile = null;
    var unitPanel = null;
    var unitList = null;
    var stackSummary = null;
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
        var element = make("button", "", text);
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
        return make("span", "", label + ": " + value);
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

    function appendStats(container, stats, enemyScale) {
        stats = displayedStats(stats, enemyScale);
        container.appendChild(stat("Men", number(stats.manpower) + " / " + number(stats.maxManpower)));
        container.appendChild(stat("Requested", number(Math.max(0, stats.requestedManpower))));
        container.appendChild(stat("Recovered", number(stats.recoveredLastTurn)));
        container.appendChild(stat("Experience", number(stats.experience, 2)));
        container.appendChild(stat("Morale", number(stats.morale, 2)));
        container.appendChild(stat("Entrenchment", number(stats.entrenchment, 2)));
        container.appendChild(stat("Attack", number(stats.attack, 1)));
        container.appendChild(stat("Defense", number(stats.defense, 1)));
        container.appendChild(stat("Moves", number(stats.movesRemaining, 0) + " / " + number(stats.moveLimit, 0)));
        if (stats.buildingBonus > 1) container.appendChild(stat("Building defense", "+" + percent(stats.buildingBonus - 1)));
        if (stats.encirclement !== undefined) container.appendChild(stat("Encirclement", percent(1 - stats.encirclement)));
        if (stats.upkeep !== undefined) container.appendChild(stat("Upkeep", "$" + number(stats.upkeep, 2)));
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

    function renderStackSummary(divisions, owned) {
        stackSummary.replaceChildren();
        var actual = api.getStackStats(divisions, selectedTile.row, selectedTile.col);
        var title = make("div", "military-panel-title");
        var icon = unitIcon(divisions[0].civ);
        title.appendChild(icon);
        title.appendChild(make("strong", "", divisions.length + (divisions.length === 1 ? " division" : " divisions") + " at " + selectedTile.row + ", " + selectedTile.col));
        stackSummary.appendChild(title);

        var grid = make("div", "military-stat-grid");
        if (owned) {
            appendStats(grid, actual);
        } else {
            var intel = enemyIntel(divisions, actual);
            var estimated = intel.stats;
            appendStats(grid, estimated);
            stackSummary.appendChild(make("div", "military-intel-note", "Enemy count is exact. Estimates refresh each quarter."));
            var intelRows = make("div", "military-intel");
            intelRows.appendChild(rangeBar("Men", intel.manpower, actual.maxManpower, civColor(divisions[0].civ)));
            intelRows.appendChild(rangeBar("Morale", intel.morale, 2, "#b17b22"));
            stackSummary.appendChild(intelRows);
        }
        stackSummary.insertBefore(grid, stackSummary.children[1] || null);
    }

    function unitIcon(civName) {
        var icon = make("span", "military-unit-icon", (civName || "?").charAt(0).toUpperCase());
        icon.style.backgroundColor = civColor(civName);
        icon.style.color = civTextColor(civName);
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
        row.classList.add(owned ? "military-unit-owned" : "military-unit-enemy");
        if (owned) {
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-label", "View details for " + divisionName(division));
        }
        var heading = make("div", "military-unit-heading");
        var title = make("strong", "military-panel-title");
        title.appendChild(unitIcon(division.civ));
        title.appendChild(make("span", "military-unit-name", divisionName(division)));
        heading.appendChild(title);

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
        title.appendChild(unitIcon(division.civ));
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

        var activeCiv = activeCivName();
        var owned = divisions.every(function (division) { return division.civ === activeCiv; });
        unitPanel.hidden = false;
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
        divisions.forEach(function (division) {
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
        stackSummary = make("section", "military-stack-summary");
        unitList = make("section", "military-unit-list");
        unitPanel.appendChild(stackSummary);
        unitPanel.appendChild(unitList);
        unitPanel.addEventListener("click", onUnitPanelClick);
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
            var divisionId = row.dataset.divisionId;
            if (pinnedDetailId === divisionId) hideUnitDetail(true);
            else showUnitDetail(divisionId, row, true);
            return;
        }
        var action = target.dataset.action;
        if (action === "clear") {
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
        if (pinnedDetailId === row.dataset.divisionId) hideUnitDetail(true);
        else showUnitDetail(row.dataset.divisionId, row, true);
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
        selectedTile = null;
        hideUnitDetail(true);
        renderSelection();
        redraw();
    }

    function selectTile(row, col) {
        placementTile = { row: row, col: col };
        var activeCiv = activeCivName();
        var divisions = api.getDivisionsAt(row, col);
        var owned = divisions.filter(function (division) { return division.civ === activeCiv; });
        var visible = owned.length ? owned : divisions.filter(function (division) { return division.civ !== activeCiv; });
        selectedTile = visible.length ? { row: row, col: col } : null;
        selectedIds = visible.map(function (division) { return division.id; });
        renderSelection();
        refreshRecruitmentLocation();
        redraw();
        return visible.length > 0;
    }

    function selectionAfterAction(targetRow, targetCol) {
        var selected = getSelectedDivisions();
        if (!selectedTile) {
            selectedIds = [];
            renderSelection();
            refreshRecruitment();
            redraw();
            return;
        }
        var atTarget = selected.filter(function (division) {
            return division.row === targetRow && division.col === targetCol;
        });
        var keep = atTarget.length ? atTarget : selected.filter(function (division) {
            return division.row === selectedTile.row && division.col === selectedTile.col;
        });
        selectedIds = keep.map(function (division) { return division.id; });
        if (keep.length) selectedTile = { row: keep[0].row, col: keep[0].col };
        renderSelection();
        refreshRecruitment();
        redraw();
    }

    function actionMessage(result) {
        if (!result) return;
        if (result.ok === false || result.error) notify(resultReason(result) || result.error);
    }

    function onTileRightClick(row, col) {
        var divisions = getSelectedDivisions();
        var activeCiv = activeCivName();
        var owned = divisions.filter(function (division) { return division.civ === activeCiv; });
        if (!owned.length) return false;

        var targetDivisions = api.getDivisionsAt(row, col);
        var enemies = targetDivisions.filter(function (division) { return division.civ !== activeCiv; });
        var ids = owned.map(function (division) { return division.id; });
        var result;
        if (enemies.length) {
            result = api.attack(ids, row, col, { human: true });
        } else {
            result = api.moveDivisions(ids, row, col, { human: true, partial: true });
        }
        actionMessage(result);
        selectionAfterAction(row, col);
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
                recruitmentPanel.querySelector(".military-recruit-name").value = recruitName.replace(/([^\d])(\d+)(?!.*\d)/, (_, prefix, n) =>
                    prefix + (Number(n) + 1)
                );
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
                recruitmentPanel.querySelector(".military-conscript-name").value = "";
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
            var civ = global.civs[civName];
            var upkeepModifier = 1 + ((civ.gov && civ.gov.mods && civ.gov.mods.MUKCT) || 0);
            var upkeep = api.legacyEquivalent(civ, queue.manpower) / 4 * Math.max(0, upkeepModifier);
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

    function drawSelection(context, blockSize) {
        if (!selectedTile) return;
        context.save();
        context.strokeStyle = "rgba(255, 255, 255, 0.95)";
        context.lineWidth = Math.max(2, blockSize * 0.08);
        context.strokeRect(
            selectedTile.col * blockSize + context.lineWidth / 2,
            selectedTile.row * blockSize + context.lineWidth / 2,
            blockSize - context.lineWidth,
            blockSize - context.lineWidth
        );
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
                groups[division.civ] = (groups[division.civ] || 0) + 1;
            });

            var size = Math.max(6, Math.min(13, blockSize * 0.42));
            var visible = Object.keys(groups).slice(0, 3);
            visible.forEach(function (civName, index) {
                var count = groups[civName];
                var layers = Math.min(4, count);
                var offset = Math.max(1.25, size * 0.13);
                var x = total.col * blockSize + blockSize - size - 1 - index * Math.max(3, size * 0.58);
                var y = total.row * blockSize + blockSize - size - 1;
                for (var layer = layers - 1; layer >= 0; layer--) {
                    var layerX = x - layer * offset;
                    var layerY = y - layer * offset;
                    context.fillStyle = civColor(civName);
                    context.fillRect(layerX, layerY, size, size);
                    context.strokeStyle = civTextColor(civName);
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
