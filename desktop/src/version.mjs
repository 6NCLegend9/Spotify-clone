export function semanticVersionParts(value) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function versionOlderThan(installed, minimum) {
  const left = semanticVersionParts(installed);
  const right = semanticVersionParts(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return true;
    if (left[index] > right[index]) return false;
  }
  return false;
}


function semanticRelease(value) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return Number(a) < Number(b) ? -1 : 1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function compareReleaseVersions(leftValue, rightValue) {
  const left = semanticRelease(leftValue);
  const right = semanticRelease(rightValue);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] < right.core[index]) return -1;
    if (left.core[index] > right.core[index]) return 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}
