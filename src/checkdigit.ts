export const CheckDigit = (trk: string, multipliers: number[], mod: 10 | 11): boolean => {
  let checkDigit: number;
  let midX = 0;
  let sum = 0;
  for (
    let index = 0, end = trk.length - 2, asc = end >= 0;
    asc ? index <= end : index >= end;
    asc ? index++ : index--
  ) {
    sum += parseInt(trk[index], 10) * multipliers[midX];
    midX = midX === multipliers.length - 1 ? 0 : midX + 1;
  }
  if (mod === 11) {
    checkDigit = sum % 11;
    if (checkDigit === 10) {
      checkDigit = 0;
    }
  }
  if (mod === 10) {
    checkDigit = 0;
    if (sum % 10 > 0) {
      checkDigit = 10 - (sum % 10);
    }
  }
  return checkDigit === parseInt(trk[trk.length - 1]);
};
