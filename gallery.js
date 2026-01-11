
let GALLERY_DATA = [];
let galleryIndex = 0;

function galleryDisp(jumpToLast) {
  if (jumpToLast && galleryIndex >= GALLERY_DATA.length - 2)
    galleryIndex = GALLERY_DATA.length - 1;

  galleryIndex = Math.min(GALLERY_DATA.length - 1, Math.max(galleryIndex, 0));
  const snapshot = GALLERY_DATA[galleryIndex];

  const $gallery = $('#gallery');

  const $table = $('<table></table>');

  for (const key in snapshot) {
    if (key == 'img') {
      $gallery.find('.img-con img')[0].replaceWith(snapshot.img);
    } else {
      const $tr = $('<tr/>');
      $tr.append($('<th>').text(key));
      $tr.append($('<td>').text(snapshot[key]));
      $table.append($tr);
    }
  }

  $gallery.find('.top-nav .navHeader')
    .text(`Snapshot ${galleryIndex + 1}/${GALLERY_DATA.length}`);
  $gallery.find('.top-nav .size')
    .text(`${Math.round(galleryTotalSizeMB() * 100) / 100} MiB`);
  $gallery.find('.center-nav .navHeader')
    .text(`Year ${snapshot.year}`);
  $gallery.find('.navInfos').html('').append($table);
}

function galleryTotalSizeMB() {
  return GALLERY_DATA.reduce((s, x) => s + new Blob([x.img.src]).size, 0) / 1024 / 1024;
}

function downloadGallery() {
  let zip = new JSZip();

  const hz = 33;
  const q = (t) => Math.round(t * hz) / hz;
  const qUp = (t) => Math.ceil(t * hz) / hz;

  let ffmpegCommand = `ffmpeg \\\n`;
  let loopsCommand = ``;
  let fadeCommand = ``;

  const crossFadeTime = q(1);

  // minimum "waiting" time between crossfades:
  // existing 1s + extra 1.818s (quantized to 33hz)
  const extraWait = qUp(1.818);
  const minWait = qUp(1 + extraWait);

  // dur = crossFadeTime + wait, so dur_min = 1 + (1 + 1.818) = 3.818 (quantized up)
  const minDur = qUp(crossFadeTime + minWait);

  // keep original cap concept, but ensure it's never below minDur
  const maxDur = Math.max(minDur, qUp(4));

  // about 2000 years in 40 min
  const targetYears = 2000;
  const targetSeconds = 40 * 60;

  let yearsMin = Infinity;
  let yearsMax = -Infinity;
  for (const snapshot of GALLERY_DATA) {
    yearsMin = Math.min(yearsMin, snapshot.year);
    yearsMax = Math.max(yearsMax, snapshot.year);
  }
  let yearsSpan = Math.max(0, yearsMax - yearsMin);

  let prevYear = 0;
  let durs = [];
  let yearDiffs = [];

  let i = -1;
  for (const snapshot of GALLERY_DATA) {
    let yearDiff = snapshot.year - prevYear;

    let dur = 2 * Math.max(1, yearDiff / GALLERY_MIN_YEARS);
    dur = Math.min(maxDur, Math.max(minDur, dur));
    dur = qUp(dur);

    yearDiffs.push(yearDiff);
    durs.push(dur);

    prevYear = snapshot.year;
    i++;
  }

  // scale durations to fit targetSeconds when span is around targetYears (or more)
  if (GALLERY_DATA.length > 1 && yearsSpan >= targetYears) {
    let total = 0;
    for (let k = 0; k < durs.length; k++) total += durs[k];
    total = total - crossFadeTime * (durs.length - 1);

    let scale = total > 0 ? (targetSeconds / total) : 1;

    for (let k = 0; k < durs.length; k++) {
      let dur = durs[k] * scale;
      dur = Math.min(maxDur, Math.max(minDur, dur));
      durs[k] = qUp(dur);
    }
  }

  let fadeOffset = 0;

  i = -1;
  prevYear = 0;
  for (const snapshot of GALLERY_DATA) {
    const { filename, u8arr } = dataURLtoFile(
      snapshot.img.src,
      `#${(++i).toString().padStart(3, "0")} Year ${snapshot.year}`
    );
    zip.file(filename, u8arr);

    let dur = durs[i];

    loopsCommand += `-loop 1 -t ${dur} -i "${filename}" \\\n`;

    fadeOffset = qUp(dur + fadeOffset - crossFadeTime);

    if (i < GALLERY_DATA.length - 1)
      fadeCommand += `[${i == 0 ? "0" : `v${i}`}][${i + 1}]` +
        `xfade=transition=fade:duration=${crossFadeTime}:offset=${fadeOffset}`;

    if (i < GALLERY_DATA.length - 2)
      fadeCommand += `[v${i + 1}]; \\\n`;

    prevYear = snapshot.year;
  }

  ffmpegCommand += loopsCommand +
    "-filter_complex \"\n" +
    fadeCommand +
    `" out.mp4`;

  console.log(ffmpegCommand);
  console.log(ffmpegCommand.replace(/ \\\n/gm, " "));

  zip.file("ffmpeg.sh", ffmpegCommand);
  zip.file("ffmpeg.bat", ffmpegCommand.replace(/ \\\n/gm, " "));

  let j = -1;
  zip.file("info.json", JSON.stringify(GALLERY_DATA.map(x => {
    let obj = Object.assign({}, x);
    delete obj.img;
    obj.fname = `#${(++j).toString().padStart(3, "0")} Year ${x.year}`;
    return obj;
  })));

  zip.generateAsync({ type: "base64" }).then(function (base64) {
    var element = document.createElement('a');
    element.setAttribute('href', "data:application/zip;base64," + base64);
    element.setAttribute('download', "gallery.zip");

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  });

}
