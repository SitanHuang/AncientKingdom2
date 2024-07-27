
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

  let ffmpegCommand = `ffmpeg \\\n`;
  let loopsCommand = ``;
  let fadeCommand = ``;

  const crossFadeTime = 1;
  let fadeOffset = 0;

  let i = -1;
  let prevYear = 0;
  for (const snapshot of GALLERY_DATA) {
    const { filename, u8arr } = dataURLtoFile(
      snapshot.img.src,
      `#${(++i).toString().padStart(3, "0")} Year ${snapshot.year}`
    );
    zip.file(filename, u8arr);

    // generate ffmpeg command

    let yearDiff = snapshot.year - prevYear;

    let dur = Math.min(4, 2 * Math.max(1, yearDiff / GALLERY_MIN_YEARS));

    loopsCommand += `-loop 1 -t ${dur} -i "${filename}" \\\n`;

    fadeOffset = dur + fadeOffset - crossFadeTime;

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
  zip.file("info.json", JSON.stringify(GALLERY_DATA.map(x => {
    let obj = Object.assign({}, x);
    delete obj.img;
    obj.fname = `#${(++i).toString().padStart(3, "0")} Year ${x.year}`;
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