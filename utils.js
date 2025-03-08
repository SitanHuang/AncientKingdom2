function rollingAverage(pastData, newElement, len=4) {
  pastData.push(newElement);
  if (pastData.length > len) {
    pastData.shift();
  }
  const sum = pastData.reduce((acc, val) => acc + val, 0);
  const avg = sum / pastData.length;
  return avg;
}

function size(arr) {
  if (!Array.isArray(arr)) {
    throw new Error("Input must be an array");
  }

  let dimensions = [];
  while (Array.isArray(arr)) {
    dimensions.push(arr.length);
    arr = arr[0];
  }
  return dimensions;
}

function arrayDeepEqual(arr1, arr2) {
  if (arr1 === arr2) return true;
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    if (Array.isArray(arr1[i]) && Array.isArray(arr2[i])) {
      if (!deepEqual(arr1[i], arr2[i])) return false;
    } else if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}