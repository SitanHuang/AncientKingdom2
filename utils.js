function rollingAverage(pastData, newElement, len=4) {
  pastData.push(newElement);
  if (pastData.length > len) {
    pastData.shift();
  }
  const sum = pastData.reduce((acc, val) => acc + val, 0);
  const avg = sum / pastData.length;
  return avg;
}